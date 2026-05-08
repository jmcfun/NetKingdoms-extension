/**
 * Injected on the NetKingdoms website pages.
 * Fetches a JWT from /extension/token (same-origin, session-authenticated)
 * and forwards it to the service worker.
 */

async function syncSession(): Promise<void> {
  try {
    const res = await fetch('/extension/token', { credentials: 'include' })
    if (!res.ok) return
    const { token } = await res.json()
    if (token) {
      chrome.runtime.sendMessage({ type: 'sync_auth', token })
    }
  } catch {
    // Silent — user may not be logged in
  }
}

syncSession()

// Re-sync when the page becomes visible (handles SPA navigation)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void syncSession()
})
