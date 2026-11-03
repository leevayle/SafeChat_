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
import { api, clearSession, getStoredUser, setSession, type ApiUser, type ApiContact, type ChatPreview } from './api'

export type Settings = {
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
  autoDownload: string
  lowDataCalls: boolean
  language: string
  blocked: string[]
}

export const WALLPAPERS: Record<string, string> = {
  Cloud: '#F3F4F6',
  Lavender: '#EFE4F9',
  Peach: '#FFEBDD',
  Sky: '#E3EBFD',
}
export const FONT_SIZES: Record<string, string> = {
  Small: '0.9rem',
  Medium: '1rem',
  Large: '1.15rem',
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
  autoDownload: 'Wi-Fi only',
  lowDataCalls: false,
  language: 'English',
  blocked: [],
}

type Store = {
  ready: boolean
  /** True after first chats/contacts/status hydrate completes (or fails) */
  listsReady: boolean
  me: ApiUser | null
  settings: Settings
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  contacts: ApiContact[]
  chats: ChatPreview[]
  groups: any[]
  statusList: any[]
  calls: any[]
  refreshChats: () => Promise<void>
  refreshContacts: () => Promise<void>
  toast: string | null
  showToast: (msg: string) => void
  clearToast: () => void
  refreshGroups: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshCalls: () => Promise<void>
  /** Optimistic local updates to status feed (UI-first) */
  patchStatusList: (fn: (list: any[]) => any[]) => void
  /** Optimistic upsert of a chat preview so ChatsHome updates instantly on send */
  upsertChatPreview: (preview: Partial<ChatPreview> & { contactId: string }) => void
  login: (username: string, password: string) => Promise<ApiUser>
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
  const [me, setMe] = useState<ApiUser | null>(getStoredUser())
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem('sc_settings')
      if (raw) return { ...defaultSettings, ...JSON.parse(raw) }
    } catch {
      /* ignore */
    }
    return defaultSettings
  })
  const [contacts, setContacts] = useState<ApiContact[]>([])
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [statusList, setStatusList] = useState<any[]>([])
  const [calls, setCalls] = useState<any[]>([])
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

  const refreshChats = useCallback(async () => {
    try {
      const { chats: c } = await api.chats()
      setChats((prev) => (JSON.stringify(prev) === JSON.stringify(c) ? prev : c))
    } catch {
      /* offline seed ok */
    }
  }, [])

  const refreshContacts = useCallback(async () => {
    try {
      const { contacts: c } = await api.contacts()
      setContacts((prev) => (JSON.stringify(prev) === JSON.stringify(c) ? prev : c))
    } catch {
      /* */
    }
  }, [])

  const refreshGroups = useCallback(async () => {
    try {
      const { groups: g } = await api.groups()
      setGroups((prev) => (JSON.stringify(prev) === JSON.stringify(g) ? prev : g))
    } catch {
      /* */
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const { status } = await api.status()
      const now = Date.now()
      // Drop expired; keep chronological order (oldest → newest)
      const active = (status || [])
        .filter((s: any) => {
          if (!s?.expiresAt) return true
          const t = Date.parse(s.expiresAt)
          return Number.isNaN(t) || t > now
        })
        .slice()
        .sort((a: any, b: any) => {
          const ta = a.createdAt ? Date.parse(a.createdAt) : 0
          const tb = b.createdAt ? Date.parse(b.createdAt) : 0
          return ta - tb
        })
      setStatusList((prev) => (JSON.stringify(prev) === JSON.stringify(active) ? prev : active))
    } catch {
      /* */
    }
  }, [])

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
          const next = [...prev]
          next[idx] = {
            ...next[idx],
            ...preview,
            last: preview.last ?? next[idx].last,
            time: timeLabel,
            iso: nowIso,
            unread: preview.unread ?? 0,
            mine: preview.mine ?? true,
            state: preview.state ?? next[idx].state ?? 'sent',
          }
          // Bump to top
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
    try {
      const { calls: c } = await api.calls()
      setCalls((prev) => (JSON.stringify(prev) === JSON.stringify(c) ? prev : c))
    } catch {
      /* */
    }
  }, [])

  useEffect(() => {
    const boot = async () => {
      const stored = getStoredUser()
      if (!stored) {
        setReady(true)
        setListsReady(true)
        return
      }
      try {
        const { user, settings: s } = await api.me()
        const access = localStorage.getItem('sc_access') || localStorage.getItem('sc_token') || ''
        const refresh = localStorage.getItem('sc_refresh') || ''
        setSession(access, refresh, user)
        applyUser(user, s as Record<string, unknown>)
        await Promise.all([
          refreshChats(),
          refreshContacts(),
          refreshGroups(),
          refreshStatus(),
          refreshCalls(),
        ])
      } catch {
        clearSession()
        setMe(null)
      } finally {
        setReady(true)
        setListsReady(true)
      }
    }
    boot()
  }, [applyUser, refreshChats, refreshContacts, refreshGroups, refreshStatus, refreshCalls])

  // background poll — only while logged in, no full UI reset
  useEffect(() => {
    if (!me) return
    const id = setInterval(() => {
      refreshChats()
      refreshStatus()
    }, 8000)
    return () => clearInterval(id)
  }, [me, refreshChats, refreshStatus])

  const login = async (username: string, password: string) => {
    const { access_token, refresh_token, user } = await api.login({ username, password })
    // UI-first: session + user immediately so the app can navigate
    setSession(access_token, refresh_token, user)
    applyUser(user)
    setListsReady(false)
    // Background: hydrate lists without blocking the login screen
    void Promise.all([
      refreshChats(),
      refreshContacts(),
      refreshGroups(),
      refreshStatus(),
      refreshCalls(),
    ])
      .catch(() => {})
      .finally(() => setListsReady(true))
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
  }) => {
    await api.register({
      username: data.username,
      display_name: data.name || data.username,
      password: data.password,
      phone_number: data.phone ? `${data.countryCode || ''}${data.phone}` : undefined,
      email: data.email || undefined,
    })
    // Auto-login after register — same UI-first pattern
    const { access_token, refresh_token, user } = await api.login({
      username: data.username,
      password: data.password,
    })
    setSession(access_token, refresh_token, user)
    applyUser(user)
    setListsReady(false)
    if (data.bio) {
      void api.updateMe({ bio: data.bio }).catch(() => {})
    }
    void Promise.all([refreshChats(), refreshContacts(), refreshGroups(), refreshStatus(), refreshCalls()])
      .catch(() => {})
      .finally(() => setListsReady(true))
    return user
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* */
    }
    // Clear auth tokens/user but keep device preferences (appLock etc.) in sc_settings
    // so a later login on this device still knows the user's lock preference.
    clearSession()
    setMe(null)
    setChats([])
    setGroups([])
    setContacts([])
    setStatusList([])
    setCalls([])
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

  const setSetting = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((s) => {
      const next = { ...s, [k]: v }
      try {
        localStorage.setItem('sc_settings', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      const m = meRef.current
      if (m) {
        const payload: Record<string, unknown> = {}
        if (k === 'name' || k === 'username' || k === 'bio' || k === 'photo') payload[k] = v
        else payload.settings = { [k]: v }
        api.updateMe(payload).catch(() => {})
      }
      return next
    })
  }, [])

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
      me,
      settings,
      setSetting,
      contacts,
      chats,
      groups,
      statusList,
      calls,
      refreshChats,
      refreshContacts,
      toast,
      showToast,
      clearToast,
      refreshGroups,
      refreshStatus,
      refreshCalls,
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
      me,
      settings,
      contacts,
      chats,
      groups,
      statusList,
      calls,
      setSetting,
      refreshChats,
      refreshContacts,
      toast,
      showToast,
      clearToast,
      refreshGroups,
      refreshStatus,
      refreshCalls,
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
