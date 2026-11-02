/**
 * SafeChat API client — talks to FastAPI backend at /api/v1
 * Response shape: { success, message, data }
 */

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

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
  email?: string | null
  account_role?: string
}

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
  conversationId?: string
  messageType?: string
  edited?: boolean
}

export type ChatPreview = {
  contactId: string
  conversationId?: string
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

const HUE_PALETTE: [string, string][] = [
  ['#7B2CBF', '#9C31A1'],
  ['#6389EB', '#7B2CBF'],
  ['#E3404C', '#FF8C00'],
  ['#F97316', '#E3404C'],
  ['#0EA5E9', '#6366F1'],
  ['#10B981', '#059669'],
]

function hueFor(id: string): [string, string] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % HUE_PALETTE.length
  return HUE_PALETTE[h]
}

function accessToken() {
  return localStorage.getItem('sc_access') || localStorage.getItem('sc_token') || ''
}

function refreshToken() {
  return localStorage.getItem('sc_refresh') || ''
}

export function setSession(access: string, refresh: string, user: ApiUser) {
  localStorage.setItem('sc_access', access)
  localStorage.setItem('sc_refresh', refresh)
  localStorage.setItem('sc_token', access)
  localStorage.setItem('sc_user', JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem('sc_access')
  localStorage.removeItem('sc_refresh')
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

function mapUser(u: any): ApiUser {
  const id = String(u.id || u._id || '')
  return {
    id,
    phone: u.phone_number || u.phone || '',
    countryCode: u.countryCode,
    username: u.username || '',
    name: u.display_name || u.name || u.username || '',
    bio: u.bio || '',
    photo: u.profile_photo ?? u.photo ?? null,
    online: !!u.online,
    hue: hueFor(id || u.username || 'x'),
    createdAt: u.created_at || u.createdAt,
    email: u.email,
    account_role: u.account_role,
  }
}

function mapContact(c: any): ApiContact {
  const peerId = String(c.contact_user_id || c.peerId || c.id || '')
  return {
    id: peerId,
    entryId: String(c.id || peerId),
    peerId,
    phone: c.phone_number || c.phone || '',
    username: c.username || '',
    name: c.display_name || c.name || c.username || '',
    savedName: c.nickname || c.savedName || c.display_name || c.name || '',
    bio: c.bio || '',
    note: c.note || '',
    photo: c.profile_photo ?? c.photo ?? null,
    online: !!c.online,
    hue: hueFor(peerId || c.username || 'x'),
    createdAt: c.created_at,
  }
}

function mapMessage(m: any, meId?: string): ApiMsg {
  const created = m.created_at || m.time || ''
  let timeLabel = ''
  try {
    const d = new Date(created)
    if (!isNaN(d.getTime())) {
      timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    }
  } catch { /* */ }
  const from = String(m.sender_id || m.from || '')
  const media = m.media_attachments || m.media || []
  const firstMedia = Array.isArray(media) && media.length ? media[0] : null
  const image =
    (firstMedia && (firstMedia.url || firstMedia.data || firstMedia.src)) ||
    m.image ||
    null
  let state: ApiMsg['state'] = (m.delivery_status as any) || 'sent'
  if (state !== 'sent' && state !== 'delivered' && state !== 'read') state = 'sent'
  return {
    id: String(m.id || m._id),
    from,
    to: String(m.to || ''),
    text: m.content ?? m.text ?? '',
    image,
    time: created,
    timeLabel,
    state,
    mine: meId ? from === meId : !!m.mine,
    conversationId: m.conversation_id,
    messageType: m.message_type,
    edited: !!m.edited,
  }
}

function mapConversation(c: any, meId?: string): ChatPreview {
  const participants = c.participants || []
  const other =
    participants.find((p: any) => String(p.id) !== meId) ||
    participants[0] ||
    {}
  const last = c.last_message
  const lastText = last?.content || last?.text || ''
  let time = ''
  const iso = c.last_message_at || last?.created_at
  if (iso) {
    try {
      time = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    } catch { /* */ }
  }
  const contactId = String(other.id || (c.participant_ids || []).find((id: string) => id !== meId) || c.id)
  return {
    contactId,
    conversationId: String(c.id),
    name: other.display_name || other.username || contactId,
    photo: other.profile_photo ?? null,
    hue: hueFor(contactId),
    last: lastText,
    time,
    unread: c.unread_count || 0,
    mine: last ? String(last.sender_id) === meId : false,
    state: ((last?.delivery_status as ApiMsg['state']) || 'sent') as ChatPreview['state'],
    iso: iso || undefined,
  }
}

function mapGroup(g: any): any {
  return {
    id: String(g.id),
    name: g.group_name || g.name,
    desc: g.group_description || g.desc || '',
    photo: g.group_photo || null,
    creatorId: g.creator_id,
    adminIds: g.admin_ids || [],
    memberIds: g.member_ids || [],
    conversationId: g.conversation_id,
    createdAt: g.created_at,
    hue: hueFor(String(g.id)),
  }
}

function mapStatus(s: any): any {
  const userId = String(s.owner_user_id || s.userId || '')
  const owner = s.owner || s.user || {}
  const name =
    owner.display_name ||
    owner.name ||
    s.owner_display_name ||
    s.owner_username ||
    owner.username ||
    'Contact'
  return {
    id: String(s.id || s._id),
    userId,
    text: s.content || s.text || '',
    image: (s.media_attachments && s.media_attachments[0]?.url) || s.image || null,
    createdAt: s.created_at || s.createdAt,
    expiresAt: s.expires_at || s.expiresAt,
    type: s.status_type || s.type || 'text',
    views: Array.isArray(s.viewer_ids) ? s.viewer_ids : Array.isArray(s.views) ? s.views : [],
    user: {
      id: userId,
      name,
      username: owner.username || s.owner_username || '',
      photo: owner.profile_photo ?? owner.photo ?? s.owner_profile_photo ?? null,
      hue: hueFor(userId || name),
      online: false,
    },
  }
}

type BackendEnvelope = {
  success?: boolean
  message?: string
  data?: any
  error_code?: string
}

async function tryRefresh(): Promise<boolean> {
  const rt = refreshToken()
  if (!rt) return false
  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
    const body: BackendEnvelope = await res.json().catch(() => ({}))
    if (!res.ok || body.success === false) return false
    const data = body.data || body
    if ((data as any).access_token) {
      localStorage.setItem('sc_access', (data as any).access_token)
      localStorage.setItem('sc_token', (data as any).access_token)
      if ((data as any).refresh_token) localStorage.setItem('sc_refresh', (data as any).refresh_token)
      return true
    }
  } catch { /* */ }
  return false
}

async function req<T = any>(path: string, opts: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  }
  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }
  const t = accessToken()
  if (t) headers.Authorization = `Bearer ${t}`

  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  const body: BackendEnvelope = await res.json().catch(() => ({} as BackendEnvelope))

  if (res.status === 401 && !retried && !path.includes('/auth/login') && !path.includes('/auth/register')) {
    const ok = await tryRefresh()
    if (ok) return req(path, opts, true)
  }

  if (!res.ok || body.success === false) {
    const msg = body.message || (body as any).error || res.statusText || 'Request failed'
    throw new Error(msg)
  }
  return (body.data !== undefined ? body.data : body) as T
}

