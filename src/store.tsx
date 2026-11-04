import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  api,
  clearSession,
  getStoredUser,
  setSession,
  hasAccessToken,
  isSessionDead,
  markSessionDead,
  markSessionAlive,
  type ApiUser,
  type ApiContact,
  type ChatPreview,
  saveStoredUser,
} from './api'
import { playIncomingMessageChime } from './lib/sounds'

export type Settings = {
  messageNotifs?: boolean
  callNotifs?: boolean
  statusNotifs?: boolean
  about?: string
  statusPrivacy?: string
  autoDownload?: string
  enterIsSend?: boolean
  language?: string

  name: string
  username: string
  bio: string
  phone: string
  photo: string | null
  lastSeen: string
  profilePhoto: string
  about: string
  groupsAdd: string
  readReceipts: boolean
  typingIndicator: boolean
  disappearing: string
  statusValidity: string
  statusPrivacy: string
  appLock: boolean
  twoStep: boolean
  msgNotif: boolean
  groupNotif: boolean
  callNotif: boolean
  previews: boolean
  vibrate: boolean
  sound: string
  fontSize: string
  enterIsSend: boolean
  wallpaper: string
  theme: string
  chatAccent: string
  autoDownload: string
  lowDataCalls: boolean
  language: string
  blocked: string[]
}

/** Brand palette — only these four drive customization. */
export const BRAND = {
  purple: '#7B2CBF',
  blue: '#6389EB',
  orange: '#FF8C00',
  white: '#FFFFFF',
} as const

/** Chat wallpapers — 4 solids then 4 aura-style gradients (brand × soft white). */
export const WALLPAPER_SOLIDS: { id: string; label: string; css: string }[] = [
  { id: 'PurpleSoft', label: 'Purple', css: '#F3EAFB' },
  { id: 'BlueSoft', label: 'Blue', css: '#E8EEFC' },
  { id: 'OrangeSoft', label: 'Orange', css: '#FFF1E0' },
  { id: 'Cloud', label: 'White', css: '#F5F6F8' },
]

export const WALLPAPER_GRADIENTS: { id: string; label: string; css: string }[] = [
  {
    id: 'PurpleMist',
    label: 'Purple mist',
    css: 'linear-gradient(145deg, #F8F1FF 0%, #EFE4F9 40%, #FFFFFF 100%)',
  },
  {
    id: 'BlueHaze',
    label: 'Blue haze',
    css: 'linear-gradient(150deg, #F0F4FF 0%, #E3EBFD 45%, #FFFFFF 100%)',
  },
  {
    id: 'OrangeGlow',
    label: 'Orange glow',
    css: 'linear-gradient(155deg, #FFF6EC 0%, #FFE8CC 50%, #FFFFFF 100%)',
  },
  {
    id: 'SoftLight',
    label: 'Soft light',
    css: 'linear-gradient(160deg, #FFFFFF 0%, #F7F8FA 55%, #EEF1F6 100%)',
  },
]

export const WALLPAPERS: Record<string, string> = Object.fromEntries(
  [...WALLPAPER_SOLIDS, ...WALLPAPER_GRADIENTS].map((w) => [w.id, w.css]),
)

export const WALLPAPER_KEYS = Object.keys(WALLPAPERS)

export const THEMES = {
  purple: {
    id: 'purple',
    label: 'Purple',
    primary: BRAND.purple,
    accent: '#9C31A1',
    soft: '#EFE4F9',
  },
  blue: {
    id: 'blue',
    label: 'Blue',
    primary: BRAND.blue,
    accent: '#4F73D4',
    soft: '#E3EBFD',
  },
  orange: {
    id: 'orange',
    label: 'Orange',
    primary: BRAND.orange,
    accent: '#F97316',
    soft: '#FFEDD5',
  },
  white: {
    id: 'white',
    label: 'Mono',
    primary: '#374151',
    accent: '#6B7280',
    soft: '#F3F4F6',
  },
} as const

export type ThemeId = keyof typeof THEMES

