const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'https://127.0.0.1:8000'

export interface Territory {
  domain: string
  tier: string
  zone: string
  valueSnapshot: number
  dominantFaction: string | null
  isContested: boolean
  isEphemeral: boolean
  projectedPoints?: number
  fluxProduction?: number
  firstSeenAt: string
  lastVisitAt: string | null
}

export interface DashboardData {
  faction: string
  flux: number
  ether: number
  seasonScore: number
  totalDominated: number
  mine: Territory[]
  contested: Territory[]
  ephemeral: Territory[]
}

export interface LeaderboardFaction {
  faction: string
  totalPoints: number
  territories: number
}

export interface LeaderboardData {
  season: { number: number; startedAt: string }
  factions: LeaderboardFaction[]
  topTerritories: Territory[]
}

export interface UserInfo {
  id: string
  email: string
  username: string
  faction: string | null
  factionLocked: boolean
  seasonScore: number
}

export interface ClanInfo {
  id: string
  name: string
  faction: string
  seasonScore: number
  members: number
  maxMembers: number
  isFull: boolean
  createdAt: string
}

export interface UserResources {
  flux: number
  ether: number
  seasonScore: number
  faction: string | null
  canChangeFaction: boolean
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: { email: string; username: string } }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('Identifiants incorrects.')
  return res.json()
}

export async function register(
  email: string,
  password: string,
  username: string,
): Promise<{ token: string; user: { email: string; username: string } }> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, username }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? JSON.stringify(err.errors) ?? "Erreur lors de l'inscription.")
  }
  return res.json()
}

export async function getMe(token: string): Promise<UserInfo> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Session expirée.')
  return res.json()
}

// ── Game ──────────────────────────────────────────────────────────────────────

export async function submitBatch(
  domains: string[],
  token: string,
): Promise<{ ok: boolean; accepted: number }> {
  const res = await fetch(`${API_BASE}/api/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ visits: domains.map((domain) => ({ domain })) }),
  })
  if (!res.ok) throw new Error('Batch failed')
  return res.json()
}

export async function setFaction(faction: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/user/faction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ faction: faction.toLowerCase() }),
  })
  if (!res.ok && res.status !== 409) throw new Error('Cannot set faction')
}

export async function getResources(token: string): Promise<UserResources> {
  const res = await fetch(`${API_BASE}/api/user/resources`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Resources unavailable')
  return res.json()
}

export async function getDashboard(token: string): Promise<DashboardData> {
  const res = await fetch(`${API_BASE}/api/territories/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Dashboard unavailable')
  return res.json()
}

export async function getTerritories(): Promise<Territory[]> {
  const res = await fetch(`${API_BASE}/api/territories`)
  if (!res.ok) throw new Error('Territories unavailable')
  return res.json()
}

export async function getLeaderboard(): Promise<LeaderboardData> {
  const res = await fetch(`${API_BASE}/api/leaderboard`)
  if (!res.ok) throw new Error('Leaderboard unavailable')
  return res.json()
}

// ── Clan ──────────────────────────────────────────────────────────────────────

export async function getClan(token: string): Promise<ClanInfo | null> {
  const res = await fetch(`${API_BASE}/api/clan`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Clan unavailable')
  const data = await res.json()
  return data.clan ?? null
}

export async function createClan(name: string, token: string): Promise<ClanInfo> {
  const res = await fetch(`${API_BASE}/api/clan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erreur création clan')
  return data.clan
}

export async function searchClans(query: string, token: string): Promise<ClanInfo[]> {
  const res = await fetch(`${API_BASE}/api/clan/search?q=${encodeURIComponent(query)}&faction=1`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  return res.json()
}

export async function joinClan(clanId: string, token: string): Promise<ClanInfo> {
  const res = await fetch(`${API_BASE}/api/clan/${clanId}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Impossible de rejoindre ce clan')
  return data.clan
}

export async function leaveClan(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/clan/leave`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Impossible de quitter le clan')
}

export async function getClanInviteUrl(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/clan/invite-url`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Unavailable')
  const data = await res.json()
  return data.inviteUrl
}

// ── Token storage ─────────────────────────────────────────────────────────────

export async function getJwtToken(): Promise<string | null> {
  const { jwtToken } = await chrome.storage.local.get(['jwtToken'])
  return (jwtToken as string) ?? null
}

export async function storeJwtToken(token: string | null): Promise<void> {
  if (token) {
    await chrome.storage.local.set({ jwtToken: token })
  } else {
    await chrome.storage.local.remove(['jwtToken'])
  }
}
