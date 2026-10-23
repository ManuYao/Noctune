import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { isIPv6 } from 'node:net'

/**
 * Does this request come from the site itself? A browser tells where a request comes from (`Origin`, or
 * `Sec-Fetch-Site`) and a page on another site cannot change it. This is what stops another site from using the
 * visitor's cookie: for the API calls, and above all for the WebSocket, which browsers do not restrict by themselves.
 * A request that says nothing (a script, a test) is not a browser acting for another site: it is let through.
 */
export function originAllowed(headers: IncomingHttpHeaders, allowedOrigins: readonly string[]): boolean {
  const origin = headers.origin
  if (origin !== undefined) return allowedOrigins.includes(origin)
  const site = headers['sec-fetch-site']
  return site === undefined || site === 'same-origin' || site === 'none'
}

/**
 * The list in APP_ORIGIN ("https://noctune.example, http://localhost:5173/"), each one reduced to what a browser sends
 * in `Origin` (scheme, host, port: no path, no trailing slash). Throws on something that is not an http(s) address,
 * so that a typo stops the server instead of refusing every request later.
 */
export function parseAllowedOrigins(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      let url: URL
      try {
        url = new URL(part)
      } catch {
        throw new Error(`APP_ORIGIN : « ${part} » n'est pas une adresse (exemple : https://noctune.example).`)
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`APP_ORIGIN : « ${part} » doit commencer par http:// ou https://.`)
      }
      return url.origin
    })
}

/** The first four groups of an IPv6 address: the /64 that one connection (one home, one phone) controls entirely. */
function ipv6Prefix(address: string): string {
  const [text] = address.split('%')
  const compressed = text.includes('::')
  const [head, tail = ''] = text.split('::')
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const zeros = compressed ? Array<string>(Math.max(8 - headGroups.length - tailGroups.length, 0)).fill('0') : []
  return [...headGroups, ...zeros, ...tailGroups]
    .slice(0, 4)
    .map((group) => group.padStart(4, '0').toLowerCase())
    .join(':')
}

/**
 * What the limits count by. One IPv4 address is one key. For IPv6 the key is the /64: whoever has one has 2^64
 * addresses, and counting each of them separately would be no limit at all. `::ffff:1.2.3.4` is the IPv4 address
 * 1.2.3.4 seen by a dual-stack server, and a port some proxies add (`1.2.3.4:5678`, `[::1]:443`) is not part of
 * who it is.
 */
export function ipKey(address: string): string {
  let ip = address.trim()
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip)
  if (bracketed) ip = bracketed[1]
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'))

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped) return mapped[1]
  if (isIPv6(ip.split('%')[0])) return `v6:${ipv6Prefix(ip)}`
  return ip.toLowerCase()
}

/**
 * The address the request comes from. Behind `trustedProxies` reverse proxies, the connection comes from the last
 * one, and each proxy adds the address it saw at the end of X-Forwarded-For: the real visitor is that many values
 * from the right, the only ones nobody else could write. With 0 the header is ignored altogether.
 * The Node port must then only be reachable through the proxy, or anybody can write what they like.
 */
export function clientIp(req: IncomingMessage, trustedProxies: number): string {
  if (trustedProxies > 0) {
    const forwarded = req.headers['x-forwarded-for']
    const values = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? ''))
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const found = values[values.length - trustedProxies]
    if (found) return ipKey(found)
  }
  return ipKey(req.socket.remoteAddress ?? 'unknown')
}
