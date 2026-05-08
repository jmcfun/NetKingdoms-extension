import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature, X-Visit-Mode, X-Anonymous-Id',
}

function hexToUint8(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function verifyHmac(secret: string, message: string, expectedHex: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const expected = hexToUint8(expectedHex)
  return crypto.subtle.verify('HMAC', key, expected, encoder.encode(message))
}

function decodeJwt(token: string) {
  const parts = token.split('.')
  if (parts.length < 2) return null
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  try {
    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'return=minimal',
  }
}

async function upsertUser(userId: string, email: string | null, faction: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=id`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ id: userId, email, faction }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`upsertUser ${res.status}: ${text}`)
  }
}

async function insertBrowseEvents(events: Array<any>, userId: string) {
  const rows = events.map((v) => ({
    user_id: userId,
    domain: v.domain,
    url: v.url,
    tier: v.meta?.tier ?? 'D',
    zone: v.meta?.zone ?? 'Neutre',
    created_at: v.createdAt,
  }))
  const res = await fetch(`${SUPABASE_URL}/rest/v1/browse_events`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`insertBrowseEvents ${res.status}: ${text}`)
  }
}

async function ensureTerritories(events: Array<any>, userId: string, faction: string) {
  const rows = events.map((v) => ({
    domain: v.domain,
    tier: v.meta?.tier ?? 'D',
    zone: v.meta?.zone ?? 'Neutre',
    first_seen_by: userId,
    first_seen_faction: faction,
  }))
  const res = await fetch(`${SUPABASE_URL}/rest/v1/territories?on_conflict=domain`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ensureTerritories ${res.status}: ${text}`)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Server configuration missing', { status: 500, headers: CORS })
  }

  const rawBody = await req.text()
  const authHeader = req.headers.get('authorization')
  const signatureHeader = req.headers.get('x-signature')
  const anonymousId = req.headers.get('x-anonymous-id')

  if (authHeader?.startsWith('Bearer ') && signatureHeader) {
    const token = authHeader.slice(7)
    const valid = await verifyHmac(token, rawBody, signatureHeader)
    if (!valid) {
      return new Response('Invalid signature', { status: 401, headers: CORS })
    }
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid payload', { status: 400, headers: CORS })
  }

  if (!Array.isArray(body.visits) || body.visits.length === 0) {
    return new Response('Visits must be a non-empty array', { status: 400, headers: CORS })
  }

  const user = authHeader?.startsWith('Bearer ') ? decodeJwt(authHeader.slice(7)) : null
  const userId = user?.sub ?? anonymousId ?? `anon-${crypto.randomUUID()}`
  const email = user?.email ?? null
  const faction = body.visits[0]?.faction ?? 'Fondeurs'

  try {
    await upsertUser(userId, email, faction)
    await insertBrowseEvents(body.visits, userId)
    await ensureTerritories(body.visits, userId, faction)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('NetKingdoms backend error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, received: body.visits.length, userId }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
