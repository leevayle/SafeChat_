/** Talks to the SafeChat FastAPI backend (/api/v1). Access token lives in memory; refresh uses the httpOnly cookie. */
export type Envelope<T> = { success?: boolean; message?: string; data: T }
export type Paged<T> = { items: T[]; total: number; page: number; page_size: number }
export type Admin = { username: string; role: 'ADMIN' | 'SUPER_ADMIN'; display_name?: string }

function normalize(value: string | undefined): string {
  const raw = value?.trim()
  if (!raw) throw new Error('VITE_API_URL is required in admin-portal/.env or the build environment')
  const withProto = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ? raw
    : `${/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw) ? 'http' : 'https'}://${raw}`
  const url = new URL(withProto)
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

// In dev the Vite proxy forwards /api, so no CORS is involved.
const BASE = import.meta.env.DEV ? '' : normalize(import.meta.env.VITE_API_URL)
let token = ''
let refreshing: Promise<boolean> | null = null

async function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/api/v1/auth/refresh`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
    .then(async (r) => {
      const env = (await r.json().catch(() => ({}))) as Envelope<{ access_token?: string }>
      if (!r.ok || !env.data?.access_token) return false
      token = env.data.access_token
      return true
    })
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${BASE}/api/v1${path}`, { ...init, headers, credentials: 'include' })
  if (res.status === 401 && !retried && token) {
    if (await refresh()) return api<T>(path, init, true)
    token = ''
    window.dispatchEvent(new Event('admin:session-expired'))
    throw new Error('Session expired. Please sign in again.')
  }
  const env = (await res.json().catch(() => ({}))) as Envelope<T> & { detail?: unknown }
  if (!res.ok || env.success === false) {
    const detail = typeof env.detail === 'string' ? env.detail : undefined
    throw new Error(env.message || detail || `Request failed (${res.status})`)
  }
  return env.data as T
}

const send = (method: string) => <T,>(path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
export const post = send('POST')
export const patch = send('PATCH')
export const put = send('PUT')
export const del = send('DELETE')

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  const out = s.toString()
  return out ? `?${out}` : ''
}

function toAdmin(user: { username: string; display_name?: string; account_role?: string }): Admin {
  if (user.account_role !== 'ADMIN' && user.account_role !== 'SUPER_ADMIN')
    throw new Error('This account does not have administrator access.')
  return { username: user.username, role: user.account_role, display_name: user.display_name }
}

export async function login(username: string, password: string): Promise<Admin> {
  const data = await post<{ access_token: string; user: { username: string; display_name?: string; account_role?: string } }>(
    '/auth/login', { username, password, device_name: 'SafeChat Admin Portal' },
  )
  const admin = toAdmin(data.user) // throws for non-admins before the token is kept
  token = data.access_token
  return admin
}

/** Called on page load: the refresh cookie survives a reload, the in-memory token does not. */
export async function restoreSession(): Promise<Admin | null> {
  if (!(await refresh())) return null
  try {
    const me = await api<{ username: string; display_name?: string; account_role?: string }>('/auth/me')
    return toAdmin(me)
  } catch { token = ''; return null }
}

export async function logout() {
  await Promise.allSettled([del('/admin/presence'), post('/auth/logout', {})])
  token = ''
}

/** Authenticated file download (the backup endpoint needs the Bearer header, so a plain link won't work). */
export async function downloadBackup(filename: string) {
  const res = await fetch(`${BASE}/api/v1/admin/backups/download/${encodeURIComponent(filename)}`, {
    headers: { Authorization: `Bearer ${token}` }, credentials: 'include',
  })
  if (!res.ok) throw new Error('Download failed')
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

/** Drop the in-memory token (e.g. after the server revoked every session). */
export const forgetSession = () => { token = '' }

/** Walk a paged endpoint (newest first). `stop` lets the caller end early, e.g. once rows fall before a date range. */
export async function fetchAll<T>(url: (page: number) => string, opts: { cap?: number; size?: number; stop?: (row: T) => boolean; keep?: (row: T) => boolean } = {}) {
  const { cap = 30, size = 100, stop, keep } = opts
  const rows: T[] = []
  let truncated = false
  for (let page = 1; page <= cap; page++) {
    const d = await api<Paged<T>>(url(page))
    let done = false
    for (const row of d.items) {
      if (stop?.(row)) { done = true; break }
      if (!keep || keep(row)) rows.push(row)
    }
    if (done || page * size >= d.total || !d.items.length) break
    if (page === cap) truncated = true
  }
  return { rows, truncated }
}
