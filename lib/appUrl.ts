/**
 * Returns the canonical base URL for this deployment.
 * Never reads from request headers — those can be spoofed.
 * Priority: explicit env var → Vercel auto-var → local dev fallback.
 */
export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}
