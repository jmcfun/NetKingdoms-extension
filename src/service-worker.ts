import { normalizeDomain } from './lib/domain'
import { classifyDomain } from './lib/classify'
import { getJwtToken, storeJwtToken, submitBatch, getLeaderboard, getTerritories } from './lib/api'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'https://127.0.0.1:8000'
const DWELL_MS           = 12_000
const COOLDOWN_MS        = 45 * 60 * 1000
const VELOCITY_WINDOW_MS = 60 * 60 * 1000
const MAX_UNIQUE_DOMAINS = 25

interface PendingVisit {
  tabId: number
  domain: string
  startAt: number
  url: string
}

interface VisitEvent {
  domain: string
  url: string
  createdAt: string
  faction: string
  meta: { tier: string; zone: string }
}

interface CapturedDomain {
  domain: string
  capturedAt: number
}

const pendingVisits = new Map<number, PendingVisit>()
let visitBatch: VisitEvent[] = []

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.storage.local.set({ visitCooldowns: {}, recentDomains: [] })
  chrome.alarms.create('flush', { periodInMinutes: 5 })
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') })
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flush') {
    void flushBatch()
    void updateBadge()
  }
})

chrome.runtime.onStartup.addListener(async () => {
  const { pendingBatch } = await chrome.storage.local.get(['pendingBatch'])
  if (Array.isArray(pendingBatch) && pendingBatch.length > 0) {
    visitBatch = pendingBatch
    await flushBatch()
  }
  await checkSeasonReset()
})

async function checkSeasonReset() {
  try {
    const lb = await getLeaderboard()
    const { lastSeasonNumber, playerStatus } = await chrome.storage.local.get(['lastSeasonNumber', 'playerStatus'])
    const seasonNumber = lb.season.number

    if (lastSeasonNumber !== undefined && lastSeasonNumber < seasonNumber) {
      const updated = { ...(playerStatus ?? {}), factionLocked: false }
      await chrome.storage.local.set({ playerStatus: updated, lastSeasonNumber: seasonNumber })
      chrome.notifications.create(`nk_season_${seasonNumber}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title: `Saison ${seasonNumber} commencée !`,
        message: 'Une nouvelle saison débute. Choisis ta faction dans le popup.',
      })
    } else {
      await chrome.storage.local.set({ lastSeasonNumber: seasonNumber })
    }
  } catch { /* silent — non-critical */ }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId)
  if (tab?.url) handleTabNavigation(activeInfo.tabId, tab.url)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) handleTabNavigation(tabId, tab.url)
})

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  const [tab] = await chrome.tabs.query({ active: true, windowId })
  if (tab?.id && tab.url) handleTabNavigation(tab.id, tab.url)
})

function handleTabNavigation(tabId: number, rawUrl: string) {
  const domain = normalizeDomain(rawUrl)
  if (!domain) return

  const pending = pendingVisits.get(tabId)
  if (pending && pending.domain === domain) return

  pendingVisits.set(tabId, { tabId, domain, url: rawUrl, startAt: Date.now() })

  setTimeout(async () => {
    const next = pendingVisits.get(tabId)
    if (!next || next.domain !== domain) return
    if (Date.now() - next.startAt < DWELL_MS) return

    const canCount = await isVisitValid(domain)
    if (!canCount) return

    const classification = classifyDomain(domain)
    const faction = await getPlayerFaction()

    await updatePlayerStats(domain, faction, classification.tier)
    await chrome.storage.local.set({ lastValidVisit: Date.now() })

    queueVisit({
      domain,
      url: rawUrl,
      createdAt: new Date().toISOString(),
      faction,
      meta: { tier: classification.tier, zone: classification.zone },
    })
  }, DWELL_MS)
}

async function updatePlayerStats(domain: string, faction: string, tier: string) {
  const storage = await chrome.storage.local.get(['playerStatus', 'capturedDomains'])
  const status = storage.playerStatus ?? { faction: 'Fondeurs', score: 0, territories: 0, factionLocked: false }
  const captured: CapturedDomain[] = storage.capturedDomains ?? []

  const isNew = !captured.some((c) => c.domain === domain)
  const updatedCaptured = isNew ? [...captured, { domain, capturedAt: Date.now() }] : captured

  await chrome.storage.local.set({
    playerStatus: {
      ...status,
      score: (status.score ?? 0) + 1,
      territories: isNew ? (status.territories ?? 0) + 1 : (status.territories ?? 0),
    },
    capturedDomains: updatedCaptured,
  })

  if (isNew) {
    chrome.notifications.create(`nk_discovery_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: `Territoire Tier ${tier} découvert !`,
      message: `${domain} rejoint les ${faction} !`,
    })
  }
}

