import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const FACTION_COLORS: Record<string, string> = {
  Fondeurs: '#3c82f6', Spectres: '#8b5cf6', Nomades: '#22c55e',
}

interface UserProfile {
  id: string; faction: string; season_score: number; username: string | null
  created_at: string; clan_id: string | null; shadow_throttle: boolean; trust_level: number
}
interface Reward { id: string; type: string; label: string; icon: string; earned_at: string; season_id: string }
interface SeasonEntry {
  id: string; number: number; started_at: string; ended_at: string | null
  fondeurs_score: number; spectres_score: number; nomades_score: number
  winner_faction: string | null; is_active: boolean
}

function trustLabel(level: number) {
  return ['Nouveau', 'Confirmé', 'Vétéran'][level] ?? 'Inconnu'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function ProfilePage({ session }: { session: Session | null }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [rewards, setRewards] = useState<Reward[]>([])
  const [seasons, setSeasons] = useState<SeasonEntry[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!session) { setLoading(false); return }
    const load = async () => {
      const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      const [profileRes, rewardsRes, seasonsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${session.user.id}&select=id,faction,season_score,username,created_at,clan_id,shadow_throttle,trust_level`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/rewards?user_id=eq.${session.user.id}&select=*&order=earned_at.desc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/seasons?select=*&order=number.desc&limit=10`, { headers }),
      ])
      if (profileRes.ok) { const [p] = await profileRes.json(); setProfile(p ?? null) }
      if (rewardsRes.ok) setRewards(await rewardsRes.json())
      if (seasonsRes.ok) setSeasons(await seasonsRes.json())
      setLoading(false)
    }
    load()
  }, [session])

  if (!session) {
    return (
      <div className="page">
        <div className="state-center" style={{ marginTop: 48 }}>
          <span style={{ fontSize: '2.5rem' }}>👤</span>
          <h3>Connexion requise</h3>
          <button className="btn btn-primary" onClick={() => navigate('/auth')} style={{ marginTop: 8 }}>
            Se connecter
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <div className="page"><div className="state-center"><p>Chargement…</p></div></div>

  if (!profile) {
    return (
      <div className="page">
        <div className="state-center" style={{ marginTop: 48 }}>
          <span style={{ fontSize: '2rem' }}>🎮</span>
          <h3>Profil non initialisé</h3>
          <p style={{ color: 'var(--muted)' }}>Installe l'extension et navigue pour créer ton profil.</p>
        </div>
      </div>
    )
  }

  const factionColor = FACTION_COLORS[profile.faction] ?? '#94a3b8'

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <p className="eyebrow">Profil</p>

      {/* Identity card */}
      <div className="card" style={{ borderColor: `${factionColor}50`, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginBottom: 6 }}>{profile.username ?? session.user.email ?? 'Joueur anonyme'}</h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                padding: '3px 12px', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem',
                background: `${factionColor}20`, color: factionColor,
              }}>{profile.faction}</span>
              <span style={{ padding: '3px 12px', borderRadius: 999, fontSize: '0.82rem', background: 'rgba(148,163,184,0.08)', color: 'var(--muted)' }}>
                {trustLabel(profile.trust_level ?? 0)}
              </span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 8 }}>
              Membre depuis {formatDate(profile.created_at)}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: factionColor }}>
              {profile.season_score.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>pts saison actuelle</div>
          </div>
        </div>
      </div>

      {/* Rewards / badges */}
      {rewards.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p className="section-title">Badges & Récompenses</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {rewards.map((r) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 12,
                background: 'rgba(148,163,184,0.06)', border: '1px solid var(--border)',
                fontSize: '0.85rem',
              }}>
                <span style={{ fontSize: '1.2rem' }}>{r.icon}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{formatDate(r.earned_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Season history */}
      <div>
        <p className="section-title">Historique des saisons</p>
        {seasons.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Aucune saison archivée pour l'instant.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {seasons.map((s) => {
              const scores = [
                { name: 'Fondeurs', score: s.fondeurs_score, color: '#3c82f6' },
                { name: 'Spectres', score: s.spectres_score, color: '#8b5cf6' },
                { name: 'Nomades', score: s.nomades_score, color: '#22c55e' },
              ].sort((a, b) => b.score - a.score)
              const maxScore = Math.max(...scores.map((x) => x.score), 1)

              return (
                <div key={s.id} className="card card-sm" style={{
                  borderColor: s.is_active ? `${FACTION_COLORS[s.winner_faction ?? ''] ?? '#94a3b8'}40` : 'var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h3>Saison {s.number}</h3>
                      {s.is_active && (
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontWeight: 700 }}>
                          En cours
                        </span>
                      )}
                      {s.winner_faction && !s.is_active && (
                        <span style={{ fontSize: '0.78rem', color: FACTION_COLORS[s.winner_faction] ?? 'var(--muted)', fontWeight: 600 }}>
                          👑 {s.winner_faction}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {formatDate(s.started_at)}{s.ended_at ? ` → ${formatDate(s.ended_at)}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {scores.map((sc) => (
                      <div key={sc.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 70, fontSize: '0.78rem', fontWeight: 600, color: sc.color }}>{sc.name}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(148,163,184,0.1)' }}>
                          <div style={{ height: '100%', borderRadius: 3, width: `${(sc.score / maxScore) * 100}%`, background: sc.color }} />
                        </div>
                        <span style={{ width: 60, textAlign: 'right', fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {sc.score.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