/** Chat bubble / accent colors (same 4 brand hues). */
export const CHAT_ACCENTS: { id: string; label: string; color: string }[] = [
  { id: 'purple', label: 'Purple', color: BRAND.purple },
  { id: 'blue', label: 'Blue', color: BRAND.blue },
  { id: 'orange', label: 'Orange', color: BRAND.orange },
  { id: 'neutral', label: 'Neutral', color: '#4B5563' },
]

export const FONT_SIZES: Record<string, string> = {
  Small: '0.9rem',
  Medium: '1rem',
  Large: '1.15rem',
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return '123, 44, 191'
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

export function applyTheme(themeId: string) {
  const t = THEMES[themeId as ThemeId] || THEMES.purple
  const root = document.documentElement
  root.style.setProperty('--color-brand-purple', t.primary)
  root.style.setProperty('--color-brand-magenta', t.accent)
  root.style.setProperty('--brand-shadow-rgb', hexToRgb(t.primary))
  root.dataset.theme = t.id
}

export function applyChatAccent(accentId: string) {
  const a = CHAT_ACCENTS.find((c) => c.id === accentId) || CHAT_ACCENTS[0]
  document.documentElement.style.setProperty('--chat-accent', a.color)
  document.documentElement.style.setProperty('--chat-accent-rgb', hexToRgb(a.color))
}

const defaultSettings: Settings = {
  name: '',
  username: '',
  bio: '',
  phone: '',
  photo: null,
  lastSeen: 'My contacts',
  profilePhoto: 'Everyone',
  about: 'My contacts',
  groupsAdd: 'My contacts',
  readReceipts: true,
  typingIndicator: true,
  disappearing: 'Off',
  statusValidity: '24 hours',
  statusPrivacy: 'My contacts',
  appLock: false,
  twoStep: false,
  msgNotif: true,
  groupNotif: true,
  callNotif: true,
  previews: true,
  vibrate: true,
  sound: 'Chime',
  fontSize: 'Medium',
  enterIsSend: true,
  wallpaper: 'Cloud',
  theme: 'purple',
  chatAccent: 'purple',
  autoDownload: 'Wi-Fi only',
  lowDataCalls: false,
  language: 'English',
  blocked: [],
}

type Store = {
  ready: boolean
  /** True after chats home can render (first chats hydrate done) */
  listsReady: boolean
  /** True after access token proved valid (or just logged in) — gates background polls */
  sessionOk: boolean
  me: ApiUser | null
  settings: Settings
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  saveProfile: (profile: { name: string; username: string; bio: string; photo: string | null }) => Promise<void>
  contacts: ApiContact[]
  chats: ChatPreview[]
  groups: any[]
  statusList: any[]
  calls: any[]
  /** Pending incoming save/contact requests (home badge) */
  saveRequestPending: number
  refreshChats: () => Promise<void>
  refreshContacts: () => Promise<void>
  toast: string | null
  showToast: (msg: string) => void
  clearToast: () => void
  refreshGroups: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshCalls: () => Promise<void>
  refreshSaveRequests: () => Promise<void>
  /** Optimistic local updates to status feed (UI-first) */
  patchStatusList: (fn: (list: any[]) => any[]) => void
  /** Optimistic upsert of a chat preview so ChatsHome updates instantly on send */
  upsertChatPreview: (preview: Partial<ChatPreview> & { contactId: string }) => void
  login: (phone: string, password: string) => Promise<ApiUser>
  register: (data: {
    phone: string
    countryCode: string
    username: string
    name?: string
    password: string
    bio?: string
    email?: string
    photo?: string | null
  }) => Promise<ApiUser>
  logout: () => Promise<void>
  applyUser: (user: ApiUser, settings?: Record<string, unknown>) => void
  createGroup: (name: string, desc: string, memberIds: string[]) => Promise<string>
  joinGroup: (code: string) => Promise<string>
  patchGroup: (id: string, fn: (g: any) => any) => void
  removeGroup: (id: string) => Promise<void>
}

const Ctx = createContext<Store>(null!)
export const useStore = () => useContext(Ctx)

export function stamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [listsReady, setListsReady] = useState(false)
  const [sessionOk, setSessionOk] = useState(false)
  const [me, setMe] = useState<ApiUser | null>(() =>
    hasAccessToken() ? getStoredUser() : null,
  )
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem('sc_settings')
      if (raw) {
        const merged = { ...defaultSettings, ...JSON.parse(raw) }
        applyTheme(merged.theme || 'purple')
        applyChatAccent(merged.chatAccent || 'purple')
        return merged
      }
    } catch {
      /* ignore */
    }
    applyTheme(defaultSettings.theme)
    applyChatAccent(defaultSettings.chatAccent)
    return defaultSettings
  })
  const [contacts, setContacts] = useState<ApiContact[]>([])
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [statusList, setStatusList] = useState<any[]>([])
  const [calls, setCalls] = useState<any[]>([])
  const [saveRequestPending, setSaveRequestPending] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearToast = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current)
      toastTimer.current = null
    }
    setToast(null)
  }, [])
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current)
      toastTimer.current = null
    }
    setToast(msg)
    toastTimer.current = setTimeout(() => {
      setToast(null)
      toastTimer.current = null
    }, 2500)
  }, [])

  const applyUser = useCallback((user: ApiUser, s?: Record<string, unknown>) => {
    setMe(user)
    setSettings((prev) => {
      const next = {
        ...prev,
        name: user.name,
        username: user.username,
        bio: user.bio,
        phone: user.phone,
        photo: user.photo,
        ...(s || {}),
      } as Settings
      try {
        localStorage.setItem('sc_settings', JSON.stringify(next))
        localStorage.setItem('sc_has_logged_in', '1')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const wipeSession = useCallback(() => {
    try {
      markSessionDead()
    } catch {
      clearSession()
    }
    setMe(null)
    setSessionOk(false)
    setChats([])
    setContacts([])
    setGroups([])
    setStatusList([])
    setCalls([])
    setSaveRequestPending(0)
    setListsReady(true)
  }, [])

  const refreshChats = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { chats: c } = await api.chats()
      // Cheap equality: length + last message iso/unread — avoid full JSON.stringify on every poll
      setChats((prev) => {
        if (prev.length === c.length) {
          let same = true
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i]
            const b = c[i]
            if (
              a.contactId !== b.contactId ||
              a.unread !== b.unread ||
              a.last !== b.last ||
              a.iso !== b.iso ||
              (a as any).receipt !== (b as any).receipt
            ) {
              same = false
              break
            }
          }
          if (same) return prev
        }
        return c
      })
    } catch (e: any) {
      if ((e as any)?.status === 401 || String(e?.message || '').toLowerCase().includes('unauthorized')) {
        wipeSession()
      }
    }
  }, [wipeSession])

  const refreshContacts = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { contacts: c } = await api.contacts()
      setContacts((prev) => (prev.length === c.length && JSON.stringify(prev) === JSON.stringify(c) ? prev : c))
    } catch {
      /* */
    }
  }, [])

  const refreshGroups = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { groups: g } = await api.groups()
      setGroups((prev) => (prev.length === g.length && JSON.stringify(prev) === JSON.stringify(g) ? prev : g))
    } catch {
      /* */
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { status } = await api.status()
      const now = Date.now()
      const active = (status || [])
        .filter((s: any) => {
          if (!s?.expiresAt) return true
          let exp = String(s.expiresAt)
          if (/^\d{4}-\d{2}-\d{2}T/.test(exp) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(exp)) exp += 'Z'
          const t = Date.parse(exp)
          return Number.isNaN(t) || t > now
        })
        .slice()
        .sort((a: any, b: any) => {
          const ta = a.createdAt ? Date.parse(a.createdAt) : 0
          const tb = b.createdAt ? Date.parse(b.createdAt) : 0
          return ta - tb
        })
      setStatusList((prev) =>
        prev.length === active.length && JSON.stringify(prev) === JSON.stringify(active) ? prev : active,
      )
    } catch (e: any) {
      if ((e as any)?.status === 401) wipeSession()
    }
  }, [wipeSession])

  const refreshSaveRequests = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { requests } = await api.incomingContactRequests()
      const n = (requests || []).filter((r: any) => r.status === 'pending').length
      setSaveRequestPending(n)
    } catch (e: any) {
      if ((e as any)?.status === 401) wipeSession()
    }
  }, [wipeSession])

  const patchStatusList = useCallback((fn: (list: any[]) => any[]) => {
    setStatusList((prev) => fn(prev))
  }, [])

  const upsertChatPreview = useCallback(
    (preview: Partial<ChatPreview> & { contactId: string }) => {
      setChats((prev) => {
        const idx = prev.findIndex(
          (c) =>
            c.contactId === preview.contactId ||
            (preview.conversationId && c.conversationId === preview.conversationId),
        )
        const nowIso = preview.iso || new Date().toISOString()
        const timeLabel =
          preview.time ||
          new Date(nowIso).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        if (idx >= 0) {
          const cur = prev[idx]
          const nextLast = preview.last ?? cur.last
          const contentChanged = nextLast !== cur.last || (preview.iso && preview.iso !== cur.iso)
          const updated: ChatPreview = {
            ...cur,
            ...preview,
            last: nextLast,
            time: contentChanged ? timeLabel : preview.time || cur.time,
            iso: contentChanged ? nowIso : preview.iso || cur.iso,
            unread: preview.unread !== undefined ? preview.unread : cur.unread,
            mine: preview.mine ?? cur.mine ?? true,
            state: preview.state ?? cur.state ?? 'sent',
          }
          // Receipt-only: patch in place (no reorder / re-animation)
          if (!contentChanged && idx === 0) {
            const next = [...prev]
            next[0] = updated
            return next
          }
          if (!contentChanged) {
            const next = [...prev]
            next[idx] = updated
            return next
          }
          // New peer message while app is open → soft inbox chime
          if (contentChanged && updated.mine === false) {
            try {
              const mutedMap = JSON.parse(localStorage.getItem('sc_chat_muted') || '{}')
              if (!mutedMap[updated.contactId]) playIncomingMessageChime()
            } catch {
              playIncomingMessageChime()
            }
          }
          // New message content → bump to top
          const next = [...prev]
          next[idx] = updated
          const [item] = next.splice(idx, 1)
          return [item, ...next]
        }
        // New conversation preview
        return [
          {
            contactId: preview.contactId,
            conversationId: preview.conversationId,
            name: preview.name,
            photo: preview.photo ?? null,
            hue: preview.hue,
            last: preview.last || '',
            time: timeLabel,
            unread: 0,
            mine: true,
            state: preview.state || 'pending',
            iso: nowIso,
          },
          ...prev,
        ]
      })
    },
    [],
  )

  const refreshCalls = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { calls: c } = await api.calls()
      setCalls(c || [])
    } catch (e: any) {
      if ((e as any)?.status === 401) wipeSession()
    }
  }, [wipeSession])

  /**
   * Ordered hydrate after auth is known-good:
   * chats → listsReady → calls → statuses → groups → save requests → contacts
   * (notifications stay on-demand when the screen opens)
   */
  const hydrateAfterAuth = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) {
      setListsReady(true)
      return
    }
    // 1. Chats only on the critical path — home can paint as soon as this returns
    await refreshChats()
    if (isSessionDead()) {
      setListsReady(true)
      return
    }
    setListsReady(true)
    setSessionOk(true)

    // 2–6 in parallel (not sequential) so secondary lists fill without blocking each other
    if (isSessionDead()) return
    await Promise.all([
      refreshCalls(),
      refreshStatus(),
      refreshGroups(),
      refreshSaveRequests(),
      refreshContacts(),
    ])
  }, [refreshChats, refreshCalls, refreshStatus, refreshGroups, refreshSaveRequests, refreshContacts])

  const bootStarted = useRef(false)
  useEffect(() => {
    if (bootStarted.current) return
    bootStarted.current = true
    const boot = async () => {
      const token = hasAccessToken()
      const stored = token ? getStoredUser() : null

      // Stale user blob without tokens → clean slate
      if (!token) {
        if (getStoredUser()) clearSession()
        setMe(null)
        setSessionOk(false)
        setReady(true)
        setListsReady(true)
        return
      }

      if (stored) applyUser(stored)
      setReady(true)

      // Prove the token with the first real data call (chats), not a separate /auth/me
      // Soft /auth/me only once, in parallel with ordered hydrate, for profile freshness
      void (async () => {
        try {
          const { user, settings: s } = await api.me()
          if (isSessionDead()) return
          const access = localStorage.getItem('sc_access') || localStorage.getItem('sc_token') || ''
          const refresh = localStorage.getItem('sc_refresh') || ''
          setSession(access, refresh, user)
          applyUser(user, s as Record<string, unknown>)
          setSessionOk(true)
        } catch (e: any) {
          if ((e as any)?.status === 401 || String(e?.message || '').toLowerCase().includes('unauthorized')) {
            wipeSession()
          }
        }
      })()

      await hydrateAfterAuth()
    }
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Global auth-failed from api layer (permanent 401 after refresh fail)
  useEffect(() => {
    const onFail = () => wipeSession()
    window.addEventListener('sc:auth-failed', onFail)
    return () => window.removeEventListener('sc:auth-failed', onFail)
  }, [wipeSession])

  // Background poll — only when session is proven OK; never /auth/me
  useEffect(() => {
    if (!sessionOk || !me || !hasAccessToken() || isSessionDead()) return
    let alive = true
    const id = setInterval(() => {
      if (!alive || !sessionOk || !hasAccessToken() || isSessionDead()) return
      void refreshChats()
      void refreshStatus()
    }, 25000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [sessionOk, me, refreshChats, refreshStatus])

  // Lighter poll for save-request badge
  useEffect(() => {
    if (!sessionOk || !me || !hasAccessToken() || isSessionDead()) return
    let alive = true
    const id = setInterval(() => {
      if (!alive || !sessionOk || !hasAccessToken() || isSessionDead()) return
      void refreshSaveRequests()
    }, 60000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [sessionOk, me, refreshSaveRequests])

  // Realtime WS — live messages + receipt ticks (no full re-fetch)
  useEffect(() => {
    if (!sessionOk || !me || !hasAccessToken() || isSessionDead()) {
      void import('./realtime').then((m) => m.disconnectRealtime())
      return
    }
    let stopped = false
    const myId = me.id
    void import('./realtime').then(({ connectRealtime, disconnectRealtime }) => {
      if (stopped) return
      connectRealtime({
        onMessage: (cid, m) => {
          if (!m?.id) return
          const mine = String(m.from) === String(myId)
          // Recipient: ack delivered BEFORE UI render — fire and forget
          if (!mine) {
            void api.markDelivered(m.id).catch(() => {})
          }
          const previewText = m.text || (m.image ? '📷 Photo' : '')
          const iso = m.time || new Date().toISOString()
          const timeLabel = new Date(iso).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
          // Patch home preview by conversationId (stable contactId from existing row)
          setChats((prev) => {
            const idx = prev.findIndex((c) => c.conversationId === cid)
            if (idx >= 0) {
              const cur = prev[idx]
              const updated = {
                ...cur,
                last: previewText,
                time: timeLabel,
                iso,
                mine,
                state: mine ? ((m.state as any) || 'sent') : cur.state,
                unread: mine ? 0 : (cur.unread || 0) + 1,
              }
              const next = [...prev]
              next.splice(idx, 1)
              return [updated, ...next]
            }
            if (mine) return prev
            // Unknown thread — create a lightweight preview from sender id
            return [
              {
                contactId: String(m.from),
                conversationId: cid,
                name: undefined,
                last: previewText,
                time: timeLabel,
                iso,
                unread: 1,
                mine: false,
                state: undefined,
              },
              ...prev,
            ]
          })
          try {
            window.dispatchEvent(new CustomEvent('sc:rt-msg', { detail: { cid, m, mine } }))
          } catch {
            /* */
          }
        },
        onReceipt: (cid, messageId, s) => {
          const state =
            s === 'read' ? 'read' : s === 'delivered' ? 'delivered' : s === 'sent' ? 'sent' : s
          // Patch home-row ticks when this is the latest message in that chat
          setChats((prev) => {
            const idx = prev.findIndex((c) => c.conversationId === cid)
            if (idx < 0) return prev
            const row = prev[idx]
            // Only bump receipt on own last message
            if (!row.mine) return prev
            const rank: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 }
            const nextRank = rank[state] ?? 0
            const curRank = rank[row.state || 'sent'] ?? 1
            if (nextRank <= curRank) return prev
            const next = [...prev]
            next[idx] = { ...row, state: state as any }
            return next
          })
          try {
            window.dispatchEvent(
              new CustomEvent('sc:rt-rcpt', { detail: { cid, id: messageId, s: state } }),
            )
          } catch {
            /* */
          }
        },
        onAck: (payload) => {
          try {
            window.dispatchEvent(new CustomEvent('sc:rt-ack', { detail: payload }))
          } catch {
            /* */
          }
        },
        onCall: (packet) => {
          try {
            window.dispatchEvent(new CustomEvent('sc:rt-call', { detail: packet }))
          } catch {
            /* */
          }
        },
        onTyping: (peerId, typing) => {
          try {
            window.dispatchEvent(
              new CustomEvent('sc:rt-typing', { detail: { peerId, typing } }),
            )
          } catch {
            /* */
          }
        },
        onPresence: (peerId, online, lastSeen) => {
          setContacts((prev) =>
            prev.map((c) =>
              c.id === peerId || c.peerId === peerId
                ? { ...c, online, lastSeen: lastSeen ?? c.lastSeen }
                : c,
            ),
          )
        },
      })
    })
    return () => {
      stopped = true
      void import('./realtime').then((m) => m.disconnectRealtime())
    }
  }, [sessionOk, me, upsertChatPreview])

  const login = async (identity: string, password: string) => {
    const raw = identity.trim()
    const looksPhone = raw.startsWith('+') || /^\d{7,15}$/.test(raw.replace(/[\s-]/g, ''))
    const session = looksPhone
      ? await api.login({ phone_number: raw.replace(/[^\d+]/g, ''), password })
      : await api.login({ username: raw.replace(/^@/, '').toLowerCase(), password })
    const { access_token, refresh_token, user } = session
    markSessionAlive()
    setSession(access_token, refresh_token, user)
    applyUser(user)
    setSessionOk(true)
    setListsReady(false)
    void hydrateAfterAuth()
    return user
  }

  const register = async (data: {
    phone: string
    countryCode: string
    username: string
    name?: string
    password: string
    bio?: string
    email?: string
    photo?: string | null
    registrationToken: string
  }) => {
    const nationalNumber = data.phone.replace(/\D/g, '').replace(/^0/, '')
    const phoneNumber = `${data.countryCode || ''}${nationalNumber}`.replace(/[^+\d]/g, '')
    await api.register({
      username: data.username,
      display_name: data.name || data.username,
      password: data.password,
      phone_number: phoneNumber,
      email: data.email || undefined,
      bio: data.bio || undefined,
      profile_photo: data.photo || undefined,
    })
    // Auto-login with username (always works); phone also supported on backend
    let access_token = ''
    let refresh_token = ''
    let user: ApiUser
    try {
      const session = await api.login({
        username: data.username,
        password: data.password,
      })
      access_token = session.access_token
      refresh_token = session.refresh_token
      user = session.user
    } catch {
      const session = await api.login({
        phone_number: phoneNumber,
        password: data.password,
      })
      access_token = session.access_token
      refresh_token = session.refresh_token
      user = session.user
    }
    // Ensure photo/bio applied (in case register ignored large photo)
    if (data.photo || data.bio) {
      try {
        await api.updateMe({
          bio: data.bio || undefined,
          photo: data.photo || undefined,
        })
        user = {
          ...user,
          bio: data.bio || user.bio,
          photo: data.photo || user.photo,
        }
      } catch {
        /* optional */
      }
    }
    markSessionAlive()
    setSession(access_token, refresh_token, user)
    applyUser(user)
    setSessionOk(true)
    setListsReady(false)
    void hydrateAfterAuth()
    return user
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* */
    }
    try {
      const { disconnectRealtime } = await import('./realtime')
      disconnectRealtime()
    } catch {
      /* */
    }
    // Clear auth tokens/user but keep device preferences (appLock etc.) in sc_settings
    // so a later login on this device still knows the user's lock preference.
    clearSession()
    setMe(null)
    setSessionOk(false)
    setChats([])
    setGroups([])
    setContacts([])
    setStatusList([])
    setCalls([])
    setSaveRequestPending(0)
    setListsReady(true)
    // Reset profile fields in memory; re-load device prefs from localStorage if present
    try {
      const raw = localStorage.getItem('sc_settings')
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Settings>
        setSettings({
          ...defaultSettings,
          appLock: !!saved.appLock,
          twoStep: !!saved.twoStep,
          msgNotif: saved.msgNotif ?? defaultSettings.msgNotif,
          groupNotif: saved.groupNotif ?? defaultSettings.groupNotif,
          callNotif: saved.callNotif ?? defaultSettings.callNotif,
          sound: saved.sound || defaultSettings.sound,
          language: saved.language || defaultSettings.language,
          wallpaper: saved.wallpaper || defaultSettings.wallpaper,
          fontSize: saved.fontSize || defaultSettings.fontSize,
        })
      } else {
        setSettings(defaultSettings)
      }
    } catch {
      setSettings(defaultSettings)
    }
  }

  const meRef = useRef(me)
  meRef.current = me

  // Device preferences are local-only. Never send them to the profile endpoint.
  const setSetting = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = { ...settings, [k]: v }
    setSettings(next)
    if (k === 'theme') applyTheme(String(v))
    if (k === 'chatAccent') applyChatAccent(String(v))
    try {
      localStorage.setItem('sc_settings', JSON.stringify(next))
    } catch {
      /* ignore storage quota / private browsing errors */
    }
  }, [settings])

  // Persist profile fields with one PATCH and update the local session cache;
  // profile saves must not call /auth/me again.
  const saveProfile = useCallback(async (profile: { name: string; username: string; bio: string; photo: string | null }) => {
    const current = meRef.current
    if (!current) throw new Error('You must be signed in to update your profile')
    await api.updateMe(profile)
    const updated: ApiUser = {
      ...current,
      name: profile.name,
      username: profile.username,
      bio: profile.bio,
      photo: profile.photo,
    }
    meRef.current = updated
    setMe(updated)
    saveStoredUser(updated)
    const nextSettings = { ...settings, ...profile }
    setSettings(nextSettings)
    try { localStorage.setItem('sc_settings', JSON.stringify(nextSettings)) } catch { /* ignore */ }
  }, [settings])

  const createGroup = async (name: string, desc: string, memberIds: string[]) => {
    const { group } = await api.createGroup({ name, desc, memberIds })
    await refreshGroups()
    return group.id as string
  }

  const joinGroup = async (code: string) => {
    const { group } = await api.joinGroup(code)
    await refreshGroups()
    return group.id as string
  }

  
  const patchGroup = (id: string, fn: (g: any) => any) => {
    setGroups((gs) => gs.map((g) => (g.id === id ? fn(g) : g)))
    // best-effort persist muted/pinned
    const g = groups.find((x) => x.id === id)
    if (g) {
      const next = fn(g)
      api.patchGroup(id, { muted: next.muted, pinned: next.pinned, name: next.name, desc: next.desc }).catch(() => {})
    }
  }
  const removeGroup = async (id: string) => {
    try {
      await api.deleteGroup(id)
    } catch { /* */ }
    setGroups((gs) => gs.filter((g) => g.id !== id))
  }

  const value = useMemo(
    () => ({
      ready,
      listsReady,
      sessionOk,
      me,
      settings,
      setSetting,
      saveProfile,
      contacts,
      chats,
      groups,
      statusList,
      calls,
      saveRequestPending,
      refreshChats,
      refreshContacts,
      toast,
      showToast,
      clearToast,
      refreshGroups,
      refreshStatus,
      refreshCalls,
      refreshSaveRequests,
      patchStatusList,
      upsertChatPreview,
      login,
      register,
      logout,
      applyUser,
      createGroup,
      joinGroup,
      patchGroup,
      removeGroup,
    }),
    [
      ready,
      listsReady,
      sessionOk,
      me,
      settings,
      contacts,
      chats,
      groups,
      statusList,
      calls,
      saveRequestPending,
      setSetting,
      saveProfile,
      refreshChats,
      refreshContacts,
      toast,
      showToast,
      clearToast,
      refreshGroups,
      refreshStatus,
      refreshCalls,
      refreshSaveRequests,
      patchStatusList,
      upsertChatPreview,
      login,
      register,
      logout,
      applyUser,
      createGroup,
      joinGroup,
      patchGroup,
      removeGroup,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
