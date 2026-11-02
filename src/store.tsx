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
  login: (phone?: string, username?: string) => Promise<ApiUser>
  register: (data: {
    phone: string
    countryCode: string
    username: string
    name?: string
    bio?: string
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
  const [me, setMe] = useState<ApiUser | null>(getStoredUser())
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [contacts, setContacts] = useState<ApiContact[]>([])
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [statusList, setStatusList] = useState<any[]>([])
  const [calls, setCalls] = useState<any[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
  }, [])
  const clearToast = useCallback(() => setToast(null), [])

  const applyUser = useCallback((user: ApiUser, s?: Record<string, unknown>) => {
    setMe(user)
    setSettings((prev) => ({
      ...prev,
      name: user.name,
      username: user.username,
      bio: user.bio,
      phone: user.phone,
      photo: user.photo,
      ...(s || {}),
    }))
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
      setStatusList((prev) => (JSON.stringify(prev) === JSON.stringify(status) ? prev : status))
    } catch {
      /* */
    }
  }, [])

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
        return
      }
      try {
        const { user, settings: s } = await api.me()
        setSession(localStorage.getItem('sc_token') || '', user)
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

  const login = async (phone?: string, username?: string) => {
    const { token, user } = await api.login({ phone, username })
    setSession(token, user)
    applyUser(user)
    await Promise.all([
      refreshChats(),
      refreshContacts(),
      refreshGroups(),
      refreshStatus(),
      refreshCalls(),
    ])
    return user
  }

  const register = async (data: {
    phone: string
    countryCode: string
    username: string
    name?: string
    bio?: string
    photo?: string | null
  }) => {
    const { token, user } = await api.register(data)
    setSession(token, user)
    applyUser(user)
    await Promise.all([refreshChats(), refreshContacts(), refreshGroups()])
    return user
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* */
    }
    clearSession()
    setMe(null)
    setChats([])
    setGroups([])
    setContacts([])
    setStatusList([])
    setCalls([])
    setSettings(defaultSettings)
  }

  const meRef = useRef(me)
  meRef.current = me

  const setSetting = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((s) => {
      const next = { ...s, [k]: v }
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
      refreshGroups,
      refreshStatus,
      refreshCalls,
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
