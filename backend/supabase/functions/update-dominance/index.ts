import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CONTESTED_THRESHOLD = 0.10

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

serve(async (_req: Request) => {
  // Fetch active territories (visited in last 12h)
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  const territoriesRes = await db(`territories?last_visit_at=gt.${cutoff}&select=domain`)
  if (!territoriesRes.ok) {
    return new Response(`Failed to fetch territories: ${await territoriesRes.text()}`, { status: 500 })
  }
  const territories: { domain: string }[] = await territoriesRes.json()

  let updated = 0

  for (const { domain } of territories) {
    // Count visits per faction in 12h window
    const eventsRes = await db(
      `browse_events?domain=eq.${encodeURIComponent(domain)}&created_at=gt.${cutoff}&flagged=eq.false&select=faction`
    )
    if (!eventsRes.ok) continue
    const events: { faction: string }[] = await eventsRes.json()
    if (events.length === 0) continue

    // Tally by faction
    const counts: Record<string, number> = {}
    for (const e of events) counts[e.faction] = (counts[e.faction] ?? 0) + 1

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const total = events.length
    const [topFaction, topCount] = sorted[0]
    const secondCount = sorted[1]?.[1] ?? 0

    // Contested: gap between 1st and 2nd < 10% of total
    const isContested = (topCount - secondCount) / total < CONTESTED_THRESHOLD

    await db(`territories?domain=eq.${encodeURIComponent(domain)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        dominant_faction: topFaction,
        is_contested: isContested,
        last_dominant_update: new Date().toISOString(),
      }),
    })
    updated++
  }

  console.log(`update-dominance: processed ${territories.length} territories, updated ${updated}`)
  return new Response(JSON.stringify({ ok: true, processed: territories.length, updated }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
