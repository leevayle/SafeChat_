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
  lastSeen?: string | null
  hue: [string, string]
  createdAt?: string
  email?: string | null
  account_role?: string
  email?: string
  subscriptionPlan?: string
  accountStatus?: string
  verifiedBadge?: boolean
  premiumSettings?: Record<string, unknown>
  deactivatedAt?: string | null
  scheduledDeletionAt?: string | null
  /** Appearance — applied via CSS on login (no UI remount) */
  theme?: string
  chatAccent?: string
  colorMode?: string
  liquidGlass?: boolean
}

export type ApiContact = {
  premium?: boolean
  subscriptionPlan?: string
  verifiedBadge?: boolean

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
  lastSeen?: string | null
  hue: [string, string]
  pinned?: boolean
  favourite?: boolean
  blocked?: boolean
  createdAt?: string
}

export type ApiMsg = {
  id: string
  /** Stable UI key so optimistic → server id swap does not remount/re-animate the bubble */
  clientKey?: string
  from: string
  to: string
  text: string
  image?: string | null
  time: string
  state?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  mine?: boolean
  timeLabel?: string
  conversationId?: string
  messageType?: string
  edited?: boolean
  deleted?: boolean
  forwarded?: boolean
  reactions?: { emoji: string; user_id?: string }[]
  replyToId?: string | null
  replyToText?: string | null
  /** Encoded status reply preview */
  statusReply?: { preview: string; time?: string; statusId?: string } | null
  /** Inline call log row in chat */
  callLog?: {
    kind: 'audio' | 'video'
    direction: string
    status: string
    duration?: string
  } | null
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
  state?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
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

/** JWT exp (seconds) or 0 if unreadable — does not verify signature. */
function tokenExpiresAt(token?: string): number {
  const t = token || accessToken()
  if (!t || t.split('.').length < 2) return 0
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp : 0
  } catch {
    return 0
  }
}

/** Refresh if access token missing or expiring within 90s. */
async function ensureFreshAccess(): Promise<boolean> {
  if (sessionDead) return false
  const access = accessToken()
  const refresh = refreshToken()
  if (!access && !refresh) return false
  if (!access && refresh) return tryRefresh()
  const exp = tokenExpiresAt(access)
  if (!exp) return true // opaque / non-JWT — let server decide
  const now = Math.floor(Date.now() / 1000)
  if (exp - now <= 90) return tryRefresh()
  return true
}

/** Public: refresh access token if missing/expiring (used on boot). */
export async function ensureSessionFresh(): Promise<boolean> {
  return ensureFreshAccess()
}

/** True when an access token is present (does not validate server-side). */
export function hasAccessToken(): boolean {
  return !!accessToken()
}

/** Set after a permanent 401 so callers stop firing protected requests. */
let sessionDead = false

export function isSessionDead(): boolean {
  return sessionDead
}

export function markSessionAlive() {
  sessionDead = false
}

export function markSessionDead() {
  if (sessionDead) return
  sessionDead = true
  clearSession()
  try {
    window.dispatchEvent(new CustomEvent('sc:auth-failed'))
  } catch {
    /* ignore */
  }
}

export function setSession(access: string, refresh: string, user: ApiUser) {
  sessionDead = false
  localStorage.setItem('sc_access', access)
  localStorage.setItem('sc_refresh', refresh)
  localStorage.setItem('sc_token', access)
  localStorage.setItem('sc_user', JSON.stringify(user))
  startProactiveRefresh()
}

export function saveStoredUser(user: ApiUser) {
  localStorage.setItem('sc_user', JSON.stringify(user))
}

export function clearSession() {
  stopProactiveRefresh()
  localStorage.removeItem('sc_access')
  localStorage.removeItem('sc_refresh')
  localStorage.removeItem('sc_token')
  localStorage.removeItem('sc_user')
}

