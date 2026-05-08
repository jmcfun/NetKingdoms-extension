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

serve(async (_req: Request) => {
  const now = Date.now()
  const inactive48h = new Date(now - 48 * 60 * 60 * 1000).toISOString()
  const purge72h = new Date(now - 72 * 60 * 60 * 1000).toISOString()

  // Mark inactive: clear dominant_faction for territories with no visits in 48h
  const inactiveRes = await db(
    `territories?last_visit_at=lt.${inactive48h}&dominant_faction=not.is.null`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ dominant_faction: null, is_contested: false }),
    }
  )

  // Expire ephemeral sites past their end_at
  const ephemeralsRes = await db('ephemeral_sites?end_at=lt.' + new Date().toISOString())
  if (ephemeralsRes.ok) {
    const expired: { domain: string }[] = await ephemeralsRes.json()
    if (expired.length > 0) {
      const domainList = expired.map((e) => `"${e.domain}"`).join(',')
      await db(`territories?domain=in.(${domainList})`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_ephemeral: false }),
      })
      await db(`ephemeral_sites?end_at=lt.${new Date().toISOString()}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      })
    }
  }

  // Purge territories not visited in 72h
  // First remove related season_snapshots to avoid FK violation
  await db(`season_snapshots?domain=in.(SELECT domain FROM territories WHERE last_visit_at < '${purge72h}')`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  const purgeRes = await db(`territories?last_visit_at=lt.${purge72h}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal,count=exact' },
  })

  const purgedCount = purgeRes.headers.get('content-range')?.split('/')[1] ?? '?'

  // ── Clan: auto-succession for inactive leaders (14 days) ─────────────────
  const leaderCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()
  const clansRes = await db('clans?select=id,leader_id,name')
  let successions = 0
  if (clansRes.ok) {
    const clans: { id: string; leader_id: string; name: string }[] = await clansRes.json()
    for (const clan of clans) {
      // Check if leader is inactive
      const leaderRes = await db(`users?id=eq.${clan.leader_id}&select=last_active_at`)
      if (!leaderRes.ok) continue
      const [leader] = await leaderRes.json()
      if (!leader || (leader.last_active_at && leader.last_active_at > leaderCutoff)) continue

      // Find most active member as successor
      const membersRes = await db(
        `users?clan_id=eq.${clan.id}&id=neq.${clan.leader_id}&select=id,last_active_at&order=last_active_at.desc.nullslast&limit=1`
      )
      if (!membersRes.ok) continue
      const [nextLeader] = await membersRes.json()
      if (!nextLeader) continue // No other members → keep leader (they'll be purged by dissolution)

      await db(`clans?id=eq.${clan.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ leader_id: nextLeader.id }),
      })
      successions++
      console.log(`Clan "${clan.name}": leadership transferred to ${nextLeader.id}`)
    }
  }

  // ── Clan: auto-dissolution for fully inactive clans (30 days) ────────────
  const dissolveCtoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  let dissolved = 0
  if (clansRes.ok) {
    const clans: { id: string; name: string }[] = await clansRes.json()
    for (const clan of clans) {
      // Check all members inactive
      const activeRes = await db(
        `users?clan_id=eq.${clan.id}&last_active_at=gt.${dissolveCtoff}&select=id&limit=1`
      )
      if (!activeRes.ok) continue
      const activeMembers = await activeRes.json()
      if (activeMembers.length > 0) continue // Has active members

      // Dissolve: remove all clan_ids, delete clan
      await db(`users?clan_id=eq.${clan.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ clan_id: null }),
      })
      await db(`clans?id=eq.${clan.id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      })
      dissolved++
      console.log(`Clan "${clan.name}" dissolved (all members inactive > 30d)`)
    }
  }

  console.log(`cleanup-territories: purged ${purgedCount} territories, ${successions} successions, ${dissolved} clan dissolutions`)
  return new Response(JSON.stringify({ ok: true, purged: purgedCount, successions, dissolved }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
