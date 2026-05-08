const invalidSchemes = ['chrome:', 'file:', 'about:', 'opera:', 'moz-extension:', 'edge:']
const invalidHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1']

export function normalizeDomain(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (invalidSchemes.some((scheme) => url.protocol.startsWith(scheme))) return null
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    if (invalidHosts.includes(hostname)) return null
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null // private IPs
    return hostname
  } catch {
    return null
  }
}
