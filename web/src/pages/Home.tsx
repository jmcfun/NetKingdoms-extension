import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface SeasonScores { fondeurs_score: number; spectres_score: number; nomades_score: number; number: number }
interface Territory { domain: string; tier: string; zone: string; dominant_faction: string | null; last_visit_at: string }

const FACTION_COLORS = { Fondeurs: '#3c82f6', Spectres: '#8b5cf6', Nomades: '#22c55e' }

function ScoreBar({ name, score, max, color }: { name: string; score: number; max: number; color: string }) {
  const pct = max > 0 ? (score / max) * 100 : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
        <span style={{ color, fontWeight: 700 }}>{name}</span>
        <span style={{ color: 'var(--muted)' }}>{score.toLocaleString()} pts</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(148,163,184,0.1)' }}>
        <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

export default function Home({ session }: { session: Session | null }) {
  const [season, setSeason] = useState<SeasonScores | null>(null)
  const [recent, setRecent] = useState<Territory[]>([])
  const [stats, setStats] = useState({ total: 0, fondeurs: 0, spectres: 0, nomades: 0 })

  useEffect(() => {
    const load = async () => {
      const [seasonRes, recentRes, statsRes] = await Promise.all([
        supabase.from('seasons').select('number,fondeurs_score,spectres_score,nomades_score').eq('is_active', true).single(),
        supabase.from('territories').select('domain,tier,zone,dominant_faction,last_visit_at')
          .not('last_visit_at', 'is', null).order('last_visit_at', { ascending: false }).limit(8),
        supabase.from('territories').select('dominant_faction'),
      ])
      if (seasonRes.data) setSeason(seasonRes.data)
      if (recentRes.data) setRecent(recentRes.data)
      if (statsRes.data) {
        const rows = statsRes.data
        setStats({
          total: rows.length,
          fondeurs: rows.filter((r) => r.dominant_faction === 'Fondeurs').length,
          spectres: rows.filter((r) => r.dominant_faction === 'Spectres').length,
          nomades: rows.filter((r) => r.dominant_faction === 'Nomades').length,
        })
      }
    }
    load()
  }, [])

  const maxScore = season ? Math.max(season.fondeurs_score, season.spectres_score, season.nomades_score, 1) : 1
  const leader = season
    ? (['Fondeurs', 'Spectres', 'Nomades'] as const).reduce((a, b) =>
        (season[`${a.toLowerCase()}_score` as keyof SeasonScores] as number) >=
        (season[`${b.toLowerCase()}_score` as keyof SeasonScores] as number) ? a : b
      )
    : null

  return (
    <div className="page">
      <p className="eyebrow">Saison {season?.number ?? 1}</p>
      <h1>Guerre des territoires</h1>
      <p className="page-subtitle">L'internet en temps réel, dominé faction par faction.</p>

      {/* Season scores */}
      <div className="grid-2" style={{ marginBottom: 32, gap: 24 }}>
        <div className="card">
          <p className="section-title">Score de saison</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {season ? (
              <>
                <ScoreBar name="Fondeurs" score={season.fondeurs_score} max={maxScore} color="#3c82f6" />
                <ScoreBar name="Spectres" score={season.spectres_score} max={maxScore} color="#8b5cf6" />
                <ScoreBar name="Nomades" score={season.nomades_score} max={maxScore} color="#22c55e" />
              </>
            ) : <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Chargement…</p>}
          </div>
          {leader && (
            <p style={{ marginTop: 14, fontSize: '0.82rem', color: 'var(--muted)' }}>
              En tête : <strong style={{ color: FACTION_COLORS[leader] }}>{leader}</strong>
            </p>
          )}
        </div>

        <div className="card">
          <p className="section-title">Territoires actifs</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800 }}>{stats.total}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {([['Fondeurs', stats.fondeurs, '#3c82f6'], ['Spectres', stats.spectres, '#8b5cf6'], ['Nomades', stats.nomades, '#22c55e']] as const).map(([name, count, color]) => (
                <div key={name} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: 10, background: 'rgba(148,163,184,0.05)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{count}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid-3" style={{ marginBottom: 32 }}>
        {[
          { to: '/map', emoji: '🗺️', title: 'Carte 3D', desc: 'Visualise tous les territoires en temps réel' },
          { to: '/clan', emoji: '⚔️', title: 'Clan', desc: 'Gère ton clan, invite des membres, consulte le classement' },
          { to: '/ladder', emoji: '🏆', title: 'Classement', desc: 'Top factions et top clans de la saison' },
        ].map((link) => (
          <Link key={link.to} to={link.to} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ transition: 'transform 120ms', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = '')}>
              <div style={{ fontSize: '1.8rem', marginBottom: 10 }}>{link.emoji}</div>
              <h3 style={{ marginBottom: 6 }}>{link.title}</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.4 }}>{link.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent captures */}
      {recent.length > 0 && (
        <div className="card">
          <p className="section-title">Activité récente</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {recent.map((t, i) => (
              <div key={t.domain} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0', borderBottom: i < recent.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span className={`badge badge-tier-${t.tier}`}>{t.tier}</span>
                <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500 }}>{t.domain}</span>
                <span style={{ fontSize: '0.78rem', color: t.dominant_faction ? FACTION_COLORS[t.dominant_faction as keyof typeof FACTION_COLORS] : 'var(--muted)' }}>
                  {t.dominant_faction ?? 'Non dominé'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'rgba(148,163,184,0.4)', minWidth: 60, textAlign: 'right' }}>
                  {t.last_visit_at ? new Date(t.last_visit_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!session && (
        <div className="card" style={{ marginTop: 24, textAlign: 'center', padding: '32px 24px' }}>
          <h3 style={{ marginBottom: 8 }}>Rejoins la guerre</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 20, fontSize: '0.9rem' }}>
            Installe l'extension Chrome et connecte-toi pour contribuer aux victoires de ta faction.
          </p>
          <Link to="/auth" className="btn btn-primary" style={{ display: 'inline-flex' }}>
            Créer un compte
          </Link>
        </div>
      )}
    </div>
  )
}
