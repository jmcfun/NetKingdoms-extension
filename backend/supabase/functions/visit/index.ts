import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature, X-Visit-Mode, X-Anonymous-Id',
}

const TIER_VALUES: Record<string, number> = { S: 10, A: 5, B: 2, C: 1, D: 0 }

function db(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((opts.headers ?? {}) as Record<string, string>),
    },
  })
}

function hexToUint8(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

async function verifyHmac(secret: string, message: string, expectedHex: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, hexToUint8(expectedHex), enc.encode(message))
}

function decodeJwt(token: string) {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try { return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return null }
}

async function upsertUser(userId: string, email: string | null, faction: string) {
  const res = await db('users?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ id: userId, email, faction, last_active_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`upsertUser ${res.status}: ${await res.text()}`)
}

async function insertBrowseEvents(events: any[], userId: string) {
  const rows = events.map((v) => ({
    user_id: userId,
    domain: v.domain,
    url: v.url ?? '',
    tier: v.meta?.tier ?? 'D',
    zone: v.meta?.zone ?? 'Neutre',
    faction: v.faction ?? 'Fondeurs',
    created_at: v.createdAt,
  }))
  const res = await db('browse_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`insertBrowseEvents ${res.status}: ${await res.text()}`)
}

async function ensureTerritories(events: any[], userId: string, faction: string): Promise<number> {
  const rows = events.map((v) => {
    const tier = v.meta?.tier ?? 'D'
    const value = tier === 'D' ? Math.floor(Math.random() * 8) + 1 : (TIER_VALUES[tier] ?? 1)
    return {
      domain: v.domain,
      tier,
      zone: v.meta?.zone ?? 'Neutre',
      first_seen_by: userId,
      first_seen_faction: faction,
      value_snapshot: value,
      last_visit_at: new Date().toISOString(),
    }
  })

  // Insert new territories — first discovery wins, return newly created rows
  const insertRes = await db('territories?on_conflict=domain', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(rows),
  })
  if (!insertRes.ok) throw new Error(`insertTerritories ${insertRes.status}: ${await insertRes.text()}`)
  const newDiscoveries: any[] = insertRes.ok ? await insertRes.json() : []

  // Refresh last_visit_at on all visited territories
  const domainList = events.map((v) => `"${v.domain}"`).join(',')
  const patchRes = await db(`territories?domain=in.(${domainList})`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_visit_at: new Date().toISOString() }),
  })
  if (!patchRes.ok) console.error('patch last_visit_at:', await patchRes.text())

  return newDiscoveries.length  // number of genuinely new territories discovered
}

function getWeekNumber(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return {
    week: Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7),
    year: d.getUTCFullYear(),
  }
}

async function isChallengeValid(userId: string): Promise<boolean> {
  const { week, year } = getWeekNumber(new Date())
  const res = await db(`challenges?week_number=eq.${week}&year=eq.${year}&limit=1`)
  if (!res.ok) return true  // fail open on error
  const [challenge] = await res.json()
  if (!challenge) return true  // no challenge this week → all visits valid

  const now = new Date()
  const expired = new Date(challenge.expires_at) < now

  if (!expired) return true  // still within 72h window → all visits valid

  // Challenge expired — check if user completed it
  const compRes = await db(`challenge_completions?user_id=eq.${userId}&challenge_id=eq.${challenge.id}&select=completed_at`)
  if (!compRes.ok) return true  // fail open
  const comps = await compRes.json()
  return comps.length > 0  // valid only if completed
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

async function incrementClanScore(userId: string, visitCount: number) {
  // Get user's clan_id and account age for progressive trust
  const userRes = await db(`users?id=eq.${userId}&select=clan_id,created_at`)
  if (!userRes.ok) return
  const [user] = await userRes.json()
  if (!user?.clan_id) return

  const accountAgeMs = Date.now() - new Date(user.created_at).getTime()
  const isNewAccount = accountAgeMs < SEVEN_DAYS_MS

  // Progressive trust: new accounts contribute at 50% (probabilistic per visit)
  const effectiveCount = isNewAccount
    ? Math.floor(visitCount * 0.5)
    : visitCount

  if (effectiveCount <= 0) return

  await db('rpc/increment_clan_score', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId, p_amount: effectiveCount }),
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  const rawBody = await req.text()
  const authHeader = req.headers.get('authorization')
  const signatureHeader = req.headers.get('x-signature')
  const anonymousId = req.headers.get('x-anonymous-id')

  if (authHeader?.startsWith('Bearer ') && signatureHeader) {
    const token = authHeader.slice(7)
    if (!(await verifyHmac(token, rawBody, signatureHeader)))
      return new Response('Invalid signature', { status: 401, headers: CORS })
  }

  let body: any
  try { body = JSON.parse(rawBody) } catch {
    return new Response('Invalid payload', { status: 400, headers: CORS })
  }
  if (!Array.isArray(body.visits) || body.visits.length === 0)
    return new Response('Visits must be a non-empty array', { status: 400, headers: CORS })

  const user = authHeader?.startsWith('Bearer ') ? decodeJwt(authHeader.slice(7)) : null
  const userId = user?.sub ?? anonymousId ?? `anon-${crypto.randomUUID()}`
  const email = user?.email ?? null
  const faction = body.visits[0]?.faction ?? 'Fondeurs'

  // Kingdom Challenge gate — block visits if challenge expired and not completed
  const challengeOk = await isChallengeValid(userId)
  if (!challengeOk) {
    return new Response(JSON.stringify({
      ok: false,
      challenge_required: true,
      message: 'Complète le Kingdom Challenge de la semaine pour valider tes visites.',
    }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // Shadow throttle gate — silently drop visits for throttled users
  const userCheckRes = await db(`users?id=eq.${userId}&select=shadow_throttle`)
  if (userCheckRes.ok) {
    const [u] = await userCheckRes.json()
    if (u?.shadow_throttle) {
      // Return OK silently — user doesn't know they're throttled
      return new Response(JSON.stringify({ ok: true, received: body.visits.length, userId }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
  }

  let newDiscoveries = 0
  try {
    await upsertUser(userId, email, faction)
    await insertBrowseEvents(body.visits, userId)
    newDiscoveries = await ensureTerritories(body.visits, userId, faction)
    // Clan score: visits + discovery bonus (+1 per new territory)
    const total = body.visits.length + newDiscoveries
    incrementClanScore(userId, total).catch((e) => console.error('clan score:', e))
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('visit error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    ok: true, received: body.visits.length, userId,
    new_discoveries: newDiscoveries,
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
})
