import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

async function pickByTier(tier: string, excludeDomains: string[], limit: number) {
  const excludeClause = excludeDomains.length > 0
    ? `&domain=not.in.(${excludeDomains.map((d) => `"${d}"`).join(',')})`
    : ''
  const res = await db(
    `territories?tier=eq.${tier}${excludeClause}&is_ephemeral=eq.false&select=domain&limit=${limit * 5}`
  )
  if (!res.ok) return []
  const rows: { domain: string }[] = await res.json()
  if (rows.length === 0) return []
  // Random selection
  const shuffled = rows.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, limit).map((r) => r.domain)
}

serve(async (_req: Request) => {
  // Clear previous ephemerals
  await db('territories?is_ephemeral=eq.true', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ is_ephemeral: false }),
  })
  await db('ephemeral_sites', {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  // Get recent ephemeral history (last 2 weeks) to avoid repeats
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const historyRes = await db(`ephemeral_sites?start_at=gt.${twoWeeksAgo}&select=domain`)
  const recentDomains: string[] = historyRes.ok
    ? (await historyRes.json()).map((r: any) => r.domain)
    : []

  // Pick sites following GDD section 5.2
  const tierS = await pickByTier('S', recentDomains, 1)
  const tierAB = await pickByTier('A', [...recentDomains, ...tierS], 1)
  const tierB2 = await pickByTier('B', [...recentDomains, ...tierS, ...tierAB], 1)
  const tierCD = await pickByTier('D', [...recentDomains, ...tierS, ...tierAB, ...tierB2], 1)

  const selected = [...tierS, ...tierAB, ...tierB2, ...tierCD].slice(0, 5)
  if (selected.length === 0) {
    return new Response(JSON.stringify({ ok: true, selected: 0, message: 'No eligible territories' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const startAt = new Date().toISOString()
  const endAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  // Mark territories as ephemeral
  const domainList = selected.map((d) => `"${d}"`).join(',')
  await db(`territories?domain=in.(${domainList})`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ is_ephemeral: true }),
  })

  // Fetch tier/zone for the selected domains for ephemeral_sites table
  const infoRes = await db(`territories?domain=in.(${domainList})&select=domain,tier,zone`)
  const infos: any[] = infoRes.ok ? await infoRes.json() : []

  // Insert into ephemeral_sites
  const ephemeralRows = infos.map((t) => ({
    domain: t.domain,
    tier: t.tier,
    zone: t.zone,
    start_at: startAt,
    end_at: endAt,
    multiplier: 5,
  }))

  if (ephemeralRows.length > 0) {
    await db('ephemeral_sites', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(ephemeralRows),
    })
  }

  console.log(`manage-ephemeral: selected ${selected.length} sites:`, selected)
  return new Response(JSON.stringify({ ok: true, selected: selected.length, domains: selected }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
