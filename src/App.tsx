import { useEffect, useRef, useState } from 'react'
import {
  login, register, getMe, setFaction as apiFaction,
  getDashboard, getLeaderboard, getResources,
  getClan, createClan, searchClans, joinClan, leaveClan, getClanInviteUrl,
  getJwtToken, storeJwtToken,
  type UserInfo, type DashboardData, type LeaderboardFaction, type ClanInfo, type UserResources,
} from './lib/api'

const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL as string) || 'http://localhost:8000'

type Faction = 'Fondeurs' | 'Spectres' | 'Nomades'

type Status = {
  faction: Faction
  score: number
  territories: number
  factionLocked: boolean
}

interface CapturedDomain { domain: string; capturedAt: number }

const defaultStatus: Status = { faction: 'Fondeurs', score: 0, territories: 0, factionLocked: false }

const FACTION_COLORS: Record<Faction, string> = {
  Fondeurs: '#3b82f6', Spectres: '#a855f7', Nomades: '#10b981',
}
const FACTION_BONUS: Record<Faction, string> = {
  Fondeurs: 'Tech & Dev', Spectres: 'Social & News', Nomades: 'Culture & Niche',
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  return h < 24 ? `il y a ${h}h` : `il y a ${Math.floor(h / 24)}j`
}

