import { useState } from 'react'

type Faction = 'Fondeurs' | 'Spectres' | 'Nomades'

const factions: Array<{
  name: Faction
  color: string
  zone: string
  desc: string
  sites: string
}> = [
  {
    name: 'Fondeurs',
    color: '#3c82f6',
    zone: 'Tech & Dev',
    desc: 'Bâtisseurs, développeurs, créateurs. Dominez l\'internet technique.',
    sites: 'GitHub, StackOverflow, npm, Vercel…',
  },
  {
    name: 'Spectres',
    color: '#8b5cf6',
    zone: 'Social & News',
    desc: 'Influenceurs, curieux, lecteurs de médias. Contrôlez la conversation.',
    sites: 'Reddit, Twitter/X, Le Monde, Medium…',
  },
  {
    name: 'Nomades',
    color: '#22c55e',
    zone: 'Culture & Niche',
    desc: 'Explorateurs, cinéphiles, chasseurs de niche. Cartographiez l\'inconnu.',
    sites: 'YouTube, Twitch, Letterboxd, sites rares…',
  },
]

const USERNAME_RE = /^[a-zA-Z0-9]{3,20}$/

export default function Onboarding() {
  const [step, setStep] = useState<'welcome' | 'faction' | 'username' | 'done'>('welcome')
  const [selected, setSelected] = useState<Faction | null>(null)
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [loading, setLoading] = useState(false)

  const confirmFaction = async () => {
    if (!selected) return
    setLoading(true)
    const playerStatus = { faction: selected, score: 0, territories: 0, factionLocked: true }
    await chrome.storage.local.set({ playerStatus })
    setLoading(false)
    setStep('username')
  }

  const confirmUsername = async () => {
    const trimmed = username.trim()
    if (!USERNAME_RE.test(trimmed)) {
      setUsernameError('3 à 20 caractères alphanumériques uniquement.')
      return
    }
    setLoading(true)
    await chrome.storage.local.set({ playerUsername: trimmed })
    setLoading(false)

    const permission = await chrome.permissions.contains({ permissions: ['notifications'] })
    if (!permission) {
      await chrome.permissions.request({ permissions: ['notifications'] })
    }
    setStep('done')
  }

  const close = () => {
    chrome.tabs.getCurrent((tab) => {
      if (tab?.id) chrome.tabs.remove(tab.id)
    })
  }

  return (
    <div className="onboarding-shell">
      {step === 'welcome' && (
        <div className="onboarding-card fade-in">
          <div className="onboarding-logo">⚔️</div>
          <h1 className="onboarding-title">NetKingdoms</h1>
          <p className="onboarding-sub">
            Ta navigation quotidienne est une guerre territoriale mondiale.
            Chaque site que tu visites fait avancer ta faction vers la domination.
          </p>
          <div className="onboarding-rules">
            <div className="rule-item">
              <span className="rule-icon">🌐</span>
              <span>Visite n'importe quel site ≥ 12 secondes → territoire capturé</span>
            </div>
            <div className="rule-item">
              <span className="rule-icon">⚡</span>
              <span>Ta faction reçoit des points toutes les 6h sur chaque territoire qu'elle domine</span>
            </div>
            <div className="rule-item">
              <span className="rule-icon">🗺️</span>
              <span>La carte est construite en temps réel par les joueurs</span>
            </div>
            <div className="rule-item">
              <span className="rule-icon">🔒</span>
              <span>Zéro action requise — le browser, c'est jouer</span>
            </div>
          </div>
          <button className="onboarding-cta" onClick={() => setStep('faction')}>
            Choisir ma faction →
          </button>
        </div>
      )}

      {step === 'faction' && (
        <div className="onboarding-card fade-in">
          <h2 className="onboarding-title">Choisis ta faction</h2>
          <p className="onboarding-sub">
            Ce choix est <strong>permanent pour la saison</strong> (14 jours).
            Il reflète ton profil de navigation naturel.
          </p>
          <div className="faction-choice-grid">
            {factions.map((f) => (
              <button
                key={f.name}
                className={`faction-choice-card ${selected === f.name ? 'selected' : ''}`}
                style={{ '--faction-color': f.color } as React.CSSProperties}
                onClick={() => setSelected(f.name)}
              >
                <div className="faction-choice-name" style={{ color: f.color }}>{f.name}</div>
                <div className="faction-choice-zone">Bonus : {f.zone}</div>
                <div className="faction-choice-desc">{f.desc}</div>
                <div className="faction-choice-sites">{f.sites}</div>
              </button>
            ))}
          </div>
          {selected && (
            <button
              className="onboarding-cta"
              style={{ background: factions.find((f) => f.name === selected)!.color }}
              onClick={confirmFaction}
              disabled={loading}
            >
              {loading ? '...' : `Rejoindre les ${selected} →`}
            </button>
          )}
        </div>
      )}

      {step === 'username' && (
        <div className="onboarding-card fade-in">
          <div className="onboarding-logo">🏷️</div>
          <h2 className="onboarding-title">Choisis ton pseudo</h2>
          <p className="onboarding-sub">
            Visible sur le classement. 3 à 20 caractères alphanumériques.
          </p>
          <input
            className="onboarding-input"
            type="text"
            placeholder="MonPseudo123"
            value={username}
            maxLength={20}
            onChange={(e) => { setUsername(e.target.value); setUsernameError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmUsername() }}
            autoFocus
          />
          {usernameError && <p className="onboarding-error">{usernameError}</p>}
          <button
            className="onboarding-cta"
            style={{ background: factions.find((f) => f.name === selected)!.color }}
            onClick={confirmUsername}
            disabled={loading || username.trim().length < 3}
          >
            {loading ? '...' : 'Confirmer →'}
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="onboarding-card fade-in">
          <div className="onboarding-logo">🏴</div>
          <h2 className="onboarding-title">Tu es prêt à conquérir</h2>
          <p className="onboarding-sub">
            Tu rejoins les <strong style={{ color: factions.find((f) => f.name === selected)!.color }}>
              {selected}
            </strong>. Clique sur l'icône NetKingdoms dans la toolbar pour suivre ta progression.
          </p>
          <div className="onboarding-rules">
            <div className="rule-item">
              <span className="rule-icon">✅</span>
              <span>Navigue normalement — les territoires s'accumulent automatiquement</span>
            </div>
            <div className="rule-item">
              <span className="rule-icon">🔔</span>
              <span>Tu recevras une notification à chaque nouveau territoire découvert</span>
            </div>
            <div className="rule-item">
              <span className="rule-icon">🗺️</span>
              <span>La carte globale est accessible depuis le popup</span>
            </div>
          </div>
          <button className="onboarding-cta" onClick={close}>
            Commencer à jouer
          </button>
        </div>
      )}
    </div>
  )
}
