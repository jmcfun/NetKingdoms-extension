import { useEffect, useState, useCallback } from 'react'
import { Session } from '@supabase/supabase-js'
import { CLAN_OPS, authHeaders } from '../lib/supabase'
import { Link } from 'react-router-dom'

interface Member { id: string; username: string | null; season_score: number; last_active_at: string | null }
interface ClanInfo {
  id: string; name: string; faction: string; season_score: number
  max_members: number; rank: number | null; is_leader: boolean; leader_id: string
  members: Member[]
}

const FACTION_COLORS: Record<string, string> = { Fondeurs: '#3c82f6', Spectres: '#8b5cf6', Nomades: '#22c55e' }

function timeAgo(iso: string | null): string {
  if (!iso) return 'jamais'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  return h < 24 ? `il y a ${h}h` : `il y a ${Math.floor(h / 24)}j`
}

export default function ClanPage({ session }: { session: Session | null }) {
  const [clan, setClan] = useState<ClanInfo | null | 'loading'>('loading')
  const [action, setAction] = useState<'none' | 'create' | 'join'>('none')
  const [clanName, setClanName] = useState('')
  const [joinId, setJoinId] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const notify = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const fetchClan = useCallback(async () => {
    if (!session) { setClan(null); return }
    setClan('loading')
    const res = await fetch(`${CLAN_OPS}?action=info`, { headers: authHeaders(session.access_token) })
    setClan(res.ok ? await res.json() : null)
  }, [session])

  useEffect(() => { fetchClan() }, [fetchClan])

  const clanOp = async (act: string, body: Record<string, string> = {}) => {
    if (!session) return
    setLoading(true)
    const res = await fetch(`${CLAN_OPS}?action=${act}`, {
      method: 'POST', headers: authHeaders(session.access_token), body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { notify(data.error ?? 'Erreur'); setLoading(false); return }
    await fetchClan(); setLoading(false); setAction('none')
    return true
  }

  if (!session) {
    return (
      <div className="page">
        <div className="state-center" style={{ marginTop: 48 }}>
          <span style={{ fontSize: '2.5rem' }}>⚔️</span>
          <h3>Connexion requise</h3>
          <p style={{ color: 'var(--muted)' }}>Connecte-toi pour gérer ton clan.</p>
          <Link to="/auth" className="btn btn-primary" style={{ display: 'inline-flex', marginTop: 8 }}>
            Se connecter
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <p className="eyebrow">NetKingdoms</p>
      <h1>Clan</h1>
      {msg && (
        <div style={{
          padding: '10px 16px', borderRadius: 12, marginBottom: 20,
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
          color: '#4ade80', fontSize: '0.88rem',
        }}>{msg}</div>
      )}

      {/* ── No clan ──────────────────────────────────────────────────────── */}
      {clan === null && action === 'none' && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 16 }}>🏴</span>
          <h3 style={{ marginBottom: 8 }}>Tu n'as pas encore de clan</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>
            Crée le tien ou rejoins celui d'un ami avec son identifiant.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => setAction('create')}>Créer un clan</button>
            <button className="btn btn-secondary" onClick={() => setAction('join')}>Rejoindre</button>
          </div>
        </div>
      )}

      {clan === null && action === 'create' && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Créer un clan</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="input" placeholder="Nom du clan (3-20 caractères)" value={clanName}
              onChange={(e) => setClanName(e.target.value)} maxLength={20} autoFocus />
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
              Alphanumérique, espaces et tirets. Doit correspondre à ta faction.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" disabled={loading || clanName.trim().length < 3}
                onClick={async () => { if (await clanOp('create', { name: clanName.trim() })) setClanName('') }}>
                {loading ? '…' : 'Créer'}
              </button>
              <button className="btn btn-ghost" onClick={() => setAction('none')}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {clan === null && action === 'join' && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Rejoindre un clan</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="input" placeholder="ID du clan (UUID)" value={joinId}
              onChange={(e) => setJoinId(e.target.value)} autoFocus />
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
              Demande l'ID à ton chef de clan. Il ressemble à : <code style={{ opacity: 0.6 }}>a1b2c3d4-...</code>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" disabled={loading || !joinId.trim()}
                onClick={async () => { if (await clanOp('join', { clan_id: joinId.trim() })) setJoinId('') }}>
                {loading ? '…' : 'Rejoindre'}
              </button>
              <button className="btn btn-ghost" onClick={() => setAction('none')}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clan info ─────────────────────────────────────────────────────── */}
      {clan && clan !== 'loading' && (
        <>
          <div className="card" style={{ borderColor: `${FACTION_COLORS[clan.faction] ?? '#94a3b8'}40`, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
              <div>
                <h2 style={{ color: FACTION_COLORS[clan.faction] }}>{clan.name}</h2>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
                  {clan.faction} · {clan.members.length}/{clan.max_members} membres
                  {clan.rank && ` · #${clan.rank} dans sa faction`}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: FACTION_COLORS[clan.faction] }}>
                  {clan.season_score.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>pts saison</div>
              </div>
            </div>

            <div style={{ background: 'rgba(148,163,184,0.05)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: '0.72rem', color: 'rgba(148,163,184,0.5)', marginBottom: 2 }}>ID du clan (pour inviter)</p>
              <code style={{ fontSize: '0.8rem', color: 'var(--muted)', wordBreak: 'break-all' }}>{clan.id}</code>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}
                onClick={() => { navigator.clipboard.writeText(clan.id); notify('ID copié !') }}>
                Copier
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger btn-sm" disabled={loading}
                onClick={() => clanOp('leave').then(() => notify('Tu as quitté le clan'))}>
                {loading ? '…' : 'Quitter le clan'}
              </button>
            </div>
          </div>

          {/* Members list */}
          <div className="card">
            <p className="section-title">Membres ({clan.members.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {clan.members.map((m) => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(148,163,184,0.03)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {m.username ?? m.id.slice(0, 8) + '…'}
                      {m.id === clan.leader_id && (
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999,
                          background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700 }}>
                          Chef
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
                      Actif {timeAgo(m.last_active_at)}
                    </div>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.season_score.toLocaleString()} pts</span>

                  {clan.is_leader && m.id !== (session?.user.id) && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" disabled={loading}
                        title="Transférer le leadership"
                        onClick={async () => {
                          if (!confirm(`Transférer le leadership à ${m.username ?? m.id.slice(0, 8)} ?`)) return
                          await clanOp('transfer', { new_leader_id: m.id })
                          notify('Leadership transféré.')
                        }}>
                        👑
                      </button>
                      <button className="btn btn-danger btn-sm" disabled={loading}
                        onClick={async () => {
                          if (!confirm(`Exclure ${m.username ?? m.id.slice(0, 8)} ?`)) return
                          await clanOp('kick', { member_id: m.id })
                          notify('Membre exclu.')
                        }}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {clan.members.length < clan.max_members && (
              <p style={{ marginTop: 14, fontSize: '0.82rem', color: 'var(--muted)' }}>
                {clan.max_members - clan.members.length} place{clan.max_members - clan.members.length > 1 ? 's' : ''} disponible{clan.max_members - clan.members.length > 1 ? 's' : ''}.
                Partage l'ID ci-dessus pour inviter.
              </p>
            )}
          </div>
        </>
      )}

      {clan === 'loading' && (
        <div className="state-center"><p>Chargement…</p></div>
      )}
    </div>
  )
}
