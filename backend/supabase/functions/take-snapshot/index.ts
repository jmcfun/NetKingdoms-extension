import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FACTION_ZONE_BONUS: Record<string, string> = {
  Fondeurs: 'Tech & Dev',
  Spectres: 'Social & News',
  Nomades: 'Culture & Niche',
}

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
  // Get active season
  const seasonRes = await db('seasons?is_active=eq.true&limit=1')
  if (!seasonRes.ok) return new Response('Failed to fetch season', { status: 500 })
  const seasons = await seasonRes.json()
  if (seasons.length === 0) return new Response('No active season', { status: 404 })
  const season = seasons[0]

  // Get all dominated territories
  const territoriesRes = await db(
    'territories?dominant_faction=not.is.null&select=domain,zone,dominant_faction,value_snapshot,is_contested,is_ephemeral'
  )
  if (!territoriesRes.ok) return new Response('Failed to fetch territories', { status: 500 })
  const territories: any[] = await territoriesRes.json()

  const snapshots = []
  const factionPoints: Record<string, number> = { Fondeurs: 0, Spectres: 0, Nomades: 0 }

  for (const t of territories) {
    const faction = t.dominant_faction
    const bonusZone = FACTION_ZONE_BONUS[faction]
    const factionBonus = t.zone === bonusZone ? 1.5 : 1.0
    const ephemeralMultiplier = t.is_ephemeral ? 5 : 1
    const contestedMultiplier = t.is_contested ? 0.5 : 1.0

    const pts = Math.floor((t.value_snapshot ?? 1) * factionBonus * ephemeralMultiplier * contestedMultiplier)
    if (pts === 0) continue

    snapshots.push({
      season_id: season.id,
      domain: t.domain,
      dominant_faction: faction,
      points_awarded: pts,
      is_contested: t.is_contested,
      is_ephemeral: t.is_ephemeral,
    })

    factionPoints[faction] = (factionPoints[faction] ?? 0) + pts
  }

  // Insert snapshots
  if (snapshots.length > 0) {
    const insertRes = await db('season_snapshots', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(snapshots),
    })
    if (!insertRes.ok) console.error('insert snapshots:', await insertRes.text())
  }

  // Update season faction scores
  const patchRes = await db(`seasons?id=eq.${season.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      fondeurs_score: (season.fondeurs_score ?? 0) + (factionPoints.Fondeurs ?? 0),
      spectres_score: (season.spectres_score ?? 0) + (factionPoints.Spectres ?? 0),
      nomades_score: (season.nomades_score ?? 0) + (factionPoints.Nomades ?? 0),
    }),
  })
  if (!patchRes.ok) console.error('patch season scores:', await patchRes.text())

  console.log(`take-snapshot: ${snapshots.length} snapshots, points:`, factionPoints)
  return new Response(JSON.stringify({ ok: true, snapshots: snapshots.length, points: factionPoints }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
