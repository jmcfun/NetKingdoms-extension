import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ClanRow { id: string; name: string; faction: string; season_score: number; max_members: number; member_count: number }

const FACTION_COLORS: Record<string, string> = { Fondeurs: '#3c82f6', Spectres: '#8b5cf6', Nomades: '#22c55e' }
const FACTION_TABS = ['Tous', 'Fondeurs', 'Spectres', 'Nomades']
const CLAN_OPS = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clan-ops`

export default function LadderPage() {
  const [season, setSeason] = useState<{ fondeurs_score: number; spectres_score: number; nomades_score: number } | null>(null)
  const [clans, setClans] = useState<ClanRow[]>([])
  const [tab, setTab] = useState('Tous')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [seasonRes, clansRes] = await Promise.all([
        supabase.from('seasons').select('fondeurs_score,spectres_score,nomades_score').eq('is_active', true).single(),
        fetch(`${CLAN_OPS}?action=ladder${tab !== 'Tous' ? `&faction=${tab}` : ''}`, {
          headers: { 'Content-Type': 'application/json' },
        }),
      ])
      if (seasonRes.data) setSeason(seasonRes.data)
      if (clansRes.ok) setClans(await clansRes.json())
      setLoading(false)
    }
    load()
  }, [tab])

  const factionScore = (f: string) => {
    if (!season) return 0
    const key = `${f.toLowerCase()}_score` as keyof typeof season
    return season[key]
  }

  const factions = ['Fondeurs', 'Spectres', 'Nomades'].sort((a, b) => factionScore(b) - factionScore(a))

  return (
    <div className="page">
      <p className="eyebrow">Classements</p>
      <h1>Leaderboard</h1>
      <p className="page-subtitle">Classement des factions et clans pour la saison en cours.</p>

      {/* Faction podium */}
      <div className="card" style={{ marginBottom: 32 }}>
        <p className="section-title">Factions — Saison en cours</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {factions.map((f, i) => (
            <div key={f} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', borderRadius: 14,
              background: i === 0 ? `${FACTION_COLORS[f]}15` : 'rgba(148,163,184,0.04)',
              border: i === 0 ? `1px solid ${FACTION_COLORS[f]}30` : '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '1.1rem', width: 28 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
              </span>
              <span style={{ flex: 1, fontWeight: 700, color: FACTION_COLORS[f], fontSize: '1rem' }}>{f}</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{factionScore(f).toLocaleString()}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Clan ladder */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2>Clans</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {FACTION_TABS.map((t) => (
              <button key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '5px 12px', borderRadius: 8, border: '1px solid',
                  borderColor: tab === t ? (FACTION_COLORS[t] ?? 'rgba(79,70,229,0.5)') : 'var(--border)',
                  background: tab === t ? `${FACTION_COLORS[t] ?? '#4f46e5'}15` : 'transparent',
                  color: tab === t ? (FACTION_COLORS[t] ?? 'var(--text)') : 'var(--muted)',
                  fontSize: '0.82rem', fontWeight: tab === t ? 700 : 400,
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="state-center"><p>Chargement…</p></div>
        ) : clans.length === 0 ? (
          <div className="state-center card">
            <span style={{ fontSize: '2rem' }}>⚔️</span>
            <h3>Aucun clan pour l'instant</h3>
            <p>Sois le premier à en créer un !</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clans.map((clan, i) => (
              <div key={clan.id} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--muted)', width: 32 }}>#{i + 1}</span>
                <span style={{ flex: 1, fontWeight: 700 }}>{clan.name}</span>
                <span style={{
                  fontSize: '0.78rem', padding: '2px 8px', borderRadius: 999,
                  background: `${FACTION_COLORS[clan.faction]}20`, color: FACTION_COLORS[clan.faction],
                  fontWeight: 600,
                }}>
                  {clan.faction}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  {clan.member_count}/{clan.max_members}
                </span>
                <span style={{ fontWeight: 700, minWidth: 80, textAlign: 'right' }}>
                  {clan.season_score.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
