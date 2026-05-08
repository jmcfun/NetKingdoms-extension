import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const COOLDOWN_S = 60
const STORAGE_KEY = 'nk_magic_sent'

function getStoredSent(): { email: string; sentAt: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const navigate = useNavigate()

  // Restore state if user refreshes after sending
  useEffect(() => {
    const stored = getStoredSent()
    if (!stored) return
    const elapsed = Math.floor((Date.now() - stored.sentAt) / 1000)
    const remaining = COOLDOWN_S - elapsed
    if (remaining > 0) {
      setSentEmail(stored.email)
      setCooldown(remaining)
      startTimer(remaining)
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  function startTimer(seconds: number) {
    if (timerRef.current) clearInterval(timerRef.current)
    let s = seconds
    timerRef.current = setInterval(() => {
      s--
      setCooldown(s)
      if (s <= 0) {
        clearInterval(timerRef.current!)
        setCooldown(0)
      }
    }, 1000)
  }

  const send = async (targetEmail: string) => {
    if (!targetEmail || cooldown > 0) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    if (error) {
      // Surface the rate limit clearly
      const msg = error.message.toLowerCase().includes('rate')
        ? `Limite d'envoi atteinte. Attends ${COOLDOWN_S} secondes avant de réessayer.`
        : error.message
      setError(msg)
      setLoading(false)
      return
    }
    const sentAt = Date.now()
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ email: targetEmail, sentAt }))
    setSentEmail(targetEmail)
    setCooldown(COOLDOWN_S)
    startTimer(COOLDOWN_S)
    setLoading(false)
  }

  // "Sent" screen
  if (sentEmail) {
    return (
      <div className="page">
        <div className="state-center" style={{ marginTop: 80 }}>
          <div style={{ fontSize: '3rem' }}>📬</div>
          <h3>Vérifie ta boîte mail</h3>
          <p style={{ color: 'var(--muted)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
            Un lien de connexion a été envoyé à <strong style={{ color: 'var(--text)' }}>{sentEmail}</strong>.<br />
            Clique dessus pour te connecter. Valable 1 heure.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 16 }}>
            {cooldown > 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Renvoyer dans <strong>{cooldown}s</strong>
              </p>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => send(sentEmail)}
                disabled={loading}
              >
                Renvoyer le lien
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                sessionStorage.removeItem(STORAGE_KEY)
                setSentEmail(null)
                setCooldown(0)
                if (timerRef.current) clearInterval(timerRef.current)
              }}
            >
              Changer d'email
            </button>
          </div>

          {error && (
            <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: 8 }}>{error}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 400, margin: '80px auto' }}>
      <p className="eyebrow">NetKingdoms</p>
      <h1>Connexion</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>
        Entre ton email pour recevoir un lien de connexion instantané — pas de mot de passe.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          className="input"
          type="email"
          placeholder="ton@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(email)}
          autoFocus
        />
        {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}
        <button
          className="btn btn-primary"
          onClick={() => send(email)}
          disabled={loading || !email || cooldown > 0}
        >
          {loading ? 'Envoi…' : cooldown > 0 ? `Réessayer dans ${cooldown}s` : 'Envoyer le lien magique'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Retour</button>
      </div>

      <div style={{
        marginTop: 32, padding: '14px 16px', borderRadius: 12,
        background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.1)',
      }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
          💡 <strong style={{ color: 'var(--text)' }}>Limite emails</strong> — Supabase free tier : 4 emails/heure.
          Pour la production, configure un <strong>SMTP custom</strong> dans{' '}
          <span style={{ color: '#3c82f6' }}>Supabase → Settings → Auth → SMTP</span>{' '}
          (Resend.com est gratuit jusqu'à 3 000 emails/mois).
        </p>
      </div>
    </div>
  )
}
