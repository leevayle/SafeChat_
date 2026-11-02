const BASE = import.meta.env.VITE_API_URL || ''

export type ApiUser = {
  id: string
  phone: string
  countryCode?: string
  username: string
  name: string
  bio: string
  photo: string | null
  online: boolean
  hue: [string, string]
  createdAt?: string
}

/** Private contact entry as returned for the logged-in user */
export type ApiContact = {
  id: string
  entryId: string
  peerId: string | null
  phone: string
  username: string
  name: string
  savedName: string
  bio: string
  note: string
  photo: string | null
  online: boolean
  hue: [string, string]
  pinned?: boolean
  favourite?: boolean
  blocked?: boolean
  createdAt?: string
}

export type ApiMsg = {
  id: string
  from: string
  to: string
  text: string
  image?: string | null
  time: string
  state?: 'sent' | 'delivered' | 'read'
  mine?: boolean
  timeLabel?: string
}

export type ChatPreview = {
  contactId: string
  name?: string
  photo?: string | null
  hue?: [string, string]
  last: string
  time: string
  unread: number
  mine?: boolean
  state?: 'sent' | 'delivered' | 'read'
  iso?: string
}

function token() {
  return localStorage.getItem('sc_token') || ''
}

export function setSession(t: string, user: ApiUser) {
  localStorage.setItem('sc_token', t)
  localStorage.setItem('sc_user', JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem('sc_token')
  localStorage.removeItem('sc_user')
}

export function getStoredUser(): ApiUser | null {
  try {
    const raw = localStorage.getItem('sc_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  }
  const t = token()
  if (t) headers.Authorization = `Bearer ${t}`

  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed')
  return data as T
}

export const api = {
  health: () => req<{ ok: boolean }>('/api/health'),
  register: (body: {
    phone: string
    countryCode: string
    username: string
    name?: string
    bio?: string
    photo?: string | null
  }) => req<{ token: string; user: ApiUser }>('/api/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { phone?: string; username?: string }) =>
    req<{ token: string; user: ApiUser }>('/api/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => req<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  me: () => req<{ user: ApiUser; settings: Record<string, unknown> }>('/api/me'),
  updateMe: (body: Record<string, unknown>) =>
    req<{ user: ApiUser; settings: Record<string, unknown> }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  contacts: () => req<{ contacts: ApiContact[] }>('/api/contacts'),
  searchUsers: (q: string) =>
    req<{ users: ApiUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  addContact: (body: {
    peerId?: string
    username?: string
    phone?: string
    savedName?: string
    note?: string
  }) =>
    req<{ contact: ApiContact }>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateContact: (entryId: string, body: Record<string, unknown>) =>
    req<{ contact: ApiContact }>(`/api/contacts/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteContact: (entryId: string) =>
    req<{ ok: boolean }>(`/api/contacts/${entryId}`, { method: 'DELETE' }),

  chats: () => req<{ chats: ChatPreview[] }>('/api/chats'),
  messages: (contactId: string) => req<{ messages: ApiMsg[] }>(`/api/messages/${contactId}`),
  send: (contactId: string, text: string, image?: string | null) =>
    req<{ message: ApiMsg }>(`/api/messages/${contactId}`, {
      method: 'POST',
      body: JSON.stringify({ text, image: image || undefined }),
    }),
  groups: () => req<{ groups: any[] }>('/api/groups'),
  group: (id: string) => req<{ group: any }>(`/api/groups/${id}`),
  createGroup: (body: { name: string; desc?: string; memberIds?: string[]; hue?: [string, string] }) =>
    req<{ group: any }>('/api/groups', { method: 'POST', body: JSON.stringify(body) }),
  sendGroup: (id: string, text: string) =>
    req<{ message: any }>(`/api/groups/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  patchGroup: (id: string, body: Record<string, unknown>) =>
    req<{ group: any }>(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  joinGroup: (code: string) =>
    req<{ group: any }>('/api/groups/join', { method: 'POST', body: JSON.stringify({ code }) }),
  deleteGroup: (id: string) => req<{ ok: boolean }>(`/api/groups/${id}`, { method: 'DELETE' }),
  status: () => req<{ status: any[] }>('/api/status'),
  postStatus: (text: string, image?: string | null) =>
    req<{ status: any }>('/api/status', { method: 'POST', body: JSON.stringify({ text, image: image || undefined }) }),
  viewStatus: (id: string) => req<{ ok: boolean }>(`/api/status/${id}/view`, { method: 'POST' }),
  calls: () => req<{ calls: any[] }>('/api/calls'),
  logCall: (body: { to: string; kind: string; status?: string; duration?: string }) =>
    req<{ call: any }>('/api/calls', { method: 'POST', body: JSON.stringify(body) }),
  setTyping: (contactId: string) =>
    req(`/api/typing/${contactId}`, { method: 'POST', body: '{}' }),
  getTyping: (contactId: string) =>
    req<{ typing: boolean }>(`/api/typing/${contactId}`),
  ring: (to: string, kind: 'audio' | 'video') =>
    req<{ ring: any }>('/api/calls/ring', { method: 'POST', body: JSON.stringify({ to, kind }) }),
  incomingRings: () => req<{ incoming: any[] }>('/api/calls/incoming'),
  answerRing: (id: string, status: 'accepted' | 'declined') =>
    req(`/api/calls/${id}/answer`, { method: 'POST', body: JSON.stringify({ status }) }),
  ringStatus: (id: string) => req<{ ring: any }>(`/api/calls/ring/${id}`),
}