function isPublicAuthPath(path: string) {
  return (
    path.includes('/auth/login') ||
    path.includes('/auth/register') ||
    path.includes('/auth/refresh') ||
    path.includes('/auth/phone/') ||
    path.includes('/auth/username/')
  )
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
    lastSeen: u.last_seen || u.lastSeen || null,
    hue: hueFor(id || u.username || 'x'),
    createdAt: u.created_at || u.createdAt,
    email: u.email || '',
    account_role: u.account_role,
    subscriptionPlan: (u.subscription_plan || u.subscriptionPlan || 'pro').replace('free', 'pro'),
    accountStatus: u.account_status || u.accountStatus || 'active',
    verifiedBadge: !!(u.verified_badge ?? u.premium_settings?.verified_badge),
    premiumSettings: u.premium_settings || u.premiumSettings || {},
    premiumExpiresAt: u.premium_expires_at || u.premiumExpiresAt || null,
    deactivatedAt: u.deactivated_at || null,
    scheduledDeletionAt: u.scheduled_deletion_at || null,
    // Appearance (optional on type — used immediately on login)
    theme: u.theme || u.settings?.theme || undefined,
    chatAccent: u.chat_accent || u.chatAccent || u.settings?.chat_accent || undefined,
    colorMode: u.color_mode || u.colorMode || u.settings?.color_mode || undefined,
    liquidGlass:
      u.liquid_glass != null
        ? !!u.liquid_glass
        : u.liquidGlass != null
          ? !!u.liquidGlass
          : u.settings?.liquid_glass != null
            ? !!u.settings.liquid_glass
            : undefined,
  } as ApiUser
}

function mapContact(c: any): ApiContact {
  const peerId = String(c.contact_user_id || c.peerId || c.id || '')
  return {
    id: peerId,
    entryId: String(c.id || peerId),
    peerId,
    phone: c.phone_number || c.phone || '',
    username: c.username || '',
    name: c.nickname || c.saved_name || c.savedName || c.display_name || c.name || c.username || peerId || 'User',
    savedName: c.nickname || c.saved_name || c.savedName || '',
    publicName: c.display_name || c.name || c.username || '',
    bio: c.bio || '',
    note: c.note || '',
    photo: c.profile_photo ?? c.photo ?? null,
    online: !!c.online,
    lastSeen: c.last_seen || c.lastSeen || null,
    hue: hueFor(peerId || c.username || 'x'),
    createdAt: c.created_at,
    subscriptionPlan: (c.subscription_plan || c.subscriptionPlan || 'pro').replace('free', 'pro'),
    verifiedBadge: !!(c.verified_badge ?? c.verifiedBadge),
    premium:
      (c.subscription_plan || c.subscriptionPlan) === 'premium' &&
      (c.verified_badge ?? c.verifiedBadge) !== false,
  }
}

