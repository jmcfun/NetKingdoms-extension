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

function decodeJwt(token: string) {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try { return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return null }
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const { week, year } = getWeekNumber(new Date())

  // ── GET: fetch current challenge (without correct answer) ─────────────────
  if (req.method === 'GET') {
    const res = await db(`challenges?week_number=eq.${week}&year=eq.${year}&limit=1`)
    if (!res.ok) return json({ error: 'DB error' }, 500)
    const [challenge] = await res.json()
    if (!challenge) return json(null) // No challenge this week

    // Shuffle choices before sending (don't reveal is_correct in GET)
    const shuffled = [...challenge.choices].sort(() => Math.random() - 0.5)

    // Check if current user already completed it
    const authHeader = req.headers.get('authorization')
    let completed = false
    if (authHeader?.startsWith('Bearer ')) {
      const user = decodeJwt(authHeader.slice(7))
      if (user?.sub) {
        const compRes = await db(`challenge_completions?user_id=eq.${user.sub}&challenge_id=eq.${challenge.id}&select=completed_at`)
        if (compRes.ok) {
          const comps = await compRes.json()
          completed = comps.length > 0
        }
      }
    }

    return json({
      id: challenge.id,
      question: challenge.question,
      choices: shuffled.map((c: any) => ({ text: c.text })),  // no is_correct
      expires_at: challenge.expires_at,
      week_number: challenge.week_number,
      year: challenge.year,
      completed,
    })
  }

  // ── POST: submit answer ───────────────────────────────────────────────────
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Auth required' }, 401)
  const user = decodeJwt(authHeader.slice(7))
  if (!user?.sub) return json({ error: 'Invalid token' }, 401)
  const userId: string = user.sub

  const body = await req.json()
  const { challenge_id, answer } = body
  if (!challenge_id || typeof answer !== 'string') return json({ error: 'challenge_id + answer requis' }, 400)

  // Get the challenge with correct answer
  const challengeRes = await db(`challenges?id=eq.${challenge_id}&week_number=eq.${week}&year=eq.${year}&limit=1`)
  if (!challengeRes.ok) return json({ error: 'DB error' }, 500)
  const [challenge] = await challengeRes.json()
  if (!challenge) return json({ error: 'Challenge introuvable ou expiré' }, 404)

  // Check expiry
  if (new Date(challenge.expires_at) < new Date()) {
    return json({ error: 'Ce challenge a expiré', expired: true }, 410)
  }

  // Check already completed
  const existingRes = await db(`challenge_completions?user_id=eq.${userId}&challenge_id=eq.${challenge.id}`)
  if (existingRes.ok) {
    const existing = await existingRes.json()
    if (existing.length > 0) return json({ ok: true, already_completed: true, correct: true })
  }

  // Verify answer
  const correctChoice = challenge.choices.find((c: any) => c.is_correct)
  const isCorrect = correctChoice && answer.trim().toLowerCase() === correctChoice.text.trim().toLowerCase()

  if (!isCorrect) {
    return json({ ok: false, correct: false, message: 'Mauvaise réponse. Réessaie !' })
  }

  // Record completion
  const compRes = await db('challenge_completions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, challenge_id: challenge.id }),
  })
  if (!compRes.ok) return json({ error: 'Failed to record completion' }, 500)

  return json({ ok: true, correct: true, message: 'Bravo ! Tes visites sont validées pour cette semaine.' })
})
