import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function rpc(fn: string, args: Record<string, unknown>) {
  return db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
}

function decodeJwt(token: string) {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try { return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return null }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // ── Public: ladder ────────────────────────────────────────────────────────
  if (action === 'ladder') {
    const faction = url.searchParams.get('faction')
    const filter = faction ? `&faction=eq.${encodeURIComponent(faction)}` : ''
    const res = await db(
      `clans?select=id,name,faction,season_score,max_members&order=season_score.desc${filter}&limit=10`
    )
    if (!res.ok) return json({ error: await res.text() }, 500)
    const clans: any[] = await res.json()

    // Enrich with member count
    const enriched = await Promise.all(clans.map(async (c) => {
      const countRes = await db(`users?clan_id=eq.${c.id}&select=id`)
      const members = countRes.ok ? (await countRes.json()).length : 0
      return { ...c, member_count: members }
    }))
    return json(enriched)
  }

  // ── Authenticated actions ─────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Auth required' }, 401)
  const user = decodeJwt(authHeader.slice(7))
  if (!user?.sub) return json({ error: 'Invalid token' }, 401)
  const userId: string = user.sub

  // ── GET: user clan info ───────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'info') {
    const userRes = await db(`users?id=eq.${userId}&select=clan_id,faction`)
    if (!userRes.ok) return json({ error: 'User not found' }, 404)
    const [u] = await userRes.json()
    if (!u?.clan_id) return json(null)

    const clanRes = await db(
      `clans?id=eq.${u.clan_id}&select=id,name,faction,season_score,max_members,leader_id`
    )
    if (!clanRes.ok) return json(null)
    const [clan] = await clanRes.json()
    if (!clan) return json(null)

    const membersRes = await db(`users?clan_id=eq.${u.clan_id}&select=id,username,season_score,last_active_at`)
    const members = membersRes.ok ? await membersRes.json() : []

    // Rank in ladder
    const rankRes = await db(
      `clans?faction=eq.${clan.faction}&season_score=gt.${clan.season_score}&select=id`
    )
    const rank = rankRes.ok ? (await rankRes.json()).length + 1 : null

    return json({ ...clan, members, rank, is_leader: clan.leader_id === userId })
  }

  const body = req.method === 'POST' ? await req.json() : {}

  // ── POST: create clan ─────────────────────────────────────────────────────
  if (action === 'create') {
    const { name } = body
    if (!name || name.length < 3 || name.length > 20 || !/^[a-zA-Z0-9 _-]+$/.test(name)) {
      return json({ error: 'Nom invalide (3-20 caractères alphanumérique)' }, 400)
    }

    // Check user has no clan
    const userRes = await db(`users?id=eq.${userId}&select=clan_id,faction`)
    if (!userRes.ok) return json({ error: 'User error' }, 500)
    const [u] = await userRes.json()
    if (u?.clan_id) return json({ error: 'Tu es déjà dans un clan' }, 400)

    const res = await rpc('create_clan', { p_name: name, p_faction: u.faction ?? 'Fondeurs', p_leader_id: userId })
    if (!res.ok) {
      const err = await res.text()
      if (err.includes('unique')) return json({ error: 'Ce nom est déjà pris' }, 409)
      return json({ error: err }, 500)
    }
    const clanId = await res.json()
    return json({ ok: true, clan_id: clanId })
  }

  // ── POST: join clan ───────────────────────────────────────────────────────
  if (action === 'join') {
    const { clan_id } = body
    if (!clan_id) return json({ error: 'clan_id requis' }, 400)

    // 1. Get clan info
    const clanRes = await db(`clans?id=eq.${clan_id}&select=id,faction,max_members,name`)
    if (!clanRes.ok) return json({ error: 'Erreur DB clan' }, 500)
    const clanRows = await clanRes.json()
    if (clanRows.length === 0) return json({ error: 'Clan introuvable — vérifie l\'ID' }, 404)
    const clanData = clanRows[0]

    // 2. Check capacity
    const membersRes = await db(`users?clan_id=eq.${clan_id}&select=id`)
    const memberCount = membersRes.ok ? (await membersRes.json()).length : 0
    if (memberCount >= clanData.max_members) {
      return json({ error: `Clan complet (${memberCount}/${clanData.max_members} membres)` }, 400)
    }

    // 3. Ensure user exists in public.users (may only exist in auth.users if new website user)
    const userRes = await db(`users?id=eq.${userId}&select=id,faction,clan_id`)
    if (!userRes.ok) return json({ error: 'Erreur DB user' }, 500)
    const userRows = await userRes.json()

    if (userRows.length === 0) {
      // New website user — create them with the clan's faction automatically
      const email = user?.email ?? null
      const createRes = await db('users', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ id: userId, email, faction: clanData.faction }),
      })
      if (!createRes.ok) return json({ error: `Création utilisateur échouée: ${await createRes.text()}` }, 500)
    } else {
      const existing = userRows[0]
      // Already in a clan?
      if (existing.clan_id) return json({ error: 'Tu es déjà dans un clan. Quitte-le d\'abord.' }, 400)
      // Faction mismatch?
      if (existing.faction !== clanData.faction) {
        return json({ error: `Faction incompatible — ce clan est réservé aux ${clanData.faction} (ta faction : ${existing.faction})` }, 400)
      }
    }

    // 4. Assign clan
    const joinRes = await db(`users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation,count=exact' },
      body: JSON.stringify({ clan_id }),
    })
    if (!joinRes.ok) return json({ error: `Erreur mise à jour: ${await joinRes.text()}` }, 500)
    const joined = await joinRes.json()
    if (!Array.isArray(joined) || joined.length === 0) {
      return json({ error: 'Échec de l\'affectation — utilisateur introuvable' }, 500)
    }
    return json({ ok: true, clan_name: clanData.name })
  }

  // ── POST: leave clan ──────────────────────────────────────────────────────
  if (action === 'leave') {
    const res = await rpc('leave_clan', { p_user_id: userId })
    if (!res.ok) return json({ error: await res.text() }, 500)
    return json({ ok: true })
  }

  // ── POST: kick member (leader only) ───────────────────────────────────────
  if (action === 'kick') {
    const { member_id } = body
    if (!member_id) return json({ error: 'member_id requis' }, 400)
    if (member_id === userId) return json({ error: 'Tu ne peux pas t\'exclure toi-même' }, 400)

    // Verify caller is leader
    const clanRes = await db(`clans?leader_id=eq.${userId}&select=id`)
    if (!clanRes.ok) return json({ error: 'DB error' }, 500)
    const [clan] = await clanRes.json()
    if (!clan) return json({ error: 'Tu n\'es pas chef de clan' }, 403)

    const res = await db(`users?id=eq.${member_id}&clan_id=eq.${clan.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ clan_id: null }),
    })
    if (!res.ok) return json({ error: await res.text() }, 500)
    return json({ ok: true })
  }

  // ── POST: transfer leadership ─────────────────────────────────────────────
  if (action === 'transfer') {
    const { new_leader_id } = body
    if (!new_leader_id) return json({ error: 'new_leader_id requis' }, 400)

    // Verify caller is current leader
    const clanRes = await db(`clans?leader_id=eq.${userId}&select=id`)
    if (!clanRes.ok) return json({ error: 'DB error' }, 500)
    const [clan] = await clanRes.json()
    if (!clan) return json({ error: 'Tu n\'es pas chef de clan' }, 403)

    // Verify new leader is in the clan
    const memberRes = await db(`users?id=eq.${new_leader_id}&clan_id=eq.${clan.id}&select=id`)
    if (!memberRes.ok) return json({ error: 'DB error' }, 500)
    const [member] = await memberRes.json()
    if (!member) return json({ error: 'Joueur introuvable dans le clan' }, 404)

    const res = await db(`clans?id=eq.${clan.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ leader_id: new_leader_id }),
    })
    if (!res.ok) return json({ error: await res.text() }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Unknown action' }, 400)
})