function mapMessage(m: any, meId?: string): ApiMsg {
  let created = String(m.created_at || m.time || '')
  // Treat naive backend timestamps as UTC
  if (created && /^\d{4}-\d{2}-\d{2}T/.test(created) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(created)) {
    created = created + 'Z'
  }
  let timeLabel = ''
  try {
    const d = new Date(created)
    if (!isNaN(d.getTime())) {
      timeLabel = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
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
  let text = String(m.content ?? m.text ?? '')
  let statusReply: ApiMsg['statusReply'] = null
  const sr = text.match(/^⟦status⟧([\s\S]*?)⟦t⟧([\s\S]*?)(?:⟦id⟧([\s\S]*?))?⟦\/⟧([\s\S]*)$/)
  if (sr) {
    statusReply = { preview: sr[1], time: sr[2] || undefined, statusId: sr[3] || undefined }
    text = sr[4]
  }
  return {
    id: String(m.id || m._id),
    from,
    to: String(m.to || ''),
    text,
    image,
    time: created,
    timeLabel,
    state,
    mine: meId ? from === meId : !!m.mine,
    conversationId: m.conversation_id,
    messageType: m.message_type,
    deleted: !!(m.deleted || m.deleted_at),
    edited: !!(m.edited || m.is_edited || m.edited_at),
    forwarded: !!(m.forwarded_from || m.forwarded),
    reactions: m.reactions || [],
    replyToId: m.reply_to_message_id || m.replyToId || null,
    replyToText: m.reply_to_text || m.replyToText || null,
    statusReply: statusReply || m.status_reply || null,
  }
}

function formatChatPreviewLast(raw: string): string {
  if (!raw) return ''
  const sr = raw.match(/^⟦status⟧([\s\S]*?)⟦t⟧([\s\S]*?)(?:⟦id⟧([\s\S]*?))?⟦\/⟧([\s\S]*)$/)
  if (sr) {
    const body = (sr[4] || '').trim()
    return body ? `Status reply: ${body}` : 'Status reply'
  }
  return raw
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
    // Public name from server — UI prefers local savedName via contacts overlay
    name: other.nickname || other.saved_name || other.display_name || other.username || contactId,
    publicName: other.display_name || other.username || contactId,
    username: other.username || '',
    photo: other.profile_photo ?? null,
    hue: hueFor(contactId),
    last: formatChatPreviewLast(lastText),
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

export function mapStatusFromWs(s: any): any {
  return mapStatus(s)
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
    image: (s.media_attachments && s.media_attachments.find((m: any) => m.type === 'image')?.url) || s.image || null,
    video: (s.media_attachments && s.media_attachments.find((m: any) => m.type === 'video')?.url) || s.video || null,
    background: s.background || 'theme_purple_grad',
    createdAt: s.created_at || s.createdAt,
    expiresAt: s.expires_at || s.expiresAt,
    type: s.status_type || s.type || 'text',
    views: Array.isArray(s.viewer_ids) ? s.viewer_ids : Array.isArray(s.views) ? s.views : [],
    viewCount: s.view_count ?? s.viewCount ?? (Array.isArray(s.viewer_ids) ? s.viewer_ids.length : Array.isArray(s.views) ? s.views.length : 0),
    isAd: !!(s.is_ad || s.isAd),
    adReach: s.ad_reach || s.adReach || null,
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

/** Single-flight refresh — concurrent 401s must share one rotate, or the second kills the session. */
let refreshInflight: Promise<boolean> | null = null
let consecutiveRefreshFails = 0

async function tryRefresh(): Promise<boolean> {
  if (refreshInflight) return refreshInflight
  refreshInflight = (async () => {
    const rt = refreshToken()
    if (!rt) {
      consecutiveRefreshFails += 1
      return false
    }
    try {
      const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      })
      const body: BackendEnvelope = await res.json().catch(() => ({}))
      if (!res.ok || body.success === false) {
        consecutiveRefreshFails += 1
        return false
      }
      const data = body.data || body
      if ((data as any).access_token) {
        localStorage.setItem('sc_access', (data as any).access_token)
        localStorage.setItem('sc_token', (data as any).access_token)
        if ((data as any).refresh_token) {
          localStorage.setItem('sc_refresh', (data as any).refresh_token)
        }
        sessionDead = false
        consecutiveRefreshFails = 0
        // Rotate WS onto the new access token
        try {
          void import('./realtime').then((m) => m.forceReconnectRealtime?.())
        } catch { /* */ }
        return true
      }
      consecutiveRefreshFails += 1
      return false
    } catch {
      consecutiveRefreshFails += 1
      return false
    } finally {
      refreshInflight = null
    }
  })()
  return refreshInflight
}

/** Refresh access token periodically — failure alone does NOT kill the session. */
let refreshTimer: ReturnType<typeof setInterval> | null = null
export function startProactiveRefresh() {
  if (refreshTimer) return
  refreshTimer = setInterval(() => {
    if (sessionDead || !refreshToken()) return
    void tryRefresh()
  }, 12 * 60 * 1000) // every 12 minutes
}
export function stopProactiveRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

/** True for background/read polls — never force logout on these alone. */
function isSoftReadPath(path: string, method: string) {
  const m = (method || 'GET').toUpperCase()
  if (m !== 'GET' && m !== 'HEAD') return false
  // Soft reads that fire often while scrolling / idling
  return (
    path.includes('/conversations') ||
    path.includes('/messages') ||
    path.includes('/statuses') ||
    path.includes('/contacts') ||
    path.includes('/groups') ||
    path.includes('/calls') ||
    path.includes('/users/search') ||
    path.includes('/users/me') ||
    path.includes('/contact-requests') ||
    path.includes('/contacts/requests') ||
    path.includes('/notifications') ||
    path.includes('/auth/me')
  )
}

async function req<T = any>(path: string, opts: RequestInit = {}, retried = false): Promise<T> {
  const publicPath = isPublicAuthPath(path)
  const method = (opts.method || 'GET').toUpperCase()

  // Hard stop only when session was proven dead (failed write/auth after refresh)
  if (!publicPath) {
    if (sessionDead) {
      const err = new Error('Session expired — log in again')
      ;(err as any).status = 401
      throw err
    }
    if (!accessToken() && !refreshToken()) {
      const err = new Error('Please log in again')
      ;(err as any).status = 401
      throw err
    }
    // Refresh early so soft polls rarely hit a raw 401 in the network log
    if (!retried) {
      await ensureFreshAccess()
    }
  }

  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  }
  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }
  const tkn = accessToken()
  if (tkn) headers.Authorization = `Bearer ${tkn}`

  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  const body: BackendEnvelope = await res.json().catch(() => ({} as BackendEnvelope))

  if (res.status === 401 && !publicPath) {
    if (!retried) {
      const ok = await tryRefresh()
      if (ok) return req(path, opts, true)
    }
    // Soft reads: do not deauth — just fail this request (UI keeps cached data)
    const soft = isSoftReadPath(path, method)
    if (!soft && consecutiveRefreshFails >= 2) {
      markSessionDead()
    }
    const err = new Error(
      soft
        ? 'Temporarily unavailable'
        : friendlyError(body.message || 'Session expired — log in again', 401, path),
    )
    ;(err as any).status = 401
    ;(err as any).soft = soft
    throw err
  }

  if (!res.ok || body.success === false) {
    const raw = body.message || (body as any).error || res.statusText || 'Request failed'
    const err = new Error(friendlyError(raw, res.status, path))
    ;(err as any).status = res.status
    throw err
  }
  return (body.data !== undefined ? body.data : body) as T
}

