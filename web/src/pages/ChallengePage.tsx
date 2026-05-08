import { useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'

const VALIDATE_CHALLENGE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-challenge`

interface Challenge {
  id: string
  question: string
  choices: { text: string }[]
  expires_at: string
  week_number: number
  year: number
  completed: boolean
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState('')
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      if (ms <= 0) { setRemaining('Expiré'); return }
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      setRemaining(`${h}h ${m}m`)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [expiresAt])
  return remaining
}

export default function ChallengePage({ session }: { session: Session | null }) {
  const [challenge, setChallenge] = useState<Challenge | null | false>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const countdown = useCountdown(challenge && challenge !== false ? challenge.expires_at : null)

  useEffect(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session) headers['Authorization'] = `Bearer ${session.access_token}`
    fetch(VALIDATE_CHALLENGE, { headers })
      .then((r) => r.json())
      .then((data) => setChallenge(data ?? false))
      .catch(() => setChallenge(false))
  }, [session])

  const submit = async () => {
    if (!selected || !challenge || challenge === false) return
    setSubmitting(true)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session) headers['Authorization'] = `Bearer ${session.access_token}`
    else { setResult({ ok: false, message: 'Connexion requise pour soumettre une réponse.' }); setSubmitting(false); return }

    const res = await fetch(VALIDATE_CHALLENGE, {
      method: 'POST',
      headers,
      body: JSON.stringify({ challenge_id: challenge.id, answer: selected }),
    })
    const data = await res.json()
    setResult({ ok: data.ok && data.correct, message: data.message ?? (data.error ?? 'Erreur') })
    if (data.ok && data.correct) {
      setChallenge({ ...challenge, completed: true })
    }
    setSubmitting(false)
  }

  if (challenge === null) {
    return (
      <div className="page">
        <div className="state-center"><p>Chargement…</p></div>
      </div>
    )
  }

  if (challenge === false) {
    return (
      <div className="page">
        <p className="eyebrow">Kingdom Challenge</p>
        <h1>Challenge hebdomadaire</h1>
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <span style={{ fontSize: '2.5rem' }}>🗓️</span>
          <h3 style={{ marginTop: 16 }}>Aucun challenge cette semaine</h3>
          <p style={{ color: 'var(--muted)' }}>Reviens lundi prochain pour le prochain challenge.</p>
        </div>
      </div>
    )
  }

  const isExpired = new Date(challenge.expires_at) < new Date()

  return (
    <div className="page" style={{ maxWidth: 680, margin: '0 auto' }}>
      <p className="eyebrow">Kingdom Challenge</p>
      <h1>Challenge hebdomadaire</h1>
      <p className="page-subtitle">
        Réponds correctement pour débloquer la validation de tes visites cette semaine.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{
            fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em',
            color: 'var(--muted)', textTransform: 'uppercase',
          }}>
            Semaine {challenge.week_number} / {challenge.year}
          </span>
          <span style={{
            fontSize: '0.8rem', padding: '4px 12px', borderRadius: 999,
            background: isExpired ? 'rgba(248,113,113,0.1)' : 'rgba(34,197,94,0.1)',
            color: isExpired ? '#f87171' : '#22c55e',
            fontWeight: 600,
          }}>
            {isExpired ? 'Expiré' : `⏳ ${countdown}`}
          </span>
        </div>

        <p style={{ fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5, marginBottom: 24 }}>
          {challenge.question}
        </p>

        {challenge.completed ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 20px', borderRadius: 12,
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
          }}>
            <span style={{ fontSize: '1.5rem' }}>✅</span>
            <div>
              <p style={{ fontWeight: 700, color: '#22c55e', margin: 0 }}>Challenge complété !</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
                Tes visites sont validées pour cette semaine.
              </p>
            </div>
          </div>
        ) : isExpired ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 20px', borderRadius: 12,
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <p style={{ fontWeight: 700, color: '#f87171', margin: 0 }}>Challenge expiré</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
                Les visites de cette semaine ne sont plus validées. Reviens lundi.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {challenge.choices.map((c) => (
                <button
                  key={c.text}
                  onClick={() => { if (!result) setSelected(c.text) }}
                  style={{
                    padding: '14px 18px', borderRadius: 12, textAlign: 'left',
                    border: '1px solid',
                    borderColor: selected === c.text ? 'rgba(99,102,241,0.6)' : 'var(--border)',
                    background: selected === c.text ? 'rgba(99,102,241,0.1)' : 'rgba(148,163,184,0.04)',
                    color: selected === c.text ? '#a5b4fc' : 'var(--text)',
                    fontWeight: selected === c.text ? 600 : 400,
                    fontSize: '0.95rem', cursor: result ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {c.text}
                </button>
              ))}
            </div>

            {result && (
              <div style={{
                marginTop: 16, padding: '14px 18px', borderRadius: 12,
                background: result.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.08)',
                border: `1px solid ${result.ok ? 'rgba(34,197,94,0.25)' : 'rgba(248,113,113,0.2)'}`,
                color: result.ok ? '#22c55e' : '#f87171',
                fontWeight: 600, fontSize: '0.9rem',
              }}>
                {result.message}
              </div>
            )}

            {!result && (
              <button
                onClick={submit}
                disabled={!selected || submitting}
                style={{
                  marginTop: 20, width: '100%', padding: '14px', borderRadius: 12,
                  background: selected ? 'rgba(99,102,241,0.85)' : 'rgba(99,102,241,0.3)',
                  color: '#fff', fontWeight: 700, fontSize: '1rem',
                  border: 'none', cursor: selected ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? 'Vérification…' : 'Soumettre la réponse'}
              </button>
            )}

            {!session && (
              <p style={{ marginTop: 14, textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
                <Link to="/auth" style={{ color: '#a5b4fc' }}>Connecte-toi</Link> pour soumettre ta réponse.
              </p>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ padding: '16px 20px' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
          <strong style={{ color: 'var(--text)' }}>Comment ça marche ?</strong> Chaque semaine, un
          Kingdom Challenge est publié le lundi. Si tu ne le complètes pas dans les 72h, tes visites
          de la semaine ne seront pas validées pour le score de faction. Il suffit d'une bonne réponse !
        </p>
      </div>
    </div>
  )
}
