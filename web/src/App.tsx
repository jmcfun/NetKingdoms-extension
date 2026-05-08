import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom'
import { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import MapPage from './pages/MapPage'
import ClanPage from './pages/ClanPage'
import LadderPage from './pages/LadderPage'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import PrivacyPage from './pages/PrivacyPage'
import ChallengePage from './pages/ChallengePage'

function Nav({ session }: { session: Session | null }) {
  const navigate = useNavigate()

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <nav className="site-nav">
      <NavLink to="/" className="logo">⚔ NetKingdoms</NavLink>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Accueil</NavLink>
        <NavLink to="/map" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Carte</NavLink>
        <NavLink to="/clan" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Clan</NavLink>
        <NavLink to="/ladder" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Classement</NavLink>
        <NavLink to="/challenge" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Challenge</NavLink>
      </div>
      <div className="nav-user">
        {session ? (
          <>
            <NavLink to="/profile" className={({ isActive }) => 'nav-btn' + (isActive ? ' active' : '')} style={{ fontSize: '0.82rem' }}>
              Mon profil
            </NavLink>
            <button className="nav-btn" onClick={signOut}>Déconnexion</button>
          </>
        ) : (
          <NavLink to="/auth" className="nav-btn">Connexion</NavLink>
        )}
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)', padding: '24px',
      display: 'flex', justifyContent: 'center', gap: 24,
      fontSize: '0.8rem', color: 'var(--muted)',
    }}>
      <span>© 2026 NetKingdoms</span>
      <Link to="/privacy" style={{ color: 'var(--muted)' }}>Confidentialité</Link>
      <a href="https://chromewebstore.google.com" target="_blank" rel="noopener" style={{ color: 'var(--muted)' }}>
        Extension Chrome
      </a>
    </footer>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return null

  return (
    <BrowserRouter>
      <Nav session={session} />
      <Routes>
        <Route path="/" element={<Home session={session} />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/clan" element={<ClanPage session={session} />} />
        <Route path="/ladder" element={<LadderPage />} />
        <Route path="/profile" element={<ProfilePage session={session} />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/challenge" element={<ChallengePage session={session} />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  )
}
