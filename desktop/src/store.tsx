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
  mapStatusFromWs,
} from './api'
import { playIncomingMessageChime } from './lib/sounds'
import {
  clearAllCaches,
  loadCachedChats,
  saveCachedChats,
  loadCachedContacts,
  saveCachedContacts,
  loadCachedStatuses,
  saveCachedStatuses,
  setCacheOwner,
  cacheOwnerId,
  loadOutbox,
  removeOutbox,
} from './lib/appCache'
import { setCachedMessages, getCachedMessages, clearMessageCache } from './lib/messageCache'
import { warmPhoto } from './lib/photoCache'

const LS_OWNER_KEY = 'sc_user_id'

function wipeForeignLocalState() {
  try {
    // NEVER delete live auth tokens here — login may have just written them.
    // Keep appearance map so the next login can paint the right theme instantly.
    const keep = new Set([
      'sc_appearance_by_user',
      'sc_access',
      'sc_refresh',
      'sc_token',
      'sc_user',
      'sc_has_logged_in',
    ])
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('sc_') || k.startsWith('safechat')) && !keep.has(k)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

/** Local notifications for premium expiring / expired — shown in Notifications tab once. */
function pushLocalNotif(item: {
  id: string
  kind: string
  title: string
  body: string
  action?: string
}) {
  try {
    const raw = localStorage.getItem('sc_local_notifs')
    const list: any[] = raw ? JSON.parse(raw) : []
    if (list.some((n) => n.id === item.id)) return // once only
    const row = {
      ...item,
      iso: new Date().toISOString(),
      unread: true,
    }
    const next = [row, ...list].slice(0, 40)
    localStorage.setItem('sc_local_notifs', JSON.stringify(next))
    try {
      window.dispatchEvent(new CustomEvent('sc:local-notif', { detail: row }))
    } catch { /* */ }
  } catch { /* */ }
}

function pushPremiumLifecycleNotifs(
  prevPlan: string,
  nextPlan: string,
  expIso: string | null,
) {
  // Expired transition
  if (prevPlan === 'premium' && nextPlan !== 'premium') {
    pushLocalNotif({
      id: `premium-expired-${expIso || 'now'}`,
      kind: 'premium_expired',
      title: 'Premium ended',
      body: 'Your Premium membership has expired. Recharge to keep checkmark, live typing, and more.',
      action: 'recharge',
    })
    return
  }
  if (nextPlan !== 'premium' || !expIso) return
  const exp = Date.parse(expIso)
  if (!Number.isFinite(exp)) return
  const msLeft = exp - Date.now()
  const day = 24 * 60 * 60 * 1000
  if (msLeft > 0 && msLeft <= day) {
    // One notification per expiry date
    const dayKey = new Date(exp).toISOString().slice(0, 10)
    pushLocalNotif({
      id: `premium-expiring-${dayKey}`,
      kind: 'premium_expiring',
      title: 'Premium ends within 24 hours',
      body: 'Your Premium membership is about to expire. Recharge to stay Premium.',
      action: 'recharge',
    })
  }
}

type Settings = {
  messageNotifs?: boolean
  callNotifs?: boolean
  statusNotifs?: boolean
  about?: string
  statusPrivacy?: string
  forceReadReceipts?: boolean
  liveTyping?: boolean
  hideLiveTyping?: boolean
  verifiedBadge?: boolean
  statusAdsEnabled?: boolean
  statusLikeNotif?: boolean
  busyEnabled?: boolean
  busyScope?: string
  busyMessage?: string
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
  email: string
  subscriptionPlan: string // pro | premium
  premiumExpiresAt?: string | null
  liquidGlass: boolean
  colorMode: string
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
  showFab: boolean
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

/** Dark-mode wallpapers — same hue family, dimmed for night reading */
export const WALLPAPERS_DARK: Record<string, string> = {
  PurpleSoft: '#1a1224',
  BlueSoft: '#121820',
  OrangeSoft: '#1f1610',
  Cloud: '#121821',
  PurpleMist: 'linear-gradient(145deg, #1a1224 0%, #221833 40%, #121821 100%)',
  BlueHaze: 'linear-gradient(150deg, #121820 0%, #152030 45%, #121821 100%)',
  OrangeGlow: 'linear-gradient(155deg, #1f1610 0%, #241c12 50%, #121821 100%)',
  SoftLight: 'linear-gradient(160deg, #151a22 0%, #121821 55%, #0e1319 100%)',
}

export function resolveWallpaper(id: string | undefined, colorMode?: string): string {
  const key = id && WALLPAPERS[id] ? id : 'Cloud'
  if (String(colorMode || '').toLowerCase() === 'dark') {
    return WALLPAPERS_DARK[key] || WALLPAPERS_DARK.Cloud
  }
  return WALLPAPERS[key] || WALLPAPERS.Cloud
}

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

/** CSS-only theme — mutates documentElement, never remounts React. */
export function applyTheme(themeId: string) {
  const t = THEMES[themeId as ThemeId] || THEMES.purple
  const root = document.documentElement
  root.style.setProperty('--color-brand-purple', t.primary)
  root.style.setProperty('--color-brand-magenta', t.accent)
  root.style.setProperty('--brand-shadow-rgb', hexToRgb(t.primary))
  root.dataset.theme = t.id
  try {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', t.primary)
  } catch {
    /* ignore */
  }
}

export function applyLiquidGlass(on: boolean) {
  const root = document.documentElement
  if (on) root.dataset.glass = '1'
  else delete root.dataset.glass
}

export function applyColorMode(mode: string) {
  const root = document.documentElement
  // Settings only: 'dark' enables dark; anything else forces light
  const m = String(mode || 'light').toLowerCase() === 'dark' ? 'dark' : 'light'
  root.dataset.mode = m
  root.classList.toggle('dark', m === 'dark')
  if (m !== 'dark') {
    root.classList.remove('dark')
    root.dataset.mode = 'light'
  }
  try {
    root.style.colorScheme = m
  } catch {
    /* */
  }
}

export function applyChatAccent(accentId: string) {
  const a = CHAT_ACCENTS.find((c) => c.id === accentId) || CHAT_ACCENTS[0]
  document.documentElement.style.setProperty('--chat-accent', a.color)
  document.documentElement.style.setProperty('--chat-accent-rgb', hexToRgb(a.color))
}

export type Appearance = {
  theme: string
  chatAccent: string
  colorMode: string
  liquidGlass: boolean
}

const APPEARANCE_MAP_KEY = 'sc_appearance_by_user'

export function defaultAppearance(): Appearance {
  return {
    theme: 'purple',
    chatAccent: 'purple',
  timeFormat: '24h',
    colorMode: 'light',
    liquidGlass: false,
  }
}

/** Apply full appearance via CSS variables / data attrs only (no React re-render). */
export function applyAppearance(a: Partial<Appearance> | null | undefined) {
  const base = defaultAppearance()
  const next: Appearance = {
    theme: String(a?.theme || base.theme),
    chatAccent: String(a?.chatAccent || base.chatAccent),
    colorMode: String(a?.colorMode || base.colorMode),
    liquidGlass: !!(a?.liquidGlass ?? base.liquidGlass),
  }
  applyTheme(next.theme)
  applyChatAccent(next.chatAccent)
  applyColorMode(next.colorMode)
  applyLiquidGlass(next.liquidGlass)
  return next
}

function readAppearanceMap(): Record<string, Appearance> {
  try {
    const raw = localStorage.getItem(APPEARANCE_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Per-user appearance cache — survives account switch so login never flashes the wrong palette. */
export function loadUserAppearance(userId: string | null | undefined): Appearance | null {
  if (!userId) return null
  const map = readAppearanceMap()
  const a = map[userId]
  if (!a || typeof a !== 'object') return null
  return {
    theme: String(a.theme || 'purple'),
    chatAccent: String(a.chatAccent || 'purple'),
    colorMode: String(a.colorMode || 'light'),
    liquidGlass: !!a.liquidGlass,
  }
}

export function saveUserAppearance(userId: string | null | undefined, a: Partial<Appearance>) {
  if (!userId) return
  try {
    const map = readAppearanceMap()
    const prev = map[userId] || defaultAppearance()
    map[userId] = {
      theme: String(a.theme ?? prev.theme),
      chatAccent: String(a.chatAccent ?? prev.chatAccent),
      colorMode: String(a.colorMode ?? prev.colorMode),
      liquidGlass: !!(a.liquidGlass ?? prev.liquidGlass),
    }
    localStorage.setItem(APPEARANCE_MAP_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/** Resolve appearance: server settings > per-user cache > defaults. Apply CSS immediately. */
export function resolveAndApplyAppearance(
  userId: string | null | undefined,
  server?: Partial<Appearance> | null,
): Appearance {
  const cached = loadUserAppearance(userId)
  const merged: Appearance = {
    ...defaultAppearance(),
    ...(cached || {}),
    ...(server?.theme ? { theme: String(server.theme) } : {}),
    ...(server?.chatAccent ? { chatAccent: String(server.chatAccent) } : {}),
    ...(server?.colorMode ? { colorMode: String(server.colorMode) } : {}),
    ...(server?.liquidGlass != null ? { liquidGlass: !!server.liquidGlass } : {}),
  }
  applyAppearance(merged)
  if (userId) saveUserAppearance(userId, merged)
  return merged
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
  forceReadReceipts: false,
  liveTyping: true,
  hideLiveTyping: false,
  verifiedBadge: true,
  statusAdsEnabled: true,
  statusLikeNotif: true,
  busyEnabled: false,
  busyScope: 'everyone',
  busyMessage: '',
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
  showFab: true,
  wallpaper: 'Cloud',
  theme: 'purple',
  email: '',
  subscriptionPlan: 'pro',
  premiumExpiresAt: null as string | null,
  liquidGlass: false,
  colorMode: 'light',
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
  notifUnreadCount: number
  refreshChats: () => Promise<void>
  /** Pull latest plan/premium flags from server (other-device upgrades). */
  syncSubscription: () => Promise<void>
  refreshContacts: () => Promise<void>
  toast: string | null
  showToast: (msg: string) => void
  clearToast: () => void
  refreshGroups: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshSubscription: () => Promise<void>
  refreshCalls: () => Promise<void>
  refreshNotifCount: () => Promise<void>
  refreshSaveRequests: () => Promise<void>
  /** Optimistic local updates to status feed (UI-first) */
  patchStatusList: (fn: (list: any[]) => any[]) => void
  /** Optimistic upsert of a chat preview so ChatsHome updates instantly on send */
  upsertChatPreview: (preview: Partial<ChatPreview> & { contactId: string }) => void
  typingPeers: Record<string, boolean>
  presenceMap: Record<string, boolean>
  busyMap: Record<string, { message?: string; until?: string | null }>
  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void
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
      const owner = localStorage.getItem(LS_OWNER_KEY)
      const storedUser = hasAccessToken() ? getStoredUser() : null
      // Only restore palette when we know who owns this device session
      const ownerId = storedUser?.id || owner || null
      if (ownerId && storedUser?.id && owner && owner !== storedUser.id) {
        // Stale owner vs stored user mismatch — neutral defaults until login resolves
        applyAppearance(defaultAppearance())
        return defaultSettings
      }
      const cached = ownerId ? loadUserAppearance(ownerId) : null
      const raw = localStorage.getItem('sc_settings')
      if (raw) {
        const parsed = JSON.parse(raw)
        const merged = {
          ...defaultSettings,
          ...parsed,
          ...(cached || {}),
        }
        applyAppearance({
          theme: merged.theme,
          chatAccent: merged.chatAccent,
          colorMode: merged.colorMode,
          liquidGlass: merged.liquidGlass,
        })
        return merged
      }
      if (cached) {
        applyAppearance(cached)
        return { ...defaultSettings, ...cached }
      }
    } catch {
      /* ignore */
    }
    applyAppearance(defaultAppearance())
    return defaultSettings
  })
  const [contacts, setContacts] = useState<ApiContact[]>([])
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [typingPeers, setTypingPeers] = useState<Record<string, boolean>>({})
  /** userId -> online — used by Online filter + avatars (not only contacts list) */
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({})
  const [busyMap, setBusyMap] = useState<Record<string, { message?: string; until?: string | null }>>({})
  /** Conversation currently open in ChatWindow — inbound messages mark read, no unread bump */
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const activeConvRef = useRef<string | null>(null)
  activeConvRef.current = activeConversationId
  const typingClearRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const seenInboundRef = useRef<Set<string>>(new Set())
  const [groups, setGroups] = useState<any[]>([])
  const [statusList, setStatusList] = useState<any[]>([])
  const [calls, setCalls] = useState<any[]>([])
  const [saveRequestPending, setSaveRequestPending] = useState(0)
  const [notifUnreadCount, setNotifUnreadCount] = useState(0)
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
    // If stored prefs belong to another account, wipe immediately — first thing after auth
    try {
      const prevOwner = localStorage.getItem(LS_OWNER_KEY)
      if (prevOwner && prevOwner !== user.id) {
        wipeForeignLocalState()
        void clearAllCaches()
        clearMessageCache()
      }
      localStorage.setItem(LS_OWNER_KEY, user.id)
      setCacheOwner(user.id)
    } catch {
      /* ignore */
    }

    // CSS-only appearance BEFORE any React state that paints the shell
    const serverAppearance: Partial<Appearance> = {
      theme: (s?.theme as string) || (user as any).theme || undefined,
      chatAccent: (s?.chatAccent as string) || (user as any).chatAccent || undefined,
      colorMode: (s?.colorMode as string) || (user as any).colorMode || undefined,
      liquidGlass:
        s?.liquidGlass != null
          ? !!s.liquidGlass
          : (user as any).liquidGlass != null
            ? !!(user as any).liquidGlass
            : undefined,
    }
    const appearance = resolveAndApplyAppearance(user.id, serverAppearance)

    setMe(user)
    setSettings((prev) => {
      // Subscription ONLY from server - never upgrade from local cache alone
      const plan = ((user as any).subscriptionPlan || (s as any)?.subscriptionPlan || 'pro')
        .toString()
        .replace('free', 'pro')
      const isPremium = plan === 'premium'
      const ps = (user as any).premiumSettings || (s as any)?.premiumSettings || {}
      const next = {
        ...defaultSettings,
        ...prev,
        name: user.name,
        username: user.username,
        bio: user.bio,
        phone: user.phone,
        photo: user.photo,
        ...(s || {}),
        subscriptionPlan: isPremium ? 'premium' : 'pro',
        premiumExpiresAt: (user as any).premiumExpiresAt || (s as any)?.premiumExpiresAt || null,
        verifiedBadge: isPremium && ((user as any).verifiedBadge !== false) && ps.verified_badge !== false,
        forceReadReceipts: isPremium && !!(ps.force_read_receipts ?? (s as any)?.forceReadReceipts),
        liveTyping: isPremium && (ps.live_typing !== false) && ((s as any)?.liveTyping !== false),
        // Default ON unless the user explicitly turned ads off
        statusAdsEnabled:
          isPremium &&
          (ps.status_ads_enabled !== false) &&
          ((s as any)?.statusAdsEnabled !== false),
        // Appearance always wins from resolve (server > cache > defaults)
        theme: appearance.theme,
        chatAccent: appearance.chatAccent,
        colorMode: appearance.colorMode,
        liquidGlass: appearance.liquidGlass,
      } as Settings
      try {
        localStorage.setItem('sc_settings', JSON.stringify(next))
        localStorage.setItem('sc_has_logged_in', '1')
        localStorage.setItem(LS_OWNER_KEY, user.id)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  /** Server is source of truth for Premium — poll + foreground sync (no re-login). */
  const syncSubscription = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { user, settings: serverSettings } = await api.me()
      if (isSessionDead()) return
      const prevPlan = (settingsRef.current as any)?.subscriptionPlan || meRef.current?.subscriptionPlan || 'pro'
      const nextPlan = ((user as any).subscriptionPlan || (serverSettings as any)?.subscriptionPlan || 'pro')
        .toString()
        .replace('free', 'pro')
      applyUser(user, serverSettings as Record<string, unknown>)
      // Premium lifecycle → Notifications tab only (no toast spam)
      try {
        const expIso =
          (user as any).premiumExpiresAt ||
          (serverSettings as any)?.premiumExpiresAt ||
          null
        pushPremiumLifecycleNotifs(prevPlan, nextPlan, expIso)
      } catch { /* */ }
    } catch {
      /* soft — keep last known plan */
    }
  }, [applyUser])

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
    setPresenceMap({})
    setTypingPeers({})
    clearMessageCache()
    void clearAllCaches()
    // Do not inherit previous user's theme after session expiry / forced logout
    setSettings((prev) => {
      const next = {
        ...defaultSettings,
        appLock: !!prev.appLock,
        twoStep: !!prev.twoStep,
        msgNotif: prev.msgNotif ?? defaultSettings.msgNotif,
        groupNotif: prev.groupNotif ?? defaultSettings.groupNotif,
        callNotif: prev.callNotif ?? defaultSettings.callNotif,
        sound: prev.sound || defaultSettings.sound,
        language: prev.language || defaultSettings.language,
        wallpaper: prev.wallpaper || defaultSettings.wallpaper,
        fontSize: prev.fontSize || defaultSettings.fontSize,
      }
      try {
        localStorage.setItem('sc_settings', JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
    applyTheme(defaultSettings.theme)
    applyChatAccent(defaultSettings.chatAccent)
  }, [])

  const refreshChats = useCallback(async (opts?: { lean?: boolean }) => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { chats: c } = await api.chats({ lean: !!opts?.lean, limit: 50 })
      // Merge network into UI — never drop a row that is only local / newer than server
      setChats((prev) => {
        // Index local rows by contactId AND conversationId so nothing is dropped
        const byContact = new Map(prev.map((p) => [p.contactId, p]))
        const byConv = new Map(
          prev.filter((p) => p.conversationId).map((p) => [p.conversationId!, p]),
        )
        const seenContact = new Set<string>()
        const seenConv = new Set<string>()
        const merged = c.map((row) => {
          seenContact.add(row.contactId)
          if (row.conversationId) seenConv.add(row.conversationId)
          const old =
            byContact.get(row.contactId) ||
            (row.conversationId ? byConv.get(row.conversationId) : undefined)
          if (!old) return row
          const oldT = old.iso ? Date.parse(old.iso) : 0
          const newT = row.iso ? Date.parse(row.iso) : 0
          // Prefer local when newer or when server has no last text yet
          const keepLocalLast = oldT > newT || (!row.last && !!old.last)
          return {
            ...old,
            ...row,
            contactId: row.contactId || old.contactId,
            photo: row.photo || old.photo,
            name: row.name || old.name,
            hue: row.hue || old.hue,
            last: keepLocalLast ? old.last : row.last || old.last,
            iso: keepLocalLast ? old.iso : row.iso || old.iso,
            time: keepLocalLast ? old.time : row.time || old.time,
            state: keepLocalLast
              ? (old.state as any) || row.state
              : (row.state as any) || old.state,
            mine: keepLocalLast ? old.mine : row.mine ?? old.mine,
            conversationId: row.conversationId || old.conversationId,
            // Don't let a lagging server zero out a badge we just set locally
            unread:
              keepLocalLast && (old.unread || 0) > (row.unread || 0)
                ? old.unread
                : row.unread !== undefined
                  ? row.unread
                  : old.unread,
          }
        })
        // Keep local-only previews (new chats / offline sends not yet on server)
        for (const p of prev) {
          const byC = seenContact.has(p.contactId)
          const byV = p.conversationId && seenConv.has(p.conversationId)
          if (!byC && !byV) merged.push(p)
        }
        merged.sort((a, b) => (Date.parse(b.iso || '') || 0) - (Date.parse(a.iso || '') || 0))
        // Prefer the name YOU saved for this contact over their public display name
        const clist = contactsRef.current || []
        for (let i = 0; i < merged.length; i++) {
          const row = merged[i]
          const ct = clist.find(
            (x: any) => x.id === row.contactId || x.peerId === row.contactId,
          )
          const saved = (ct?.savedName || ct?.name || '').trim()
          if (saved) merged[i] = { ...row, name: saved }
        }
        if (prev.length === merged.length) {
          let same = true
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i]
            const b = merged[i]
            if (
              a.contactId !== b.contactId ||
              a.conversationId !== b.conversationId ||
              a.unread !== b.unread ||
              a.last !== b.last ||
              a.iso !== b.iso ||
              a.state !== b.state ||
              a.photo !== b.photo
            ) {
              same = false
              break
            }
          }
          if (same) return prev
        }
        void saveCachedChats(merged)
        return merged
      })
    } catch (e: any) {
      if ((e as any)?.status === 401 && !(e as any)?.soft) {
        wipeSession()
      }
    }
  }, [wipeSession])

  const refreshContacts = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { contacts: c } = await api.contacts()
      // Seed presence map from contact.online flags
      setPresenceMap((prev) => {
        const next = { ...prev }
        for (const ct of c) {
          const id = ct.id || ct.peerId
          if (id && ct.online) next[id] = true
        }
        return next
      })
      // Seed busy map so Online is replaced by custom message without waiting for WS
      setBusyMap((prev) => {
        const next = { ...prev }
        for (const ct of c) {
          const id = String(ct.id || ct.peerId || '')
          if (!id) continue
          if ((ct as any).busy && (ct as any).busyMessage) {
            next[id] = {
              message: (ct as any).busyMessage || 'busy',
              until: (ct as any).busyUntil || null,
            }
          }
        }
        return next
      })
      setContacts((prev) => {
        if (prev.length === c.length) {
          let same = true
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i] as any
            const b = c[i] as any
            if (
              a.id !== b.id ||
              a.name !== b.name ||
              a.photo !== b.photo ||
              a.phone_number !== b.phone_number ||
              a.username !== b.username ||
              a.busy !== b.busy ||
              a.busyMessage !== b.busyMessage
            ) {
              same = false
              break
            }
          }
          if (same) return prev
        }
        void saveCachedContacts(c)
        return c
      })
    } catch {
      /* */
    }
  }, [])

  const refreshGroups = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { groups: g } = await api.groups()
      setGroups((prev) => {
        if (prev.length === g.length) {
          let same = true
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i] as any
            const b = g[i] as any
            if (
              a.id !== b.id ||
              a.name !== b.name ||
              a.photo !== b.photo ||
              a.last !== b.last ||
              a.iso !== b.iso ||
              a.unread !== b.unread ||
              (a.members?.length ?? 0) !== (b.members?.length ?? 0)
            ) {
              same = false
              break
            }
          }
          if (same) return prev
        }
        return g
      })
    } catch {
      /* */
    }
  }, [])


  const refreshSubscription = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const { user, settings: s } = await api.me()
      applyUser(user, s as Record<string, unknown>)
    } catch {
      /* soft */
    }
  }, [applyUser])

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
      // Cheap equality: id + views length + text/image — avoid full JSON.stringify on every poll
      setStatusList((prev) => {
        // Keep optimistic / pending local statuses so they never flash away
        const pending = (prev || []).filter(
          (s: any) => s?.pending || String(s?.id || '').startsWith('local-status-'),
        )
        const serverIds = new Set(active.map((s: any) => s.id))
        // Drop pending only once server has a real row matching content+owner
        const stillPending = pending.filter((p: any) => {
          if (serverIds.has(p.id)) return false
          return !active.some(
            (s: any) =>
              s.userId === p.userId &&
              (s.text || '') === (p.text || '') &&
              !!s.image === !!p.image &&
              Math.abs((Date.parse(s.createdAt) || 0) - (Date.parse(p.createdAt) || 0)) < 120000,
          )
        })
        const merged = [...active, ...stillPending].sort((a: any, b: any) => {
          const ta = a.createdAt ? Date.parse(a.createdAt) : 0
          const tb = b.createdAt ? Date.parse(b.createdAt) : 0
          return ta - tb
        })
        if (prev.length === merged.length) {
          let same = true
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i] as any
            const b = merged[i] as any
            if (
              a.id !== b.id ||
              a.text !== b.text ||
              a.image !== b.image ||
              (a.views?.length ?? 0) !== (b.views?.length ?? 0) ||
              a.expiresAt !== b.expiresAt ||
              !!a.pending !== !!b.pending
            ) {
              same = false
              break
            }
          }
          if (same) return prev
        }
        void saveCachedStatuses(merged.filter((s: any) => !s.pending))
        return merged
      })
    } catch (e: any) {
      if ((e as any)?.status === 401 && !(e as any)?.soft) wipeSession()
    }
  }, [wipeSession])

  const refreshNotifCount = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const r = await api.notifUnreadCount()
      setNotifUnreadCount(Number(r?.count || 0))
    } catch {
      /* */
    }
  }, [])

  const refreshSaveRequests = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) return
    try {
      const [inRes, outRes] = await Promise.all([
        api.incomingContactRequests(),
        api.outgoingContactRequests().catch(() => ({ requests: [] as any[] })),
      ])
      const n = (inRes.requests || []).filter((r: any) => r.status === 'pending').length
      setSaveRequestPending(n)
      // When someone accepted our request, pull contacts so messaging works immediately
      const newlyAccepted = (outRes.requests || []).some((r: any) => r.status === 'accepted')
      if (newlyAccepted) {
        try {
          const { contacts: list } = await api.contacts()
          setContacts(list || [])
        } catch { /* */ }
      }
    } catch (e: any) {
      if ((e as any)?.status === 401 && !(e as any)?.soft) wipeSession()
    }
  }, [wipeSession])

  const patchStatusList = useCallback((fn: (list: any[]) => any[]) => {
    setStatusList((prev) => {
      const next = fn(prev)
      // Persist non-pending rows so optimistic posts survive refresh
      void saveCachedStatuses((next || []).filter((s: any) => !s?.pending && !String(s?.id || '').startsWith('local-')))
      return next
    })
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
        let nextList: ChatPreview[]
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
          if (!contentChanged && idx === 0) {
            nextList = [...prev]
            nextList[0] = updated
          } else if (!contentChanged) {
            nextList = [...prev]
            nextList[idx] = updated
          } else {
            if (updated.mine === false) {
              try {
                const mutedMap = JSON.parse(localStorage.getItem('sc_chat_muted') || '{}')
                if (!mutedMap[updated.contactId]) playIncomingMessageChime()
              } catch {
                playIncomingMessageChime()
              }
            }
            nextList = [...prev]
            nextList[idx] = updated
            const [item] = nextList.splice(idx, 1)
            nextList = [item, ...nextList]
          }
        } else {
          nextList = [
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
        }
        void saveCachedChats(nextList)
        return nextList
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
      if ((e as any)?.status === 401 && !(e as any)?.soft) wipeSession()
    }
  }, [wipeSession])

  /**
   * Phased hydrate (stale-while-revalidate):
   *  0. Cached chats already painted on boot (if any)
   *  1. Lean chat list (names + last message, no photos) → home interactive
   *  2. Prefetch last 50 messages for top conversations (+ full chat list with photos)
   *  3. Contacts / status / groups / calls / save requests in parallel
   *  4. Warm profile photos in background
   */
  const hydrateAfterAuth = useCallback(async () => {
    if (!hasAccessToken() || isSessionDead()) {
      setListsReady(true)
      return
    }

    // Phase 1 — lean inbox (fast, low traffic)
    await refreshChats({ lean: true })
    if (isSessionDead()) {
      setListsReady(true)
      return
    }
    setListsReady(true)
    setSessionOk(true)

    // Phase 2 — full list + last 50 msgs per recent thread (bounded concurrency)
    if (isSessionDead()) return
    void refreshChats({ lean: false })

    const snapshot = await (async () => {
      // Read current chats from state via a one-shot promise
      return new Promise<ChatPreview[]>((resolve) => {
        setChats((cur) => {
          resolve(cur)
          return cur
        })
      })
    })()

    const toPrefetch = (snapshot || [])
      .filter((c) => c.conversationId)
      .slice(0, 20)

    const CONCURRENCY = 4
    for (let i = 0; i < toPrefetch.length; i += CONCURRENCY) {
      if (isSessionDead()) break
      const batch = toPrefetch.slice(i, i + CONCURRENCY)
      await Promise.all(
        batch.map(async (ch) => {
          const cid = ch.conversationId!
          try {
            const { messages } = await api.messages(cid, { limit: 50 })
            setCachedMessages(cid, messages)
          } catch {
            /* soft */
          }
        }),
      )
    }

    // Phase 3 — secondary lists
    if (isSessionDead()) return
    await Promise.all([
      refreshCalls(),
      refreshStatus(),
      refreshGroups(),
      refreshSaveRequests(),
      refreshContacts(),
      refreshNotifCount(),
    ])

    // Phase 4 — warm photos (does not block UI)
    try {
      const origin = (import.meta as any).env?.VITE_API_URL || ''
      setContacts((cur) => {
        for (const c of cur.slice(0, 40)) {
          if (c.photo) warmPhoto(c.id, c.photo, origin)
        }
        return cur
      })
      setChats((cur) => {
        for (const ch of cur.slice(0, 40)) {
          if (ch.photo) warmPhoto(ch.contactId, ch.photo, origin)
        }
        return cur
      })
    } catch {
      /* */
    }
  }, [refreshChats, refreshCalls, refreshStatus, refreshGroups, refreshSaveRequests, refreshContacts, refreshNotifCount])

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

      // Paint cached inbox / contacts / statuses BEFORE network (stale-while-revalidate)
      try {
        const owner = cacheOwnerId()
        if (stored?.id && (!owner || owner === stored.id)) {
          const [cachedChats, cachedContacts, cachedStatuses] = await Promise.all([
            loadCachedChats<ChatPreview>(),
            loadCachedContacts<ApiContact>(),
            loadCachedStatuses<any>(),
          ])
          if (cachedChats.length) {
            setChats(cachedChats)
            setListsReady(true)
          }
          if (cachedContacts.length) setContacts(cachedContacts)
          if (cachedStatuses.length) setStatusList(cachedStatuses)
          setCacheOwner(stored.id)
        }
      } catch {
        /* */
      }

      setReady(true)

      // Ensure access token is valid/fresh before any protected hydrate calls
      try {
        const { ensureSessionFresh } = await import('./api') as any
        if (typeof ensureSessionFresh === 'function') {
          await ensureSessionFresh()
        }
      } catch { /* */ }

      // /auth/me + ordered hydrate — boot is authoritative: hard 401 means re-login
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
          // On cold boot a 401 (even "soft") means tokens are dead — send to login
          if ((e as any)?.status === 401) {
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

  // Subscription sync — industry pattern: server truth on interval + app foreground
  // Catches upgrades/expiry done on another device without logout
  useEffect(() => {
    if (!sessionOk || !me || !hasAccessToken() || isSessionDead()) return
    let alive = true
    const run = () => {
      if (!alive || isSessionDead()) return
      void syncSubscription()
    }
    // First check shortly after session is ready (other device may have upgraded)
    const t0 = window.setTimeout(run, 4000)
    const id = window.setInterval(run, 3 * 60 * 1000) // every 3 minutes
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    const onFocus = () => run()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      clearTimeout(t0)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
    }
  }, [sessionOk, me?.id, syncSubscription])

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
        onStatus: (st) => {
          if (st !== 'open' && st !== 'connected') return
          // Flush outbox when connection restored
          void loadOutbox().then(async (items) => {
            for (const item of items) {
              if (!item.conversationId) continue
              try {
                await api.send(item.conversationId, item.text, item.image)
                await removeOutbox(item.id)
              } catch { /* retry next open */ }
            }
          })
        },
        onMessage: (cid, m) => {
          if (!m?.id) return
          const mid = String(m.id)
          const ck = String(m.client_key || m.clientKey || mid)
          const mine = String(m.from) === String(myId)

          // 1) Build the full message object once (time-ordered, complete fields)
          let previewText = m.text || (m.image ? '📷 Photo' : '')
          const sr = String(previewText).match(/^⟦status⟧([\s\S]*?)⟦t⟧([\s\S]*?)(?:⟦id⟧([\s\S]*?))?⟦\/⟧([\s\S]*)$/)
          if (sr) {
            const body = (sr[4] || '').trim()
            previewText = body ? `Status reply: ${body}` : 'Status reply'
          }
          const iso = m.time || new Date().toISOString()
          let timeLabel = ''
          try {
            timeLabel = new Date(iso).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          } catch {
            timeLabel = ''
          }
          const mapped: any = {
            id: mid,
            clientKey: ck,
            from: String(m.from || ''),
            text: m.text || '',
            time: iso,
            timeLabel,
            mine,
            state: (m.state as any) || 'sent',
            image: m.image || null,
            replyToId: m.reply_to_message_id || m.replyToId || null,
            replyToText: m.reply_to_text || m.replyToText || null,
            reactions: m.reactions || [],
          }

          // 2) Cache first — UI only sees the message after cache is updated
          try {
            const prev = getCachedMessages(cid) || []
            const exists = prev.some(
              (x: any) => x.id === mid || x.clientKey === ck || (x.clientKey && x.clientKey === mid),
            )
            if (!exists) {
              // Insert by timestamp so order is stable when opening the thread
              const next = [...prev, mapped].sort(
                (a: any, b: any) => (Date.parse(a.time) || 0) - (Date.parse(b.time) || 0),
              )
              setCachedMessages(cid, next)
            } else {
              // In-place upgrade only — never append a second copy
              setCachedMessages(
                cid,
                prev.map((x: any) =>
                  x.id === mid || x.clientKey === ck || x.clientKey === mid
                    ? { ...x, ...mapped, clientKey: x.clientKey || ck }
                    : x,
                ),
              )
            }
          } catch { /* */ }

          // 3) Delivery / read side-effects (no UI)
          if (!mine) {
            void api.markDelivered(mid).catch(() => {})
          }
          const openNow = !!(activeConvRef.current && activeConvRef.current === cid)
          if (openNow && !mine) {
            void api.markRead(cid).catch(() => {})
            void import('./realtime').then(({ wsReceipt }) => {
              try { wsReceipt({ conversationId: cid, messageId: mid, state: 'read' }) } catch { /* */ }
            }).catch(() => {})
          }

          // 4) Home feed — one atomic update with full row details
          const already = seenInboundRef.current.has(mid)
          if (!mine) seenInboundRef.current.add(mid)
          setChats((prev) => {
            const idx = prev.findIndex((c) => c.conversationId === cid)
            let nextList: typeof prev
            if (idx >= 0) {
              const cur = prev[idx]
              // Resolve display name from contacts if the row is sparse
              let name = cur.name
              let photo = cur.photo
              let hue = cur.hue
              if (!name && !mine) {
                const ct = (contactsRef.current || []).find(
                  (x: any) => x.id === cur.contactId || x.peerId === cur.contactId || x.id === m.from,
                )
                if (ct) {
                  name = ct.savedName || ct.name || name
                  photo = photo || ct.photo
                  hue = hue || ct.hue
                }
              }
              const updated = {
                ...cur,
                name,
                photo,
                hue,
                last: previewText,
                time: timeLabel,
                iso,
                mine,
                state: mine ? ((m.state as any) || 'sent') : cur.state,
                unread: mine || openNow ? 0 : already ? (cur.unread || 0) : (cur.unread || 0) + 1,
                conversationId: cid,
              }
              nextList = [...prev]
              nextList.splice(idx, 1)
              nextList = [updated, ...nextList]
            } else if (mine) {
              // Own send: home row should already exist via upsertChatPreview
              return prev
            } else {
              const ct = (contactsRef.current || []).find(
                (x: any) => x.id === m.from || x.peerId === m.from,
              )
              nextList = [
                {
                  contactId: String(m.from),
                  conversationId: cid,
                  name: ct?.savedName || ct?.name,
                  photo: ct?.photo ?? null,
                  hue: ct?.hue,
                  last: previewText,
                  time: timeLabel,
                  iso,
                  unread: openNow ? 0 : 1,
                  mine: false,
                  state: undefined,
                },
                ...prev,
              ]
            }
            void saveCachedChats(nextList)
            return nextList
          })

          // 5) Notify open ChatWindow once — it merges by id/clientKey (no double bubble)
          try {
            window.dispatchEvent(
              new CustomEvent('sc:rt-msg', {
                detail: { cid, m: { ...m, id: mid, client_key: ck, clientKey: ck, time: iso }, mine },
              }),
            )
          } catch { /* */ }
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
          // Server logged the message — flip home-row ticks pending → sent immediately
          const cid = (payload as any)?.c as string | undefined
          const st = ((payload as any)?.s as string) || 'sent'
          if (cid && (payload as any)?.ok !== false) {
            setChats((prev) => {
              const idx = prev.findIndex((c) => c.conversationId === cid)
              if (idx < 0) return prev
              const row = prev[idx]
              if (!row.mine) return prev
              const rank: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 }
              const nextRank = rank[st] ?? 1
              const curRank = rank[row.state || 'pending'] ?? 0
              if (nextRank <= curRank) return prev
              const next = [...prev]
              next[idx] = { ...row, state: st as any }
              void saveCachedChats(next)
        try { (window as any).__sc_chats_snap = next } catch { /* */ }
              return next
            })
          }
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
          const on = !!typing
          // Clear any previous idle timer
          const prevTimer = typingClearRef.current[peerId]
          if (prevTimer) {
            clearTimeout(prevTimer)
            delete typingClearRef.current[peerId]
          }
          setTypingPeers((prev) => {
            if (!!prev[peerId] === on) return prev
            const next = { ...prev }
            if (on) next[peerId] = true
            else delete next[peerId]
            return next
          })
          // Auto-clear so home feed returns to last message text
          if (on) {
            typingClearRef.current[peerId] = setTimeout(() => {
              setTypingPeers((prev) => {
                if (!prev[peerId]) return prev
                const next = { ...prev }
                delete next[peerId]
                return next
              })
              delete typingClearRef.current[peerId]
              try {
                window.dispatchEvent(
                  new CustomEvent('sc:rt-typing', { detail: { peerId, typing: false } }),
                )
              } catch { /* */ }
            }, 4000)
          }
          try {
            window.dispatchEvent(
              new CustomEvent('sc:rt-typing', { detail: { peerId, typing: on } }),
            )
          } catch {
            /* */
          }
        },
        onPresence: (peerId, online, lastSeen, extra?: any) => {
          setPresenceMap((prev) => {
            if (prev[peerId] === !!online) return prev
            return { ...prev, [peerId]: !!online }
          })
          if (extra && ('busy' in extra || extra.busyMessage)) {
            setBusyMap((prev) => ({
              ...prev,
              [peerId]: extra.busy
                ? { message: extra.busyMessage || 'busy', until: extra.busyUntil || null }
                : { message: '', until: null },
            }))
          }
          setContacts((prev) =>
            prev.map((c) =>
              c.id === peerId || c.peerId === peerId
                ? {
                    ...c,
                    online,
                    lastSeen: lastSeen ?? c.lastSeen,
                    busy: !!(extra && extra.busy),
                    busyMessage: extra?.busy ? (extra.busyMessage || 'busy') : '',
                  }
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
    const cleanedPhone = raw.replace(/[^\d+]/g, '')
    const looksPhone = raw.startsWith('+') || /^\d{7,15}$/.test(raw.replace(/[\s-]/g, ''))
    let session
    if (looksPhone) {
      try {
        session = await api.login({ phone_number: cleanedPhone, password })
      } catch (e) {
        // Fallback: some users type phone without + but username may match digits-only accounts
        session = await api.login({
          phone_number: cleanedPhone,
          username: raw.replace(/^@/, '').toLowerCase(),
          password,
        }).catch(() => { throw e })
      }
    } else {
      try {
        session = await api.login({ username: raw.replace(/^@/, '').toLowerCase(), password })
      } catch (e) {
        // If username failed, retry as phone (user may omit +)
        if (/^\+?\d{7,15}$/.test(cleanedPhone)) {
          session = await api.login({ phone_number: cleanedPhone, password })
        } else {
          throw e
        }
      }
    }
    const { access_token, refresh_token, user } = session
    if (!access_token || !user?.id) {
      throw new Error('Login succeeded but session was incomplete — try again')
    }

    // Account switch: clear foreign prefs BEFORE writing new tokens
    try {
      const prevOwner = localStorage.getItem(LS_OWNER_KEY)
      if (prevOwner && prevOwner !== user.id) {
        wipeForeignLocalState()
        void clearAllCaches()
        clearMessageCache()
      }
    } catch {
      /* */
    }

    markSessionAlive()
    setSession(access_token, refresh_token, user)

    // Theme first (CSS only) — never flash another user's palette
    const loginTheme = (user as any).theme as string | undefined
    const loginAccent = (user as any).chatAccent as string | undefined
    resolveAndApplyAppearance(user.id, {
      ...(loginTheme ? { theme: loginTheme } : {}),
      ...(loginAccent ? { chatAccent: loginAccent } : {}),
      colorMode: (user as any).colorMode,
      liquidGlass: (user as any).liquidGlass,
    })
    applyUser(user, {
      ...(loginTheme ? { theme: loginTheme } : {}),
      ...(loginAccent ? { chatAccent: loginAccent } : {}),
    })

    // Inbox immediately with skeleton — hydrate + /me in background (never block navigation)
    setSessionOk(true)
    setListsReady(false)
    void hydrateAfterAuth().catch(() => {
      // Safety: never leave the user stuck on skeleton forever
      setListsReady(true)
    })
    void (async () => {
      try {
        const { user: fresh, settings: s } = await api.me()
        if (!isSessionDead()) applyUser(fresh, s as Record<string, unknown>)
      } catch {
        /* soft */
      }
    })()
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
    resolveAndApplyAppearance(user.id, (user as any).theme ? { theme: (user as any).theme } : null)
    applyUser(user)
    setSessionOk(true)
    setListsReady(false)
    const hydrateP = hydrateAfterAuth()
    void (async () => {
      try {
        const { user: fresh, settings: s } = await api.me()
        if (!isSessionDead()) applyUser(fresh, s as Record<string, unknown>)
      } catch {
        /* soft */
      }
    })()
    void hydrateP
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
    // Neutral device palette after logout (login will restore the next user's colors)
    applyAppearance(defaultAppearance())
  }

  const meRef = useRef(me)
  meRef.current = me
  const contactsRef = useRef(contacts)
  contactsRef.current = contacts

  // Device preferences are local-only. Never send them to the profile endpoint.
  // Busy fields are draft-only until the user taps "Update busy status".
  const setSetting = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = { ...settings, [k]: v }
    setSettings(next)
    // Appearance keys: CSS variables only — no component remount
    if (k === 'theme' || k === 'chatAccent' || k === 'liquidGlass' || k === 'colorMode') {
      applyAppearance({
        theme: String(next.theme),
        chatAccent: String(next.chatAccent),
        colorMode: String(next.colorMode),
        liquidGlass: !!next.liquidGlass,
      })
      const uid = meRef.current?.id || localStorage.getItem(LS_OWNER_KEY)
      saveUserAppearance(uid, {
        theme: String(next.theme),
        chatAccent: String(next.chatAccent),
        colorMode: String(next.colorMode),
        liquidGlass: !!next.liquidGlass,
      })
    }
    try {
      localStorage.setItem('sc_settings', JSON.stringify(next))
    } catch {
      /* ignore storage quota / private browsing errors */
    }
    // Busy draft keys: local only — no API call / toast (button handles save)
    const busyDraftKeys = new Set([
      'busyEnabled',
      'busyMessage',
      'busyUntil',
      'busyScope',
      'busyDurationMin',
    ])
    if (busyDraftKeys.has(k as string)) {
      return
    }
    const serverKey: Record<string, string> = {
      theme: 'theme',
      chatAccent: 'chat_accent',
      wallpaper: 'wallpaper',
      fontSize: 'font_size',
      language: 'language',
      statusPrivacy: 'status_privacy',
      statusValidity: 'status_validity',
      msgNotif: 'msg_notif',
      groupNotif: 'group_notif',
      callNotif: 'call_notif',
      enterIsSend: 'enter_is_send',
      typingIndicator: 'typing_indicator',
      autoDownload: 'auto_download',
      sound: 'sound',
      readReceipts: 'read_receipts',
      statusLikeNotif: 'status_like_notif',
      colorMode: 'color_mode',
      liquidGlass: 'liquid_glass',
      hideLiveTyping: 'hide_live_typing',
    }
    const sk = serverKey[k as string]
    // Background preference sync — no toast (only button-driven actions toast)
    if (sk && hasAccessToken() && !isSessionDead()) {
      void api.updatePreferences({ [sk]: v }).catch(() => { /* quiet */ })
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



  useEffect(() => {
    const onDelete = (ev: Event) => {
      const ids = ((ev as CustomEvent).detail?.ids || []) as string[]
      if (!ids.length) return
      const set = new Set(ids.map(String))
      setChats((prev) => {
        const next = prev.filter((c) => !set.has(String(c.contactId)) && !set.has(String(c.conversationId)))
        void saveCachedChats(next)
        return next
      })
    }
    const onDeleteLocked = (ev: Event) => {
      const ids = ((ev as CustomEvent).detail?.ids || []) as string[]
      if (!ids.length) return
      const set = new Set(ids.map(String))
      setChats((prev) => {
        const next = prev.filter((c) => !set.has(String(c.contactId)) && !set.has(String(c.conversationId)))
        void saveCachedChats(next)
        return next
      })
    }
    window.addEventListener('sc:delete-chats', onDelete)
    const onGameInvite = (ev: Event) => {
      setNotifUnreadCount((n) => n + 1)
      const d = (ev as CustomEvent).detail || {}
      void (async () => {
        try {
          const { loadCachedNotifications, saveCachedNotifications } = await import('./lib/appCache')
          const prev = (await loadCachedNotifications<any>()) || []
          const row = {
            id: `live-ginv-${d.game_id || Date.now()}`,
            type: 'game_invite',
            title: d.title || `${d.from_name || 'Someone'} wants to play`,
            body: d.body || 'Play or not now',
            actor_id: d.from,
            actor_name: d.from_name,
            game_id: d.game_id,
            metadata: { game_id: d.game_id },
            read: false,
            created_at: new Date().toISOString(),
          }
          const next = [row, ...prev.filter((x: any) => x.game_id !== row.game_id)].slice(0, 100)
          await saveCachedNotifications(next)
        } catch { /* */ }
      })()
    }
    window.addEventListener('sc:rt-game-invite', onGameInvite)
    const onNotifsCleared = () => setNotifUnreadCount(0)
    window.addEventListener('sc:notifs-cleared', onNotifsCleared)
    const onNotif = (ev: Event) => {
      setNotifUnreadCount((n) => n + 1)
      const d = (ev as CustomEvent).detail || {}
      void (async () => {
        try {
          const { loadCachedNotifications, saveCachedNotifications } = await import('./lib/appCache')
          const prev = (await loadCachedNotifications<any>()) || []
          const row = {
            id: `live-${d.status_id || d.game_id || Date.now()}`,
            type: d.t === 'status_like' ? 'status_like' : d.type || 'system',
            title: d.title || 'Notification',
            body: d.body || '',
            actor_id: d.from,
            actor_name: d.from_name,
            status_id: d.status_id,
            game_id: d.game_id,
            read: false,
            created_at: new Date().toISOString(),
          }
          const next = [row, ...prev.filter((x: any) => x.id !== row.id)].slice(0, 100)
          await saveCachedNotifications(next)
        } catch { /* */ }
      })()
    }
    window.addEventListener('sc:rt-notif', onNotif)
    const onDeleteCalls = (ev: Event) => {
      const ids = new Set((((ev as CustomEvent).detail?.ids || []) as string[]).map(String))
      if (!ids.size) return
      setCalls((prev: any[]) => {
        const next = prev.filter((c: any) => {
          const id = String(c.id || c.call_id || `${c.contactId}-${c.time}`)
          return !ids.has(id)
        })
        return next
      })
    }
    window.addEventListener('sc:delete-calls', onDeleteCalls)
    window.addEventListener('sc:delete-locked-chats', onDeleteLocked)
    return () => {
      window.removeEventListener('sc:delete-chats', onDelete)
      window.removeEventListener('sc:rt-game-invite', onGameInvite)
      window.removeEventListener('sc:notifs-cleared', onNotifsCleared)
      window.removeEventListener('sc:rt-notif', onNotif)
      window.removeEventListener('sc:delete-calls', onDeleteCalls)
      window.removeEventListener('sc:delete-locked-chats', onDeleteLocked)
    }
  }, [])

  // Live status: new posts, deletes, views/likes — full WS maximization
  useEffect(() => {
    const mapIncoming = (raw: any) => {
      try {
        return mapStatusFromWs(raw)
      } catch {
        const owner = raw.owner || {}
        const uid = String(raw.owner_user_id || owner.id || raw.userId || '')
        const media = raw.media_attachments || raw.media || []
        const img = media.find((m: any) => (m.type || '').startsWith('image') || m.url)?.url || raw.image
        const vid = media.find((m: any) => (m.type || '').startsWith('video'))?.url || raw.video
        return {
          id: String(raw.id || raw._id),
          userId: uid,
          text: raw.content || raw.text || '',
          image: img || null,
          video: vid || null,
          type: raw.status_type || raw.type || (vid ? 'video' : img ? 'image' : 'text'),
          background: raw.background || 'solid_1',
          createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
          expiresAt: raw.expires_at || raw.expiresAt || null,
          views: raw.viewer_ids || raw.views || [],
          viewCount: raw.view_count ?? (raw.viewer_ids || []).length ?? 0,
          user: {
            id: uid,
            name: owner.display_name || owner.name || raw.owner_display_name || 'Contact',
            username: owner.username || '',
            photo: owner.profile_photo ?? owner.photo ?? null,
          },
        }
      }
    }

    const onView = (ev: Event) => {
      const d = (ev as CustomEvent).detail as {
        statusId?: string
        viewCount?: number
        viewer?: any
        likeOnly?: boolean
      }
      if (!d?.statusId) return
      patchStatusList((list) =>
        list.map((s: any) => {
          if (s.id !== d.statusId) return s
          const views = Array.isArray(s.views) ? [...s.views] : []
          const vid = d.viewer?.viewer_id
          if (vid && !views.includes(vid)) views.push(vid)
          return {
            ...s,
            views,
            viewCount: d.viewCount ?? views.length,
          }
        }),
      )
      if (d.viewer?.viewer_id) {
        void (async () => {
          try {
            const { loadCachedViewers, saveCachedViewers } = await import('./lib/appCache')
            const prev = (await loadCachedViewers<any>(d.statusId!)) || []
            const idx = prev.findIndex((v: any) => v.viewer_id === d.viewer.viewer_id || v.id === d.viewer.viewer_id)
            let next: any[]
            if (idx >= 0) {
              // Update liked flag / fields in place (do not drop cache)
              next = prev.map((v, i) =>
                i === idx
                  ? {
                      ...v,
                      ...d.viewer,
                      liked: d.viewer.liked ?? v.liked,
                      name: d.viewer.display_name || d.viewer.name || v.name,
                      photo: d.viewer.profile_photo ?? d.viewer.photo ?? v.photo,
                    }
                  : v,
              )
            } else {
              next = [
                {
                  ...d.viewer,
                  id: d.viewer.viewer_id,
                  name: d.viewer.display_name || d.viewer.username || 'User',
                  photo: d.viewer.profile_photo || null,
                  liked: !!d.viewer.liked,
                },
                ...prev,
              ]
            }
            // Likers first
            next.sort((a, b) => Number(!!b.liked) - Number(!!a.liked))
            await saveCachedViewers(d.statusId!, next)
          } catch { /* */ }
        })()
      }
    }

    const onNew = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { status?: any }
      if (!d?.status) return
      // Notify + cache for Notifications tab
      try {
        const st = d.status
        const name =
          st.owner?.display_name ||
          st.owner?.username ||
          st.user?.name ||
          'Someone'
        setNotifUnreadCount((n) => n + 1)
        void (async () => {
          try {
            const { loadCachedNotifications, saveCachedNotifications } = await import('./lib/appCache')
            const prev = (await loadCachedNotifications<any>()) || []
            const row = {
              id: `live-snew-${st.id || Date.now()}`,
              type: 'status_new',
              title: `${name} posted a status`,
              body: 'Tap to view',
              actor_id: st.owner_user_id || st.userId,
              status_id: st.id,
              read: false,
              created_at: new Date().toISOString(),
            }
            await saveCachedNotifications([row, ...prev.filter((x: any) => x.id !== row.id)].slice(0, 100))
          } catch { /* */ }
        })()
        try {
          showToast(`${name} posted a status`)
        } catch { /* */ }
      } catch { /* */ }
      const mapped = mapIncoming(d.status)
      if (!mapped?.id) return
      patchStatusList((list) => {
        if (list.some((s: any) => s.id === mapped.id)) return list
        // Drop matching optimistic local row
        const withoutLocal = list.filter((s: any) => {
          if (!String(s.id).startsWith('local-status-')) return true
          return !(
            s.userId === mapped.userId &&
            (s.text || '') === (mapped.text || '') &&
            !!s.image === !!mapped.image
          )
        })
        return [...withoutLocal, mapped].sort(
          (a: any, b: any) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
        )
      })
    }

    const onDel = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { statusId?: string }
      if (!d?.statusId) return
      patchStatusList((list) => list.filter((s: any) => s.id !== d.statusId))
    }

    window.addEventListener('sc:rt-status-view', onView)
    window.addEventListener('sc:rt-status-new', onNew)
    window.addEventListener('sc:rt-status-delete', onDel)
    return () => {
      window.removeEventListener('sc:rt-status-view', onView)
      window.removeEventListener('sc:rt-status-new', onNew)
      window.removeEventListener('sc:rt-status-delete', onDel)
    }
  }, [patchStatusList])

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
      typingPeers,
      presenceMap,
      busyMap,
      activeConversationId,
      setActiveConversationId,
      groups,
      statusList,
      calls,
      saveRequestPending,
      notifUnreadCount,
      refreshChats,
      syncSubscription,
      refreshContacts,
      toast,
      showToast,
      clearToast,
      refreshGroups,
      refreshStatus,
      refreshSubscription,
      refreshCalls,
      refreshSaveRequests,
      refreshNotifCount,
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
      typingPeers,
      presenceMap,
      busyMap,
      activeConversationId,
      setActiveConversationId,
      groups,
      statusList,
      calls,
      saveRequestPending,
      notifUnreadCount,
      setSetting,
      saveProfile,
      refreshChats,
      syncSubscription,
      refreshContacts,
      toast,
      showToast,
      clearToast,
      refreshGroups,
      refreshStatus,
      refreshSubscription,
      refreshCalls,
      refreshSaveRequests,
      refreshNotifCount,
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
