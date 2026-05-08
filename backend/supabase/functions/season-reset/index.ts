import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FACTION_BONUS: Record<string, string> = {
  Fondeurs: 'Tech & Dev', Spectres: 'Social & News', Nomades: 'Culture & Niche',
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
  // ── 1. Get current active season ─────────────────────────────────────────
  const seasonRes = await db('seasons?is_active=eq.true&limit=1')
  if (!seasonRes.ok) return new Response('Failed to get season', { status: 500 })
  const [season] = await seasonRes.json()
  if (!season) return new Response('No active season', { status: 404 })

  // ── 2. Calculate final stats ──────────────────────────────────────────────
  const winner = (['Fondeurs', 'Spectres', 'Nomades'] as const).reduce((a, b) =>
    (season[`${a.toLowerCase()}_score`] ?? 0) >= (season[`${b.toLowerCase()}_score`] ?? 0) ? a : b
  )

  const snapshotCountRes = await db(`season_snapshots?season_id=eq.${season.id}&select=id`)
  const snapshotCount = snapshotCountRes.ok ? (await snapshotCountRes.json()).length : 0

  const territoryCountRes = await db('territories?select=domain')
  const territoryCount = territoryCountRes.ok ? (await territoryCountRes.json()).length : 0

  // ── 3. Archive current season ─────────────────────────────────────────────
  await db(`seasons?id=eq.${season.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      is_active: false,
      ended_at: new Date().toISOString(),
      winner_faction: winner,
      total_territories: territoryCount,
      total_snapshots: snapshotCount,
    }),
  })

  // ── 4. Grant rewards to top players ───────────────────────────────────────
  // Top faction badge: all users of winning faction get "Conquérant S[n]"
  const winnerUsersRes = await db(`users?faction=eq.${encodeURIComponent(winner)}&select=id`)
  if (winnerUsersRes.ok) {
    const users: { id: string }[] = await winnerUsersRes.json()
    if (users.length > 0) {
      const rewards = users.map((u) => ({
        user_id: u.id,
        season_id: season.id,
        type: 'top_faction',
        label: `Conquérant S${season.number}`,
        icon: '👑',
      }))
      await db('rewards', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(rewards),
      })
    }
  }

  // Top 3 clans per faction + global top 10% get badge
  const clansRes = await db('clans?select=id,name,faction,season_score&order=season_score.desc')
  if (clansRes.ok) {
    const allClans: { id: string; name: string; faction: string; season_score: number }[] = await clansRes.json()
    const FACTIONS = ['Fondeurs', 'Spectres', 'Nomades']

    for (const fac of FACTIONS) {
      const facClans = allClans.filter((c) => c.faction === fac)
      // Top 3 per faction
      for (let i = 0; i < Math.min(3, facClans.length); i++) {
        const clan = facClans[i]
        const membersRes = await db(`users?clan_id=eq.${clan.id}&select=id`)
        if (!membersRes.ok) continue
        const members: { id: string }[] = await membersRes.json()
        const medal = ['🥇', '🥈', '🥉'][i]
        const rewards = members.map((u) => ({
          user_id: u.id, season_id: season.id,
          type: 'top_clan', label: `${medal} Top clan S${season.number} — ${clan.name}`, icon: medal,
        }))
        if (rewards.length > 0) {
          await db('rewards', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rewards) })
        }
      }
    }

    // Global top 10% clans
    const top10pctCount = Math.max(1, Math.floor(allClans.length * 0.1))
    const top10pct = allClans.slice(0, top10pctCount)
    for (const clan of top10pct) {
      const membersRes = await db(`users?clan_id=eq.${clan.id}&select=id`)
      if (!membersRes.ok) continue
      const members: { id: string }[] = await membersRes.json()
      const rewards = members.map((u) => ({
        user_id: u.id, season_id: season.id,
        type: 'top_pct', label: `Top 10% S${season.number}`, icon: '⭐',
      }))
      if (rewards.length > 0) {
        await db('rewards', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rewards) })
      }
    }
  }

  // Participation badge: all users who made at least 1 visit this season
  const activeUsersRes = await db(
    `browse_events?created_at=gt.${season.started_at}&select=user_id`
  )
  if (activeUsersRes.ok) {
    const events: { user_id: string }[] = await activeUsersRes.json()
    const uniqueUsers = [...new Set(events.map((e) => e.user_id))]
    if (uniqueUsers.length > 0) {
      const participationRewards = uniqueUsers.map((uid) => ({
        user_id: uid,
        season_id: season.id,
        type: 'participation',
        label: `Explorateur S${season.number}`,
        icon: '🗺️',
      }))
      await db('rewards', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(participationRewards),
      })
    }
  }

  // ── 5. Reset scores ───────────────────────────────────────────────────────
  // Reset user season scores + unlock faction for new season
  await db('users', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      season_score: 0,
      faction_locked_season: season.number + 1, // unlocked by extension on new season
    }),
  })

  // Reset clan scores
  await db('clans', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ season_score: 0 }),
  })

  // ── 6. Start new season ───────────────────────────────────────────────────
  const newSeasonRes = await db('seasons', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      number: season.number + 1,
      started_at: new Date().toISOString(),
      is_active: true,
    }),
  })
  const [newSeason] = newSeasonRes.ok ? await newSeasonRes.json() : [null]

  // ── 7. Purge old browse_events (30-day privacy policy) ───────────────────
  await db('browse_events?created_at=lt.' + new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  console.log(`season-reset: S${season.number} → S${season.number + 1}, winner: ${winner}`)
  return new Response(JSON.stringify({
    ok: true,
    archived_season: season.number,
    new_season: newSeason?.number,
    winner,
    rewards_granted: snapshotCount > 0,
  }), { headers: { 'Content-Type': 'application/json' } })
})
