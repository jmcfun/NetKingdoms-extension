import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Thresholds (GDD section 6.2)
const DIVERSITY_THRESHOLD = 0.15   // < 15% unique domains over 7d → flag
const VELOCITY_MAX_PER_HOUR = 30   // > 30 visits/h (server-side) → flag
const CLAN_SPIKE_THRESHOLD = 0.80  // > 80% of clan visits on 1 domain in 2h → flag
const MIN_EVENTS_TO_ANALYZE = 20   // ignore users with < 20 events (not enough data)

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

async function flagUser(userId: string, reason: string, severity: string) {
  await db('audit_flags', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, reason, severity, auto_detected: true }),
  })
}

async function shadowThrottle(userId: string) {
  await db(`users?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ shadow_throttle: true }),
  })
}

serve(async (_req: Request) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  let flaggedCount = 0
  let throttledCount = 0

  // ── 1. Diversity score check ──────────────────────────────────────────────
  // Group browse_events by user, count total vs unique domains over 7 days
  const eventsRes = await db(
    `browse_events?created_at=gt.${sevenDaysAgo}&flagged=eq.false&select=user_id,domain`
  )
  if (eventsRes.ok) {
    const events: { user_id: string; domain: string }[] = await eventsRes.json()

    // Build per-user stats
    const stats: Record<string, { total: number; domains: Set<string> }> = {}
    for (const e of events) {
      if (!stats[e.user_id]) stats[e.user_id] = { total: 0, domains: new Set() }
      stats[e.user_id].total++
      stats[e.user_id].domains.add(e.domain)
    }

    for (const [userId, s] of Object.entries(stats)) {
      if (s.total < MIN_EVENTS_TO_ANALYZE) continue
      const diversityScore = s.domains.size / s.total
      if (diversityScore < DIVERSITY_THRESHOLD) {
        await flagUser(userId, `Diversity score trop faible: ${(diversityScore * 100).toFixed(1)}% (${s.domains.size} domaines uniques / ${s.total} visites sur 7j)`, 'warning')
        flaggedCount++
      }
    }
  }

  // ── 2. Velocity anomaly check ─────────────────────────────────────────────
  // Count visits per user in last hour; flag if > 30 despite client-side cap
  const hourlyRes = await db(
    `browse_events?created_at=gt.${oneHourAgo}&flagged=eq.false&select=user_id`
  )
  if (hourlyRes.ok) {
    const hourly: { user_id: string }[] = await hourlyRes.json()
    const counts: Record<string, number> = {}
    for (const e of hourly) counts[e.user_id] = (counts[e.user_id] ?? 0) + 1

    for (const [userId, count] of Object.entries(counts)) {
      if (count > VELOCITY_MAX_PER_HOUR) {
        // This means the client bypassed local checks — shadow throttle immediately
        await flagUser(userId, `Velocity anormale: ${count} visites/h (max ${VELOCITY_MAX_PER_HOUR})`, 'high')
        await shadowThrottle(userId)
        // Flag all recent events from this user
        await db(`browse_events?user_id=eq.${userId}&created_at=gt.${oneHourAgo}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ flagged: true }),
        })
        flaggedCount++
        throttledCount++
      }
    }
  }

  // ── 3. Clan spike detection ───────────────────────────────────────────────
  const clansRes = await db('clans?select=id,name')
  if (clansRes.ok) {
    const clans: { id: string; name: string }[] = await clansRes.json()

    for (const clan of clans) {
      // Get all members
      const membersRes = await db(`users?clan_id=eq.${clan.id}&select=id`)
      if (!membersRes.ok) continue
      const members: { id: string }[] = await membersRes.json()
      if (members.length === 0) continue

      const memberIds = members.map((m) => `"${m.id}"`).join(',')
      const clanEventsRes = await db(
        `browse_events?user_id=in.(${memberIds})&created_at=gt.${twoHoursAgo}&flagged=eq.false&select=domain`
      )
      if (!clanEventsRes.ok) continue
      const clanEvents: { domain: string }[] = await clanEventsRes.json()
      if (clanEvents.length < 10) continue // not enough data

      // Find most concentrated domain
      const domainCounts: Record<string, number> = {}
      for (const e of clanEvents) domainCounts[e.domain] = (domainCounts[e.domain] ?? 0) + 1
      const maxDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]
      const concentration = maxDomain[1] / clanEvents.length

      if (concentration > CLAN_SPIKE_THRESHOLD) {
        // Flag all members
        for (const member of members) {
          await flagUser(member.id, `Spike de clan "${clan.name}": ${(concentration * 100).toFixed(0)}% des visites sur ${maxDomain[0]} en 2h`, 'warning')
        }
        flaggedCount += members.length
      }
    }
  }

  // ── 4. Update trust levels ────────────────────────────────────────────────
  // New users (<7d) → trust 0; 7-30d → trust 1; >30d → trust 2
  await db('users', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ trust_level: 0 }),
  })
  // This is a rough approach — in production use a proper computed column or RPC

  console.log(`detect-anomalies: ${flaggedCount} flags, ${throttledCount} shadow-throttled`)
  return new Response(JSON.stringify({ ok: true, flagged: flaggedCount, throttled: throttledCount }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