/** Map technical API errors to short, user-friendly copy. */
function friendlyError(raw: string, status?: number, path?: string): string {
  const t = (raw || '').toLowerCase()
  const isAuthForm =
    path?.includes('/auth/login') ||
    path?.includes('/auth/register') ||
    path?.includes('/auth/verify')
  if (
    t.includes('invalid username') ||
    t.includes('invalid password') ||
    t.includes('incorrect password') ||
    t.includes('invalid credentials') ||
    t.includes('wrong password') ||
    (isAuthForm && (status === 401 || status === 400 || t.includes('unauthorized')))
  ) {
    return 'Wrong username or password'
  }
  if (t.includes('invalid token') || t.includes('not authenticated') || t.includes('token expired')) {
    return 'Session expired — log in again'
  }
  if (!isAuthForm && (status === 401 || t.includes('unauthorized'))) {
    return 'Session expired — log in again'
  }
  if (status === 403 || t.includes('forbidden')) return 'You don’t have permission for that'
  if (status === 404 || t.includes('not found')) return 'Not found'
  if (status === 409 || t.includes('conflict') || t.includes('already')) return raw.length < 80 ? raw : 'That action isn’t available right now'
  if (status === 429 || t.includes('rate limit') || t.includes('too many')) return 'Slow down a moment and try again'
  if (status && status >= 500) return 'Something went wrong — try again'
  if (t.includes('network') || t.includes('failed to fetch')) return 'Check your connection and try again'
  if (t.includes('incorrect password') || t.includes('wrong password')) return 'Incorrect password'
  // Keep short human messages; trim long technical dumps
  if (raw && raw.length <= 90 && !t.includes('exception') && !t.includes('traceback')) return raw
  return 'Something went wrong — try again'
}

function meId(): string {
  return getStoredUser()?.id || ''
}

