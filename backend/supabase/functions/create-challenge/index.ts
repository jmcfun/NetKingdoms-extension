import { serve } from 'https://deno.land/std@0.214.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CHALLENGE_POOL = [
  {
    question: 'Quel site est classé Tier S (Légendaire) dans NetKingdoms ?',
    choices: [{ text: 'dev.to', c: false }, { text: 'github.com', c: true }, { text: 'codepen.io', c: false }, { text: 'hashnode.com', c: false }],
  },
  {
    question: 'Quelle zone correspond aux Fondeurs ?',
    choices: [{ text: 'Social & News', c: false }, { text: 'Culture & Niche', c: false }, { text: 'Tech & Dev', c: true }, { text: 'Neutre', c: false }],
  },
  {
    question: 'Combien de secondes faut-il rester sur un site pour que la visite compte ?',
    choices: [{ text: '5 secondes', c: false }, { text: '12 secondes', c: true }, { text: '30 secondes', c: false }, { text: '60 secondes', c: false }],
  },
  {
    question: 'Lequel de ces sites appartient à la zone "Culture & Niche" ?',
    choices: [{ text: 'linkedin.com', c: false }, { text: 'stackoverflow.com', c: false }, { text: 'letterboxd.com', c: true }, { text: 'reuters.com', c: false }],
  },
  {
    question: 'Quelle faction obtient un bonus ×1.5 sur reddit.com ?',
    choices: [{ text: 'Fondeurs', c: false }, { text: 'Nomades', c: false }, { text: 'Spectres', c: true }, { text: 'Aucune', c: false }],
  },
  {
    question: 'Combien de domaines uniques max par heure peut-on comptabiliser ?',
    choices: [{ text: '10', c: false }, { text: '25', c: true }, { text: '50', c: false }, { text: '100', c: false }],
  },
  {
    question: 'Quel multiplicateur s\'applique aux sites éphémères ?',
    choices: [{ text: '×2', c: false }, { text: '×3', c: false }, { text: '×5', c: true }, { text: '×10', c: false }],
  },
  {
    question: 'Quelle est la durée d\'une saison NetKingdoms ?',
    choices: [{ text: '7 jours', c: false }, { text: '14 jours', c: true }, { text: '30 jours', c: false }, { text: '1 jour', c: false }],
  },
  {
    question: 'Quel site est classé Tier A dans NetKingdoms ?',
    choices: [{ text: 'youtube.com', c: false }, { text: 'github.com', c: false }, { text: 'stackoverflow.com', c: true }, { text: 'reddit.com', c: false }],
  },
  {
    question: 'youtube.com appartient à quelle zone ?',
    choices: [{ text: 'Tech & Dev', c: false }, { text: 'Social & News', c: false }, { text: 'Neutre', c: false }, { text: 'Culture & Niche', c: true }],
  },
  {
    question: 'Combien de temps avant qu\'un territoire inactif disparaisse de la carte ?',
    choices: [{ text: '24 heures', c: false }, { text: '48 heures', c: false }, { text: '72 heures', c: true }, { text: '1 semaine', c: false }],
  },
  {
    question: 'Quel site appartient à la zone "Social & News" ?',
    choices: [{ text: 'twitch.tv', c: false }, { text: 'vercel.com', c: false }, { text: 'lemonde.fr', c: true }, { text: 'itch.io', c: false }],
  },
  {
    question: 'Un territoire "Contesté" rapporte combien de points au snapshot ?',
    choices: [{ text: '0 point', c: false }, { text: '50% des points normaux', c: true }, { text: 'Les points normaux', c: false }, { text: '×2 les points normaux', c: false }],
  },
  {
    question: 'Combien de minutes de cooldown entre deux visites comptées sur le même domaine ?',
    choices: [{ text: '15 minutes', c: false }, { text: '30 minutes', c: false }, { text: '45 minutes', c: true }, { text: '60 minutes', c: false }],
  },
  {
    question: 'Quel est le nombre maximum de membres dans un clan gratuit ?',
    choices: [{ text: '3', c: false }, { text: '5', c: true }, { text: '10', c: false }, { text: '20', c: false }],
  },
  {
    question: 'À quelle fréquence sont distribués les points de snapshot ?',
    choices: [{ text: 'Toutes les heures', c: false }, { text: 'Toutes les 6 heures', c: true }, { text: 'Une fois par jour', c: false }, { text: 'Une fois par semaine', c: false }],
  },
  {
    question: 'Lequel de ces sites est classé dans la zone "Tech & Dev" ?',
    choices: [{ text: 'spotify.com', c: false }, { text: 'bbc.com', c: false }, { text: 'docker.com', c: true }, { text: 'archive.org', c: false }],
  },
  {
    question: 'Quelle faction obtient un bonus sur les sites Tier D (niches rares) ?',
    choices: [{ text: 'Fondeurs', c: false }, { text: 'Spectres', c: false }, { text: 'Nomades', c: true }, { text: 'Toutes les factions également', c: false }],
  },
]

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

serve(async (_req: Request) => {
  const now = new Date()
  const { week, year } = getWeekNumber(now)

  // Check if this week's challenge already exists
  const existing = await db(`challenges?week_number=eq.${week}&year=eq.${year}&limit=1`)
  if (existing.ok) {
    const rows = await existing.json()
    if (rows.length > 0) {
      return new Response(JSON.stringify({ ok: true, message: 'Challenge already exists', week }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Pick a deterministic question based on week number (rotate through pool)
  const q = CHALLENGE_POOL[week % CHALLENGE_POOL.length]
  const choices = q.choices.map((c) => ({ text: c.text, is_correct: c.c }))

  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()

  const res = await db('challenges', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      week_number: week,
      year,
      question: q.question,
      choices,
      expires_at: expiresAt,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    if (err.includes('unique')) {
      return new Response(JSON.stringify({ ok: true, message: 'Race condition — already created' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(`Failed: ${err}`, { status: 500 })
  }

  const [challenge] = await res.json()
  console.log(`create-challenge: week ${week}/${year} — "${q.question}"`)
  return new Response(JSON.stringify({ ok: true, challenge_id: challenge.id, week, expires_at: expiresAt }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