function meId(): string {
  return getStoredUser()?.id || ''
}

export const api = {
  health: () =>
    fetch(`${BASE}/health`)
      .then((r) => r.json())
      .then((j) => ({ ok: j.status === 'ok' || j.status === 'alive' })),

  register: async (body: {
    username: string
    display_name: string
    password: string
    email?: string
    phone_number?: string
  }) => {
    return req<any>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  login: async (body: { username: string; password: string; device_name?: string }) => {
    const data = await req<any>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: body.username,
        password: body.password,
        device_name: body.device_name || 'Web',
      }),
    })
    const user = mapUser(data.user || data)
    return {
      access_token: data.access_token as string,
      refresh_token: data.refresh_token as string,
      user,
    }
  },

  logout: async () => {
    const rt = refreshToken()
    if (rt) {
      try {
        await req('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: rt }),
        })
      } catch { /* */ }
    }
    return { ok: true }
  },

  me: async () => {
    const data = await req<any>('/api/v1/auth/me')
    return { user: mapUser(data), settings: {} as Record<string, unknown> }
  },

  updateMe: async (body: Record<string, unknown>) => {
    const payload: Record<string, unknown> = {}
    if (body.name !== undefined) payload.display_name = body.name
    if (body.display_name !== undefined) payload.display_name = body.display_name
    if (body.bio !== undefined) payload.bio = body.bio
    await req<any>('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return api.me()
  },

  contacts: async () => {
    const list = await req<any[]>('/api/v1/contacts')
    return { contacts: (list || []).map(mapContact) }
  },

  searchUsers: async (q: string) => {
    const list = await req<any[]>(`/api/v1/users/search/${encodeURIComponent(q)}`)
    return { users: (list || []).map(mapUser) }
  },

  addContact: async (body: { username?: string; peerId?: string; savedName?: string; message?: string }) => {
    if (!body.username) throw new Error('Username required to add contact')
    const data = await req<any>('/api/v1/contacts/requests', {
      method: 'POST',
      body: JSON.stringify({
        to_username: body.username,
        message: body.message || body.savedName || undefined,
      }),
    })
    // Mutual auto-accept may already create the contact
    const r = await api.contacts()
    return {
      request: data,
      contact: r.contacts.find((c) => c.username === body.username) || null,
      pending: !r.contacts.find((c) => c.username === body.username),
    }
  },

  incomingContactRequests: async () => {
    const list = await req<any[]>('/api/v1/contacts/requests/incoming')
    return {
      requests: (list || []).map((r) => ({
        id: String(r.id || r._id),
        fromUserId: String(r.from_user_id || ''),
        toUserId: String(r.to_user_id || ''),
        username: r.from_username || '',
        name: r.from_display_name || r.from_username || 'Unknown',
        photo: r.from_profile_photo ?? null,
        message: r.message || null,
        status: r.status || 'pending',
        createdAt: r.created_at || '',
        hue: hueFor(String(r.from_user_id || r.from_username || 'x')),
      })),
    }
  },

  outgoingContactRequests: async () => {
    const list = await req<any[]>('/api/v1/contacts/requests/outgoing')
    return {
      requests: (list || []).map((r) => ({
        id: String(r.id || r._id),
        fromUserId: String(r.from_user_id || ''),
        toUserId: String(r.to_user_id || ''),
        username: r.to_username || '',
        name: r.to_display_name || r.to_username || 'Unknown',
        photo: r.to_profile_photo ?? r.profile_photo ?? null,
        message: r.message || null,
        status: r.status || 'pending',
        createdAt: r.created_at || '',
        hue: hueFor(String(r.to_user_id || r.to_username || 'x')),
      })),
    }
  },

  acceptContactRequest: async (requestId: string) => {
    const data = await req<any>(`/api/v1/contacts/requests/${requestId}/accept`, {
      method: 'POST',
    })
    return { ok: true, data }
  },

  rejectContactRequest: async (requestId: string) => {
    const data = await req<any>(`/api/v1/contacts/requests/${requestId}/reject`, {
      method: 'POST',
    })
    return { ok: true, data }
  },

  updateContact: async (entryId: string, body: Record<string, unknown>) => {
    if (body.savedName !== undefined || body.nickname !== undefined) {
      await req(`/api/v1/contacts/${entryId}/nickname`, {
        method: 'PATCH',
        body: JSON.stringify({ nickname: body.savedName ?? body.nickname }),
      })
    }
    const r = await api.contacts()
    return {
      contact: r.contacts.find((c) => c.entryId === entryId || c.peerId === entryId)!,
    }
  },

  deleteContact: async (entryId: string) => {
    await req(`/api/v1/contacts/${entryId}`, { method: 'DELETE' })
    return { ok: true }
  },

  chats: async () => {
    const data = await req<any>('/api/v1/conversations')
    const list = data.conversations || data || []
    const mid = meId()
    const mapped = list.map((c: any) => mapConversation(c, mid))
    // One list row per peer — keep the conversation with newest activity
    const byPeer = new Map<string, (typeof mapped)[0]>()
    for (const ch of mapped) {
      const key = ch.contactId
      const prev = byPeer.get(key)
      if (!prev) {
        byPeer.set(key, ch)
        continue
      }
      const prevT = prev.iso ? Date.parse(prev.iso) : 0
      const nextT = ch.iso ? Date.parse(ch.iso) : 0
      if (nextT >= prevT) byPeer.set(key, ch)
    }
    return { chats: Array.from(byPeer.values()) }
  },

  openPrivateChat: async (username: string) => {
    const conv = await req<any>('/api/v1/conversations/private', {
      method: 'POST',
      body: JSON.stringify({ participant_username: username }),
    })
    return mapConversation(conv, meId())
  },

  getConversation: async (conversationId: string) => {
    const conv = await req<any>(`/api/v1/conversations/${conversationId}`)
    return mapConversation(conv, meId())
  },

  messages: async (conversationId: string) => {
    const data = await req<any>(`/api/v1/messages/conversations/${conversationId}`)
    const list = data.messages || data || []
    const mid = meId()
    return { messages: list.map((m: any) => mapMessage(m, mid)) }
  },

  send: async (conversationId: string, text: string, image?: string | null) => {
    const payload: Record<string, unknown> = {
      content: text || (image ? '' : ''),
      message_type: image ? 'image' : 'text',
    }
    if (image) {
      payload.media_attachments = [{ type: 'image', url: image }]
    }
    const msg = await req<any>(`/api/v1/messages/conversations/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { message: mapMessage(msg, meId()) }
  },

  markRead: async (conversationId: string) => {
    await req(`/api/v1/messages/conversations/${conversationId}/read`, { method: 'POST' })
    return { ok: true }
  },

  groups: async () => {
    const list = await req<any[]>('/api/v1/groups')
    return { groups: (list || []).map(mapGroup) }
  },

  group: async (id: string) => {
    const g = await req<any>(`/api/v1/groups/${id}`)
    return { group: mapGroup(g) }
  },

  createGroup: async (body: {
    name: string
    desc?: string
    memberIds?: string[]
    memberUsernames?: string[]
  }) => {
    const g = await req<any>('/api/v1/groups', {
      method: 'POST',
      body: JSON.stringify({
        group_name: body.name,
        group_description: body.desc,
        member_usernames: body.memberUsernames || [],
      }),
    })
    return { group: mapGroup(g) }
  },

  sendGroup: async (groupId: string, text: string) => {
    const data = await req<any>('/api/v1/conversations')
    const list = data.conversations || data || []
    const conv = list.find((c: any) => c.group_id === groupId)
    if (!conv) throw new Error('Group conversation not found')
    return api.send(String(conv.id), text)
  },

  patchGroup: async (id: string, body: Record<string, unknown>) => {
    const payload: Record<string, unknown> = {}
    if (body.name) payload.group_name = body.name
    if (body.desc !== undefined) payload.group_description = body.desc
    const g = await req<any>(`/api/v1/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return { group: mapGroup(g) }
  },

  joinGroup: async (_code: string) => {
    throw new Error('Group invite codes not yet available on backend')
  },

  deleteGroup: async (id: string) => {
    await req(`/api/v1/groups/${id}`, { method: 'DELETE' })
    return { ok: true }
  },

  status: async () => {
    const list = await req<any[]>('/api/v1/statuses/feed')
    return { status: (list || []).map(mapStatus) }
  },

  postStatus: async (text: string, image?: string | null) => {
    const payload: Record<string, unknown> = {
      content: text || '',
      status_type: image ? 'image' : 'text',
      visibility: 'contacts',
      expires_in_hours: 24,
    }
    if (image) {
      payload.media_attachments = [{ type: 'image', url: image }]
    }
    const s = await req<any>('/api/v1/statuses', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { status: mapStatus(s) }
  },

  viewStatus: async (id: string) => {
    await req(`/api/v1/statuses/${id}`)
    return { ok: true }
  },

  calls: async () => ({ calls: [] as any[] }),
  logCall: async (_body: any) => ({ call: null }),
  setTyping: async (_contactId: string) => ({}),
  getTyping: async (_contactId: string) => ({ typing: false }),
  ring: async (_to: string, _kind: 'audio' | 'video') => ({ ring: null }),
  incomingRings: async () => ({ incoming: [] as any[] }),
  answerRing: async (_id: string, _status: 'accepted' | 'declined') => ({}),
  ringStatus: async (_id: string) => ({ ring: null }),
}
