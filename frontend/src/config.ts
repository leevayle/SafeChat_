function normalizeOrigin(value: string | undefined): string {
  const raw = value?.trim()
  if (!raw) {
    throw new Error('VITE_API_URL is required in the desktop app environment')
  }

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
  const localHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)
  const candidate = hasScheme ? raw : `${localHost ? 'http' : 'https'}://${raw}`
  const url = new URL(candidate)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use HTTP or HTTPS')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_URL must be a backend origin without credentials or query parameters')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export const API_ORIGIN = normalizeOrigin(import.meta.env.VITE_API_URL)
export const API_BASE = import.meta.env.DEV ? '' : API_ORIGIN

/**
 * App version — ALWAYS read from env (VITE_APP_VERSION / VITE_SAFECHAT_VERSION).
 *
 * ⚠️  DO NOT hardcode or derive this from package.json, git, or any other source.
 * ⚠️  DO NOT change this wiring when editing unrelated features.
 *     Only change version *values* in the frontend .env / build env when the
 *     product owner explicitly asks for a version bump.
 */
export const APP_VERSION = String(
  import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_SAFECHAT_VERSION || '1.0.0',
).trim() || '1.0.0'

/**
 * Public web origin for shareable links (group invites, deep links).
 * Set VITE_APP_URL in .env (e.g. https://safechat.app).
 */
function resolveAppOrigin(): string {
  const raw = String(
    import.meta.env.VITE_APP_URL ||
      import.meta.env.VITE_PUBLIC_URL ||
      import.meta.env.VITE_APP_DOMAIN ||
      '',
  ).trim()
  if (raw) {
    try {
      return normalizeOrigin(raw)
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'https://safechat.app'
}

export const APP_ORIGIN = resolveAppOrigin()

/** Build a public group invite URL from an invite code. */
export function groupInviteUrl(code: string | null | undefined): string | null {
  const c = String(code || '').trim()
  if (!c) return null
  return `${APP_ORIGIN}/join/${encodeURIComponent(c)}`
}