async function getPlayerFaction(): Promise<string> {
  const storage = await chrome.storage.local.get(['playerStatus'])
  return storage.playerStatus?.faction ?? 'Fondeurs'
}

async function isVisitValid(domain: string): Promise<boolean> {
  const storage = await chrome.storage.local.get(['visitCooldowns', 'recentDomains'])
  const cooldowns: Record<string, number> = storage.visitCooldowns ?? {}
  const recent: Array<{ domain: string; timestamp: number }> = storage.recentDomains ?? []
  const now = Date.now()

  if (now - (cooldowns[domain] ?? 0) < COOLDOWN_MS) return false

  const windowEntries = recent.filter((item) => now - item.timestamp < VELOCITY_WINDOW_MS)
  const uniqueDomains = new Set(windowEntries.map((item) => item.domain))
  if (!uniqueDomains.has(domain) && uniqueDomains.size >= MAX_UNIQUE_DOMAINS) return false

  cooldowns[domain] = now
  windowEntries.push({ domain, timestamp: now })
  await chrome.storage.local.set({ visitCooldowns: cooldowns, recentDomains: windowEntries })
  return true
}

function queueVisit(event: VisitEvent) {
  visitBatch.push(event)
  chrome.storage.local.set({ pendingBatch: visitBatch })
  if (visitBatch.length >= 5) void flushBatch()
}

async function flushBatch() {
  if (visitBatch.length === 0) return

  const token = await getJwtToken()
  if (!token) return // Not logged in — keep batch for later

  const batchToSend = [...visitBatch]
  visitBatch = []

  try {
    const domains = batchToSend.map((v) => v.domain)
    const result = await submitBatch(domains, token)
    if (result.ok) {
      await chrome.storage.local.remove(['pendingBatch'])
    } else {
      visitBatch = [...batchToSend, ...visitBatch]
      await chrome.storage.local.set({ pendingBatch: visitBatch })
    }
  } catch {
    visitBatch = [...batchToSend, ...visitBatch]
    await chrome.storage.local.set({ pendingBatch: visitBatch })
  }
}

type BadgeState = 'ephemeral' | 'contested' | 'inactive' | 'normal'

async function updateBadge() {
  try {
    const storage = await chrome.storage.local.get(['playerStatus', 'lastValidVisit', 'badgeState'])
    const faction = (storage.playerStatus?.faction ?? 'Fondeurs') as string

    const territories = await getTerritories()
    const hasContested = territories.some(
      (t) => t.dominantFaction === faction.toLowerCase() && t.isContested,
    )
    const hasEphemeral = territories.some((t) => t.isEphemeral)

    const lastVisit = (storage.lastValidVisit as number) ?? 0
    const isInactive = Date.now() - lastVisit > 24 * 60 * 60 * 1000 && lastVisit > 0

    const prevState: BadgeState = (storage.badgeState as BadgeState) ?? 'normal'
    let newState: BadgeState = 'normal'
    if (hasEphemeral) newState = 'ephemeral'
    else if (hasContested) newState = 'contested'
    else if (isInactive) newState = 'inactive'

    if (newState !== prevState) {
      if (newState === 'ephemeral' && prevState !== 'ephemeral') {
        chrome.notifications.create('nk_ephemeral_active', {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: '★ Sites éphémères actifs !',
          message: 'Des sites bonus ×5 sont actifs. Navigue dessus pour maximiser tes points !',
        })
      } else if (newState === 'contested' && prevState === 'normal') {
        chrome.notifications.create('nk_contested', {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: '⚡ Territoire contesté !',
          message: 'Un de tes territoires est menacé. Visite-le pour maintenir la domination.',
        })
      }
      await chrome.storage.local.set({ badgeState: newState })
    }

    if (newState === 'ephemeral') {
      await chrome.action.setBadgeText({ text: '★' })
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' })
    } else if (newState === 'contested') {
      await chrome.action.setBadgeText({ text: '!' })
      await chrome.action.setBadgeBackgroundColor({ color: '#f97316' })
    } else if (newState === 'inactive') {
      await chrome.action.setBadgeText({ text: '·' })
      await chrome.action.setBadgeBackgroundColor({ color: '#64748b' })
    } else {
      await chrome.action.setBadgeText({ text: '' })
    }
  } catch { /* silent — badge is non-critical */ }
}

// Sync JWT token sent by content-auth-bridge (user logged in on website)
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'sync_auth' && message.token) {
    void storeJwtToken(message.token)
  }
})