export const api = {
  health: () =>
    fetch(`${BASE}/health`)
      .then((r) => r.json())
      .then((j) => ({ ok: j.status === 'ok' || j.status === 'alive' })),

  checkUsername: async (username: string) => {
    const data = await req<any>(`/api/v1/auth/username/check?username=${encodeURIComponent(username)}`)
    // support { available } or nested
    const available = data?.available ?? data?.data?.available ?? false
    return { available: !!available }
  },

  sendPhoneCode: (phone_number: string) => req<any>('/api/v1/auth/phone/send-code', {
    method: 'POST', body: JSON.stringify({ phone_number }),
  }),

  verifyPhoneCode: (phone_number: string, code: string) => req<any>('/api/v1/auth/phone/verify-code', {
    method: 'POST', body: JSON.stringify({ phone_number, code }),
  }),

  register: async (body: {
    username: string
    display_name: string
    password: string
    phone_number: string
    registration_token?: string
    email?: string
    profile_photo?: string | null
    bio?: string
  }) => {
    const payload: Record<string, unknown> = {
      username: body.username,
      display_name: body.display_name,
      password: body.password,
      phone_number: body.phone_number,
    }
    if (body.email) payload.email = body.email
    if (body.bio) payload.bio = body.bio
    if (body.profile_photo) payload.profile_photo = body.profile_photo
    return req<any>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  login: async (body: {
    phone_number?: string
    username?: string
    password: string
    device_name?: string
  }) => {
    const payload: Record<string, unknown> = {
      password: body.password,
      device_name: body.device_name || 'Web',
    }
    if (body.username) payload.username = body.username
    if (body.phone_number) payload.phone_number = body.phone_number
    const data = await req<any>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
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
    const theme = (data && data.theme) || 'purple'
    const prefs = (data && data.preferences) || {}
    const map: Record<string, string> = {
      chat_accent: 'chatAccent',
      font_size: 'fontSize',
      status_privacy: 'statusPrivacy',
      status_validity: 'statusValidity',
      msg_notif: 'msgNotif',
      group_notif: 'groupNotif',
      call_notif: 'callNotif',
      enter_is_send: 'enterIsSend',
      typing_indicator: 'typingIndicator',
      auto_download: 'autoDownload',
      sound: 'sound',
      read_receipts: 'readReceipts',
      status_like_notif: 'statusLikeNotif',
      hide_live_typing: 'hideLiveTyping',
      color_mode: 'colorMode',
      liquid_glass: 'liquidGlass',
    }
    const mapped: Record<string, unknown> = {
      theme: prefs.theme || theme,
      email: data?.email || '',
      phone: data?.phone_number || data?.phone || '',
      subscriptionPlan: (data?.subscription_plan || 'pro').replace('free', 'pro'),
      premiumExpiresAt: data?.premium_expires_at || null,
      // flatten server settings for client store
      ...(data?.settings
        ? {
            theme: data.settings.theme,
            chatAccent: data.settings.chat_accent,
            wallpaper: data.settings.wallpaper,
            colorMode: data.settings.color_mode,
            liquidGlass: data.settings.liquid_glass,
            statusValidity: data.settings.status_validity,
            statusPrivacy: data.settings.status_privacy,
            verifiedBadge: data.settings.verified_badge !== false,
            forceReadReceipts: !!data.settings.force_read_receipts,
            liveTyping: !!data.settings.live_typing,
            statusAdsEnabled: !!data.settings.status_ads_enabled,
          }
        : {}),
      accountStatus: data?.account_status || 'active',
      verifiedBadge: data?.subscription_plan === 'premium' && !!(data?.premium_settings?.verified_badge ?? true),
      premiumSettings: data?.premium_settings || {},
      deactivatedAt: data?.deactivated_at || null,
      scheduledDeletionAt: data?.scheduled_deletion_at || null,
    }
    for (const [k, v] of Object.entries(prefs)) {
      const fe = map[k] || k
      if (v !== undefined && v !== null) mapped[fe] = v
    }
    return {
      user: mapUser(data),
      settings: mapped,
    }
  },

  updatePreferences: async (prefs: Record<string, unknown>) => {
    return req<any>('/api/v1/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    })
  },

  updateMe: async (body: Record<string, unknown>) => {
    const payload: Record<string, unknown> = {}
    if (body.name !== undefined) payload.display_name = body.name
    if (body.display_name !== undefined) payload.display_name = body.display_name
    if (body.username !== undefined) payload.username = body.username
    if (body.bio !== undefined) payload.bio = body.bio
    if (body.photo !== undefined) payload.profile_photo = body.photo
    if (body.profile_photo !== undefined) payload.profile_photo = body.profile_photo
    if (body.theme !== undefined) payload.theme = body.theme
    if (Object.keys(payload).length === 0) return
    return req<any>('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  mpesaStkPush: async (body: { phone: string; plan: string }) => {
    return req<{ checkoutRequestId: string; merchantRequestId?: string }>('/api/v1/payments/mpesa/stk', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  mpesaVerify: async (checkoutRequestId: string) => {
    return req<{ paid: boolean; plan?: string; subscription_plan?: string }>(
      '/api/v1/payments/mpesa/verify',
      { method: 'POST', body: JSON.stringify({ checkoutRequestId }) },
    )
  },
  mpesaStatus: async (checkoutRequestId: string) => {
    return req<{ paid: boolean; plan?: string }>(`/api/v1/payments/mpesa/status/${encodeURIComponent(checkoutRequestId)}`)
  },
  upgradePremium: () =>
    req<any>('/api/v1/users/me/upgrade-premium', { method: 'POST' }),
  reactivateAccount: () =>
    req<any>('/api/v1/users/me/reactivate', { method: 'POST' }),
  deletePermanently: (password: string) =>
    req<any>('/api/v1/users/me/delete-permanently', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  updatePremiumSettings: (body: Record<string, unknown>) =>
    req<any>('/api/v1/users/me/premium-settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deactivateAccount: async (password: string) => {
    return req<any>('/api/v1/users/me/deactivate', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  },

  contacts: async () => {
    const list = await req<any[]>('/api/v1/contacts')
    return { contacts: (list || []).map(mapContact) }
  },

  searchUsers: async (q: string) => {
    const list = await req<any[]>(`/api/v1/users/search/${encodeURIComponent(q)}`)
    return { users: (list || []).map(mapUser) }
  },

  addContact: async (body: {
    username?: string
    peerId?: string
    savedName?: string
    message?: string
    sharePhone?: boolean
  }) => {
    if (!body.username) throw new Error('Username required to add contact')
    const data = await req<any>('/api/v1/contacts/requests', {
      method: 'POST',
      body: JSON.stringify({
        to_username: body.username.replace(/^@/, '').toLowerCase(),
        message: body.message || undefined,
        share_phone: !!body.sharePhone,
        from_nickname: body.savedName || body.nickname || undefined,
      }),
    })
    // Mutual auto-accept may already create the contact
    const r = await api.contacts()
    const uname = body.username.replace(/^@/, '').toLowerCase()
    return {
      request: data,
      contact: r.contacts.find((c) => c.username === uname) || null,
      pending: !r.contacts.find((c) => c.username === uname),
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

  blockUser: async (userId: string) => {
    await req(`/api/v1/contacts/block/${userId}`, { method: 'POST' })
    return { ok: true }
  },
  unblockUser: async (userId: string) => {
    await req(`/api/v1/contacts/block/${userId}`, { method: 'DELETE' })
    return { ok: true }
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

  updateContact: async (contactUserId: string, body: Record<string, unknown>) => {
    // Backend paths use contact_user_id (peer), not the contact document _id
    if (body.savedName !== undefined || body.nickname !== undefined) {
      await req(`/api/v1/contacts/${contactUserId}/nickname`, {
        method: 'PATCH',
        body: JSON.stringify({ nickname: body.savedName ?? body.nickname }),
      })
    }
    const r = await api.contacts()
    return {
      contact: r.contacts.find(
        (c) => c.peerId === contactUserId || c.id === contactUserId || c.entryId === contactUserId,
      )!,
    }
  },

  deleteContact: async (contactUserId: string) => {
    await req(`/api/v1/contacts/${contactUserId}`, { method: 'DELETE' })
    return { ok: true }
  },

  chats: async (opts?: { lean?: boolean; limit?: number }) => {
    const q = new URLSearchParams()
    if (opts?.lean) q.set('lean', 'true')
    if (opts?.limit) q.set('limit', String(opts.limit))
    const qs = q.toString()
    const data = await req<any>(`/api/v1/conversations${qs ? `?${qs}` : ''}`)
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

  messages: async (conversationId: string, opts?: { limit?: number; beforeId?: string }) => {
    const q = new URLSearchParams()
    q.set('limit', String(opts?.limit ?? 50))
    if (opts?.beforeId) q.set('before_id', opts.beforeId)
    const data = await req<any>(
      `/api/v1/messages/conversations/${conversationId}?${q.toString()}`,
    )
    const list = data.messages || data || []
    const mid = meId()
    return {
      messages: list.map((m: any) => mapMessage(m, mid)),
      nextCursor: data.next_cursor || null,
    }
  },

  send: async (
    conversationId: string,
    text: string,
    image?: string | null,
    opts?: { replyToId?: string; statusReply?: { preview: string; time?: string; statusId?: string } },
  ) => {
    let content = text || (image ? '' : '')
    if (opts?.statusReply) {
      // Encode status reply so peers can render the tag without schema changes
      const sid = opts.statusReply.statusId ? `⟦id⟧${opts.statusReply.statusId}` : ''
      content = `⟦status⟧${opts.statusReply.preview || ''}⟦t⟧${opts.statusReply.time || ''}${sid}⟦/⟧${content}`
    }
    const payload: Record<string, unknown> = {
      content,
      message_type: image ? 'image' : 'text',
    }
    if (image) {
      payload.media_attachments = [{ type: 'image', url: image }]
    }
    if (opts?.replyToId) {
      payload.reply_to_message_id = opts.replyToId
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

  /** Fire-and-forget friendly: peer had the payload ready to paint */
  markDelivered: async (messageId: string) => {
    await req(`/api/v1/messages/${messageId}/delivered`, { method: 'POST' })
    return { ok: true }
  },

  groupInvites: async () => {
    const list = await req<any[]>('/api/v1/groups/invites/mine')
    return { invites: list || [] }
  },
  acceptGroupInvite: async (id: string) => {
    return req<any>(`/api/v1/groups/invites/${id}/accept`, { method: 'POST' })
  },
  rejectGroupInvite: async (id: string) => {
    return req<any>(`/api/v1/groups/invites/${id}/reject`, { method: 'POST' })
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
    const now = Date.now()
    const mapped = (list || [])
      .map(mapStatus)
      .filter((s: any) => {
        if (!s.expiresAt) return true
        const t = Date.parse(s.expiresAt)
        return Number.isNaN(t) || t > now
      })
      .sort((a: any, b: any) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0
        return ta - tb // oldest first
      })
    return { status: mapped }
  },

  postStatus: async (
    text: string,
    image?: string | null,
    background?: string | null,
    opts?: { expiresInHours?: number; visibility?: string; video?: string },
  ) => {
    const payload: Record<string, unknown> = {
      content: text || '',
      status_type: opts?.video ? 'video' : image ? 'image' : 'text',
      visibility: opts?.visibility || 'contacts',
      expires_in_hours: opts?.expiresInHours ?? 24,
      background: background || 'theme_purple_grad',
    }
    const media: any[] = []
    if (image) media.push({ type: 'image', url: image })
    if (opts?.video) media.push({ type: 'video', url: opts.video })
    if (media.length) payload.media_attachments = media
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

  deleteStatus: async (id: string) => {
    await req(`/api/v1/statuses/${id}`, { method: 'DELETE' })
    return { ok: true }
  },

  statusViewers: async (id: string) => {
    const list = await req<any[]>(`/api/v1/statuses/${id}/viewers`)
    return {
      viewers: (list || []).map((v) => ({
        id: String(v.viewer_id || v.id),
        username: v.username || '',
        name: v.display_name || v.username || 'User',
        photo: v.profile_photo ?? null,
        viewedAt: v.viewed_at || null,
        liked: !!v.liked,
      })),
    }
  },

  likeStatus: async (id: string) => {
    return req<any>(`/api/v1/statuses/${id}/like`, { method: 'POST' })
  },

  listNotifications: async () => {
    const list = await req<any[]>('/api/v1/notifications')
    return { notifications: list || [] }
  },
  markNotificationRead: async (id: string) => {
    await req(`/api/v1/notifications/${id}/read`, { method: 'POST' })
    return { ok: true }
  },
  markAllNotificationsRead: async () => {
    await req('/api/v1/notifications/read-all', { method: 'POST' })
    return { ok: true }
  },

  iceServers: async () => {
    try {
      const data = await req<any>('/api/v1/calls/ice-servers')
      const list = data?.iceServers || data?.data?.iceServers || data || []
      return Array.isArray(list) ? list : []
    } catch {
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    }
  },

  calls: async () => {
    const data = await req<any>('/api/v1/calls')
    const list = data?.calls || data || []
    return {
      calls: (Array.isArray(list) ? list : []).map((c: any) => ({
        id: String(c.id || c._id),
        contactId: String(c.contactId || c.peer_id || ''),
        name: c.name || c.username || 'Unknown',
        username: c.username || '',
        phone: c.show_phone || c.phone ? (c.phone || '') : '',
        showPhone: !!(c.show_phone || c.phone),
        photo: c.photo || null,
        kind: c.kind === 'video' ? 'video' : 'audio',
        direction: c.direction || 'out',
        status: c.status || 'completed',
        duration: c.duration_seconds
          ? `${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, '0')}`
          : '0:00',
        duration_seconds: c.duration_seconds || 0,
        time: (() => {
          const iso = c.created_at || c.time
          if (!iso) return ''
          let s = String(iso)
          if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'
          const d = new Date(s)
          if (Number.isNaN(d.getTime())) return ''
          const now = new Date()
          const sameDay = d.toDateString() === now.toDateString()
          if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
          return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        })(),
        ago: c.created_at || c.time,
      })),
    }
  },
  logCall: async (body: {
    peer_id: string
    kind: 'audio' | 'video' | string
    direction?: string
    status?: string
    duration_seconds?: number
    call_id?: string
  }) => {
    return req<any>('/api/v1/calls', {
      method: 'POST',
      body: JSON.stringify({
        peer_id: body.peer_id,
        kind: body.kind === 'video' ? 'video' : 'audio',
        direction: body.direction || 'out',
        status: body.status || 'completed',
        duration_seconds: body.duration_seconds || 0,
        call_id: body.call_id,
      }),
    })
  },
  setTyping: async (contactId: string) => {
    try {
      const { wsTyping } = await import('./realtime')
      wsTyping(contactId, true)
    } catch { /* */ }
    return {}
  },
  getTyping: async (_contactId: string) => ({ typing: false }),
  /** Lightweight presence for a user id */
  presence: async (userId: string) => {
    try {
      const data = await req<any>(`/api/v1/users/presence/${encodeURIComponent(userId)}`)
      return {
        online: !!data?.online,
        lastSeen: data?.last_seen || data?.lastSeen || null,
      }
    } catch {
      return { online: false, lastSeen: null }
    }
  },
  editMessage: async (messageId: string, content: string) => {
    const data = await req<any>(`/api/v1/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    })
    return mapMessage(data, undefined)
  },
  deleteMessage: async (messageId: string) => {
    await req(`/api/v1/messages/${messageId}`, { method: 'DELETE' })
  },
  reactMessage: async (messageId: string, emoji: string) => {
    await req(`/api/v1/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    })
  },
  removeReaction: async (messageId: string, emoji: string) => {
    await req(`/api/v1/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    })
  },
  forwardMessage: async (messageId: string, conversationId: string) => {
    const data = await req<any>(`/api/v1/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId }),
    })
    return mapMessage(data, undefined)
  },
  ring: async (_to: string, _kind: 'audio' | 'video') => ({ ring: null }),
  incomingRings: async () => ({ incoming: [] as any[] }),
  answerRing: async (_id: string, _status: 'accepted' | 'declined') => ({}),
  ringStatus: async (_id: string) => ({ ring: null }),
}