export default function App() {
  const [status, setStatus] = useState<Status>(defaultStatus)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('Chargement...')
  const [token, setToken] = useState<string | null>(null)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)

  // Auth form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)

  // Game data
  const [pendingFaction, setPendingFaction] = useState<Faction | null>(null)
  const [recentDomains, setRecentDomains] = useState<CapturedDomain[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [factionScores, setFactionScores] = useState<LeaderboardFaction[]>([])
  const [resources, setResources] = useState<UserResources | null>(null)

  // Clan
  const [clan, setClan] = useState<ClanInfo | null | undefined>(undefined) // undefined = not loaded
  const [clanView, setClanView] = useState<'info' | 'create' | 'search'>('info')
  const [clanName, setClanName] = useState('')
  const [clanSearch, setClanSearch] = useState('')
  const [clanResults, setClanResults] = useState<ClanInfo[]>([])
  const [clanMsg, setClanMsg] = useState('')
  const [clanLoading, setClanLoading] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)

  const dashRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lbRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const storage = await chrome.storage.local.get(['playerStatus', 'capturedDomains'])
      const ps: Status = storage.playerStatus ?? defaultStatus
      setStatus(ps)
      if (!storage.playerStatus) chrome.storage.local.set({ playerStatus: defaultStatus })

      const captured: CapturedDomain[] = storage.capturedDomains ?? []
      setRecentDomains([...captured].reverse().slice(0, 5))

      const jwt = await getJwtToken()
      setToken(jwt)

      if (jwt) {
        try {
          const me = await getMe(jwt)
          setUserInfo(me)
          if (me.faction) {
            const serverFaction = cap(me.faction) as Faction
            const next = { ...ps, faction: serverFaction, factionLocked: me.factionLocked }
            setStatus(next)
            chrome.storage.local.set({ playerStatus: next })
          }
          // Load resources + clan in parallel
          const [res, clanData] = await Promise.all([
            getResources(jwt).catch(() => null),
            getClan(jwt).catch(() => undefined),
          ])
          if (res) setResources(res)
          setClan(clanData)
        } catch (e: unknown) {
          // Only clear token on explicit 401 — keep it on network errors (offline)
          if (e instanceof Error && e.message === 'Session expirée.') {
            await storeJwtToken(null)
            setToken(null)
          }
        }
      }

      setLoading(false)
      setMessage('')
    }
    init()
  }, [])

  // ── Poll leaderboard (faction scores) every 5 min ─────────────────────────
  useEffect(() => {
    const fetchLb = async () => {
      try {
        const lb = await getLeaderboard()
        setFactionScores(lb.factions)
      } catch { /* silent */ }
    }
    fetchLb()
    lbRef.current = setInterval(fetchLb, 5 * 60_000)
    return () => { if (lbRef.current) clearInterval(lbRef.current) }
  }, [])

  // ── Poll dashboard (contested/ephemeral) every 30s when logged in ─────────
  useEffect(() => {
    if (!token) { setDashboard(null); return }

    const fetchDash = async () => {
      try { setDashboard(await getDashboard(token)) } catch { /* silent */ }
    }
    fetchDash()
    dashRef.current = setInterval(fetchDash, 30_000)
    return () => { if (dashRef.current) clearInterval(dashRef.current) }
  }, [token])

  // ── Actions ───────────────────────────────────────────────────────────────
  const doLogin = async () => {
    if (!email.trim() || !password.trim()) return
    setAuthLoading(true)
    try {
      const { token: jwt, user } = await login(email.trim(), password.trim())
      await storeJwtToken(jwt)
      setToken(jwt)
      const me = await getMe(jwt)
      setUserInfo(me)
      if (me.faction) {
        const serverFaction = cap(me.faction) as Faction
        const next = { ...status, faction: serverFaction, factionLocked: me.factionLocked }
        setStatus(next)
        chrome.storage.local.set({ playerStatus: next })
      }
      setMessage(`Bienvenue, ${me.username} !`)
      setTimeout(() => setMessage(''), 3000)
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Erreur de connexion.')
    }
    setAuthLoading(false)
  }

  const doRegister = async () => {
    if (!email.trim() || !password.trim() || !username.trim()) return
    setAuthLoading(true)
    try {
      const { token: jwt } = await register(email.trim(), password.trim(), username.trim())
      await storeJwtToken(jwt)
      setToken(jwt)
      const me = await getMe(jwt)
      setUserInfo(me)
      setMessage(`Compte créé ! Bienvenue, ${me.username} !`)
      setTimeout(() => setMessage(''), 4000)
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Erreur lors de l'inscription.")
    }
    setAuthLoading(false)
  }

  const signOut = async () => {
    await storeJwtToken(null)
    setToken(null)
    setUserInfo(null)
    setDashboard(null)
    setMessage('Déconnecté.')
    setTimeout(() => setMessage(''), 2000)
  }

  const selectFaction = (faction: Faction) => {
    if (status.factionLocked) return
    setPendingFaction(faction)
  }

  const confirmFaction = async () => {
    if (!pendingFaction) return
    const next: Status = { ...status, faction: pendingFaction, factionLocked: true }
    await chrome.storage.local.set({ playerStatus: next })
    setStatus(next)
    setPendingFaction(null)
    if (token) {
      try { await apiFaction(pendingFaction, token) } catch { /* silent if already set */ }
    }
    setMessage('Faction verrouillée pour cette saison.')
    setTimeout(() => setMessage(''), 3000)
  }

  const refreshData = async () => {
    setLoading(true)
    const storage = await chrome.storage.local.get(['playerStatus', 'capturedDomains'])
    setStatus(storage.playerStatus ?? defaultStatus)
    const captured: CapturedDomain[] = storage.capturedDomains ?? []
    setRecentDomains([...captured].reverse().slice(0, 5))
    setLoading(false)
    setMessage('Rafraîchi')
    setTimeout(() => setMessage(''), 2000)
  }

  const openMap = () => chrome.tabs.create({ url: `${WEBSITE_URL}/map` })

  // ── Clan handlers ─────────────────────────────────────────────────────────
  const doCreateClan = async () => {
    if (!token || !clanName.trim()) return
    setClanLoading(true); setClanMsg('')
    try {
      const c = await createClan(clanName.trim(), token)
      setClan(c); setClanView('info'); setClanName('')
      setClanMsg(`Clan "${c.name}" créé !`)
    } catch (e: unknown) {
      setClanMsg(e instanceof Error ? e.message : 'Erreur')
    }
    setClanLoading(false)
  }

  const doSearchClan = async () => {
    if (!token || clanSearch.trim().length < 2) return
    setClanLoading(true)
    const results = await searchClans(clanSearch.trim(), token)
    setClanResults(results); setClanLoading(false)
  }

  const doJoinClan = async (id: string) => {
    if (!token) return
    setClanLoading(true); setClanMsg('')
    try {
      const c = await joinClan(id, token)
      setClan(c); setClanView('info'); setClanResults([])
      setClanMsg(`Tu as rejoint "${c.name}" !`)
    } catch (e: unknown) {
      setClanMsg(e instanceof Error ? e.message : 'Erreur')
    }
    setClanLoading(false)
  }

  const doLeaveClan = async () => {
    if (!token || !clan) return
    setClanLoading(true); setClanMsg('')
    try {
      await leaveClan(token)
      setClanMsg(`Tu as quitté "${clan.name}".`); setClan(null); setClanView('info')
      setInviteUrl('')
    } catch (e: unknown) {
      setClanMsg(e instanceof Error ? e.message : 'Erreur')
    }
    setClanLoading(false)
  }

  const doGetInviteUrl = async () => {
    if (!token) return
    try {
      const url = await getClanInviteUrl(token)
      setInviteUrl(url)
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2500)
    } catch { /* silent */ }
  }

  const displayFaction = pendingFaction ?? status.faction
  const myFactionScore = factionScores.find(
    (f) => f.faction === status.faction.toLowerCase(),
  )?.totalPoints ?? null

  const ephemeralSites = dashboard?.ephemeral ?? []
  const contested      = dashboard?.contested ?? []

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">NetKingdoms</p>
          <h1>Ta guerre de navigation</h1>
        </div>
      </header>

      {/* Status card */}
      <section className="status-card" style={{ borderColor: FACTION_COLORS[status.faction] }}>
        <div className="status-row">
          <span>Faction</span>
          <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {status.faction}
            {status.factionLocked && <span className="locked-badge">verrouillée</span>}
          </strong>
        </div>
        <div className="status-row">
          <span>Bonus</span>
          <strong>{FACTION_BONUS[status.faction]}</strong>
        </div>
        <div className="status-row">
          <span>Score saison (faction)</span>
          <strong style={{ color: FACTION_COLORS[status.faction] }}>
            {myFactionScore !== null ? myFactionScore.toLocaleString() : status.score}
          </strong>
        </div>
        <div className="status-row">
          <span>Territoires capturés</span>
          <strong>{status.territories}</strong>
        </div>
        <div className="status-row">
          <span>Connexion</span>
          <strong>{userInfo ? userInfo.username : 'Non connecté'}</strong>
        </div>
      </section>

      {/* Resources bar */}
      {resources && (
        <section className="resources-bar">
          <span title="Flux — ressource pour construire des forts">⚡ {resources.flux}</span>
          <span title="Éther — ressource de prestige">✦ {resources.ether}</span>
          <span title="Score de saison personnel">🏅 {resources.seasonScore.toLocaleString()} pts</span>
        </section>
      )}

      {/* Clan section */}
      {token && clan !== undefined && (
        <section className="clan-section">
          <p className="section-title">🏰 Mon Clan</p>

          {clan ? (
            <>
              <div className="clan-info-card">
                <div className="clan-name">{clan.name}</div>
                <div className="clan-meta">
                  {clan.members}/{clan.maxMembers} membres
                  · Score {clan.seasonScore.toLocaleString()}
                </div>
              </div>
              <div className="clan-actions">
                <button className="secondary-button" onClick={doGetInviteUrl} title="Copier le lien d'invitation">
                  {inviteCopied ? '✓ Copié !' : '🔗 Inviter'}
                </button>
                <button className="link-button danger" onClick={doLeaveClan} disabled={clanLoading}>
                  Quitter
                </button>
              </div>
              {inviteUrl && (
                <p className="clan-invite-hint">Lien copié dans le presse-papier</p>
              )}
            </>
          ) : (
            <>
              <div className="clan-tabs">
                <button
                  className={clanView === 'create' ? 'clan-tab active' : 'clan-tab'}
                  onClick={() => { setClanView('create'); setClanMsg('') }}>
                  Créer
                </button>
                <button
                  className={clanView === 'search' ? 'clan-tab active' : 'clan-tab'}
                  onClick={() => { setClanView('search'); setClanMsg('') }}>
                  Rejoindre
                </button>
              </div>

              {clanView === 'create' && (
                <div className="clan-form">
                  <input
                    type="text"
                    value={clanName}
                    onChange={e => setClanName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doCreateClan()}
                    placeholder="Nom du clan (3-20 cars)"
                    maxLength={20}
                  />
                  <button className="secondary-button" onClick={doCreateClan} disabled={clanLoading || clanName.trim().length < 3}>
                    {clanLoading ? '…' : 'Créer'}
                  </button>
                </div>
              )}

              {clanView === 'search' && (
                <div className="clan-form">
                  <div className="clan-search-row">
                    <input
                      type="text"
                      value={clanSearch}
                      onChange={e => setClanSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doSearchClan()}
                      placeholder="Chercher un clan…"
                    />
                    <button className="secondary-button" onClick={doSearchClan} disabled={clanLoading}>
                      {clanLoading ? '…' : '🔍'}
                    </button>
                  </div>
                  {clanResults.length > 0 && (
                    <ul className="clan-results">
                      {clanResults.map(c => (
                        <li key={c.id} className="clan-result-item">
                          <span className="clan-result-name">{c.name}</span>
                          <span className="clan-result-meta">{c.members}/{c.maxMembers}</span>
                          <button
                            className="clan-join-btn"
                            onClick={() => doJoinClan(c.id)}
                            disabled={c.isFull || clanLoading}>
                            {c.isFull ? 'Plein' : 'Rejoindre'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {clanResults.length === 0 && clanSearch.length >= 2 && !clanLoading && (
                    <p className="clan-empty">Aucun clan trouvé pour ta faction.</p>
                  )}
                </div>
              )}
            </>
          )}

          {clanMsg && <p className="clan-msg">{clanMsg}</p>}
        </section>
      )}

      {/* Ephemeral sites banner */}
      {ephemeralSites.length > 0 && (
        <section className="ephemeral-section">
          <p className="section-title" style={{ color: '#f59e0b' }}>★ Sites éphémères actifs</p>
          <div className="ephemeral-list">
            {ephemeralSites.map((s) => (
              <div key={s.domain} className="ephemeral-item">
                <span className="ephemeral-domain">{s.domain}</span>
                <span className="ephemeral-badges">
                  <span className="tier-pill">{s.tier}</span>
                  <span className="ephemeral-timer">{s.projectedPoints}pts</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contested territories */}
      {contested.length > 0 && (
        <section className="contested-section">
          <p className="section-title" style={{ color: '#f97316' }}>
            ⚡ Territoires contestés ({contested.length})
          </p>
          <div className="contested-list">
            {contested.slice(0, 4).map((t) => (
              <div key={t.domain} className="contested-item">
                <span className="contested-domain">{t.domain}</span>
                <span className="contested-meta">Tier {t.tier} · {t.valueSnapshot}pts</span>
              </div>
            ))}
          </div>
          {contested.length > 4 && (
            <p className="contested-more">+{contested.length - 4} autres</p>
          )}
        </section>
      )}

      {/* Recent territories */}
      {recentDomains.length > 0 && (
        <section className="recent-section">
          <p className="section-title">Territoires récents</p>
          <div className="recent-list">
            {recentDomains.map(({ domain, capturedAt }) => (
              <div key={domain} className="recent-item">
                <span className="recent-domain">{domain}</span>
                <span className="recent-time">{timeAgo(capturedAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Faction selector (only when not locked) */}
      {!status.factionLocked && (
        <section className="faction-selector">
          <p className="section-title">Choisis ta faction</p>
          <p className="faction-warning">Ce choix est permanent pour la saison en cours.</p>
          <div className="faction-grid">
            {(['Fondeurs', 'Spectres', 'Nomades'] as Faction[]).map((faction) => (
              <button key={faction}
                className={faction === displayFaction ? 'faction-button active' : 'faction-button'}
                style={{ borderColor: faction === displayFaction ? FACTION_COLORS[faction] : undefined }}
                onClick={() => selectFaction(faction)}>
                <span>{faction}</span>
                <small>{FACTION_BONUS[faction]}</small>
              </button>
            ))}
          </div>
          {pendingFaction && (
            <button className="confirm-button"
              style={{ borderColor: FACTION_COLORS[pendingFaction] }}
              onClick={confirmFaction}>
              Rejoindre les {pendingFaction}
            </button>
          )}
        </section>
      )}

      {/* Auth section */}
      {!token && (
        <section className="auth-section">
          <p className="section-title">{isRegistering ? 'Créer un compte' : 'Connexion'}</p>
          <div className="auth-grid">
            {isRegistering && (
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nom de joueur (3-20 cars)"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') isRegistering ? doRegister() : doLogin() }}
              placeholder="Mot de passe (8+ caractères)"
            />
            <button
              className="secondary-button"
              onClick={isRegistering ? doRegister : doLogin}
              disabled={authLoading}>
              {authLoading ? '...' : isRegistering ? "Créer mon compte" : 'Se connecter'}
            </button>
            <button className="link-button" onClick={() => setIsRegistering(!isRegistering)}>
              {isRegistering ? 'Déjà un compte ? Se connecter' : 'Créer un compte'}
            </button>
          </div>
        </section>
      )}

      {/* Actions */}
      {token && (
        <section className="actions">
          <button className="secondary-button" onClick={signOut}>Déconnexion</button>
        </section>
      )}

      <section className="actions">
        <button className="primary-button" onClick={refreshData} disabled={loading}>
          {loading ? '...' : 'Rafraîchir'}
        </button>
        <button className="map-button" onClick={openMap}>Carte</button>
      </section>

      <footer className="app-footer">
        <p>{message || "Navigue pour capturer des territoires et dominer l'internet."}</p>
      </footer>
    </main>
  )
}
