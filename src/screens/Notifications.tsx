import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  UserPlus,
  PhoneMissed,
  MessageCircle,
  Info,
  CheckCheck,
  Gamepad2,
  Circle,
  Heart,
} from 'lucide-react'
import { LogoIcon } from '../components/Logo'
import { useStore } from '../store'
import { Avatar } from '../components/Avatar'
import { api, hasAccessToken } from '../api'
// status_like notifications from server
import { loadCachedNotifications, saveCachedNotifications } from '../lib/appCache'

type Props = {
  onBack: () => void
  onOpenChat?: (contactId: string) => void
  onOpenSaveRequests?: () => void
  onOpenCalls?: () => void
  onOpenStatus?: (userId: string, statusId?: string) => void
}

type Filter = 'all' | 'calls' | 'status' | 'games' | 'system'

type NotifItem = {
  id: string
  kind: 'request' | 'missed_call' | 'message' | 'system' | 'premium' | 'game' | 'status'
  title: string
  body: string
  when: string
  iso?: string
  unread?: boolean
  contactId?: string
  photo?: string | null
  hue?: [string, string]
  action?: string
}

function timeLabel(iso?: string) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function Notifications({
  onBack,
  onOpenChat,
  onOpenSaveRequests,
  onOpenCalls,
  onOpenStatus,
}: Props) {
  const { saveRequestPending, calls, chats, contacts, showToast, me, refreshContacts, refreshNotifCount } = useStore()
  const meIdPlaceholder = me?.id || ''
  const [filter, setFilter] = useState<Filter>('all')
  const prevFilterRef = useRef<Filter>('all')
  const itemsRef = useRef<NotifItem[]>([])
  const [incoming, setIncoming] = useState<any[]>([])
  const [serverNotifs, setServerNotifs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [gameDoneIds, setGameDoneIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('sc_game_invite_done')
      return new Set(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set()
    }
  })
  const markGameDone = (id: string, gameId?: string) => {
    setGameDoneIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      if (gameId) next.add(`g:${gameId}`)
      try {
        localStorage.setItem('sc_game_invite_done', JSON.stringify([...next]))
      } catch { /* */ }
      return next
    })
  }
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('sc_notif_read')
      return new Set(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    const onStatusLike = (ev: Event) => {
      const d = (ev as CustomEvent).detail || {}
      const isNew = d.t === 'status_new' || d.type === 'status_new'
      const optimistic = isNew
        ? {
            id: `live-snew-${d.status_id || d.status?.id || Date.now()}`,
            type: 'status_new',
            title: d.title || `${d.from_name || d.status?.owner?.display_name || 'Someone'} posted a status`,
            body: d.body || 'Tap to view',
            actor_id: d.from || d.status?.owner_user_id,
            actor_name: d.from_name,
            status_id: d.status_id || d.status?.id,
            read: false,
            created_at: new Date().toISOString(),
          }
        : {
            id: `live-slike-${d.status_id || Date.now()}`,
            type: 'status_like',
            title: d.title || `${d.from_name || 'Someone'} liked your status`,
            body: 'Tap to open',
            actor_id: d.from,
            actor_name: d.from_name,
            status_id: d.status_id,
            read: false,
            created_at: new Date().toISOString(),
          }
      setServerNotifs((prev) => {
        const next = [optimistic, ...(prev || []).filter((n: any) => n.id !== optimistic.id)]
        void saveCachedNotifications(next)
        return next
      })
      void refreshNotifCount?.()
    }
    window.addEventListener('sc:rt-notif', onStatusLike)
    window.addEventListener('sc:rt-status-new', onStatusLike)
    return () => {
      window.removeEventListener('sc:rt-notif', onStatusLike)
      window.removeEventListener('sc:rt-status-new', onStatusLike)
    }
  }, [refreshNotifCount])

  useEffect(() => {
    const onInvite = (ev: Event) => {
      const d = (ev as CustomEvent).detail || {}
      const gameId = d.game_id || d.gameId
      const optimistic = {
        id: `live-${gameId || Date.now()}`,
        type: 'game_invite',
        title: d.title || `${d.from_name || 'Someone'} wants to play tic-tac-toe with you`,
        body: d.body || 'Play or not now',
        actor_id: d.from,
        actor_name: d.from_name,
        game_id: gameId,
        metadata: { game_id: gameId, game: 'tictactoe' },
        read: false,
        created_at: new Date().toISOString(),
      }
      setServerNotifs((prev) => {
        const next = [optimistic, ...(prev || []).filter((n: any) => n.game_id !== gameId && n.id !== optimistic.id)]
        void saveCachedNotifications(next)
        return next
      })
      void refreshNotifCount?.()
    }
    window.addEventListener('sc:rt-game-invite', onInvite)
    return () => window.removeEventListener('sc:rt-game-invite', onInvite)
  }, [refreshNotifCount])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const cached = await loadCachedNotifications<any>()
        if (alive && cached?.length) {
          setServerNotifs(cached)
          setIncoming(cached)
          setLoading(false)
        }
      } catch {
        /* */
      }
      if (!hasAccessToken()) {
        if (alive) setLoading(false)
        return
      }
      // Background refresh only — UI already snappy from cache
      void api
        .listNotifications()
        .then(({ notifications }) => {
          if (!alive) return
          const list = notifications || []
          ;(window as any).__sc_server_notifs = list
          void saveCachedNotifications(list)
          setServerNotifs(list)
          void refreshNotifCount?.()
          if (list.some((n: any) => n.type === 'contact_accepted')) {
            void refreshContacts()
          }
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setLoading(false)
        })
    })()
    return () => {
      alive = false
    }
  }, [])

  const markRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem('sc_notif_read', JSON.stringify([...next]))
      } catch {
        /* */
      }
      return next
    })
    setServerNotifs((prev) => {
      const real = id.replace(/^(ginv-|slike-|snew-|cacc-|live-slike-|live-snew-|live-ginv-|live-)/, '')
      const next = (prev || []).map((n: any) => {
        const nid = String(n.id || '')
        if (
          id === nid ||
          id === `ginv-${nid}` ||
          id === `slike-${nid}` ||
          id === `snew-${nid}` ||
          id === `cacc-${nid}` ||
          real === nid
        ) {
          return { ...n, read: true }
        }
        return n
      })
      void saveCachedNotifications(next)
      return next
    })
    const real = id.replace(/^(ginv-|slike-|snew-|cacc-|live-slike-|live-snew-|live-ginv-|live-)/, '')
    if (real && !real.startsWith('sys-') && !real.startsWith('call-') && !real.startsWith('msg-')) {
      try {
        void api.markNotificationRead(real)
      } catch {
        /* */
      }
    }
    void refreshNotifCount?.()
  }

  const markAllRead = () => {
    const all = items.map((i) => i.id)
    setReadIds((prev) => {
      const next = new Set(prev)
      all.forEach((id) => next.add(id))
      try {
        localStorage.setItem('sc_notif_read', JSON.stringify([...next]))
      } catch {
        /* */
      }
      return next
    })
    showToast('All caught up')
    try { void api.markAllNotificationsRead() } catch { /* */ }
    void refreshNotifCount?.()
  }

  const items: NotifItem[] = useMemo(() => {
    const out: NotifItem[] = []

    // Save requests live in the Save requests screen, not listed here

    for (const c of calls || []) {
      const missed = c.status === 'missed' || c.direction === 'missed'
      if (!missed) continue
      const id = `call-${c.id || c.call_id}`
      const peer =
        contacts.find((x) => x.id === c.contactId || x.peerId === c.contactId) ||
        null
      const name = peer?.name || c.name || c.contactId || 'Unknown'
      out.push({
        id,
        kind: 'missed_call',
        title: c.kind === 'video' ? 'Missed video call' : 'Missed call',
        body: name,
        when: timeLabel(c.ago || c.created_at || c.time) || '',
        iso: c.ago || c.created_at,
        unread: !readIds.has(id),
        contactId: c.contactId,
        photo: peer?.photo ?? null,
        hue: peer?.hue,
      })
    }

    // Messages stay on the home chats list — not duplicated here

    for (const n of serverNotifs) {
            if (n.type === 'game_invite') {
        const id = `ginv-${n.id}`
        const gid = String(n.game_id || n.metadata?.game_id || '')
        const done =
          !!n.read ||
          readIds.has(id) ||
          gameDoneIds.has(id) ||
          (gid ? gameDoneIds.has(`g:${gid}`) : false)
        out.push({
          id,
          kind: 'game',
          title: n.title || 'Game invite',
          body: done ? 'Invite closed' : n.body || 'wants to play tic-tac-toe',
          when: timeLabel(n.created_at),
          iso: n.created_at,
          unread: !done && !n.read && !readIds.has(id),
          contactId: n.actor_id,
          photo: n.actor_photo,
          action: 'game_invite',
          gameId: gid,
          gameDone: done,
        } as any)
        continue
      }
      if (n.type === 'contact_accepted') {
        const id = `cacc-${n.id}`
        out.push({
          id,
          kind: 'system',
          title: n.title || 'Save request accepted',
          body: n.body || 'You can now stay in touch.',
          when: timeLabel(n.created_at),
          iso: n.created_at,
          unread: !n.read && !readIds.has(id),
          contactId: n.actor_id || n.metadata?.peer_user_id,
          photo: n.actor_photo ?? null,
        })
        continue
      }
      if (n.type === 'status_like') {
        const id = `slike-${n.id}`
        out.push({
          id,
          kind: 'status' as const,
          title: n.title || 'Status like',
          body: n.body || 'liked your status',
          when: timeLabel(n.created_at),
          iso: n.created_at,
          unread: !n.read && !readIds.has(id),
          contactId: n.actor_id,
          photo: n.actor_photo,
          statusId: n.status_id,
        } as any)
        continue
      }
      if (n.type === 'status_new' || n.type === 'status_update') {
        const id = `snew-${n.id}`
        out.push({
          id,
          kind: 'status' as const,
          title: n.title || 'New status',
          body: n.body || 'posted a status',
          when: timeLabel(n.created_at),
          iso: n.created_at,
          unread: !n.read && !readIds.has(id),
          contactId: n.actor_id,
          photo: n.actor_photo,
          statusId: n.status_id,
        } as any)
        continue
      }
    }
    // Premium lifecycle (local, once per event)
    try {
      const raw = localStorage.getItem('sc_local_notifs')
      const local: any[] = raw ? JSON.parse(raw) : []
      for (const n of local) {
        if (!n?.id) continue
        out.push({
          id: n.id,
          kind: 'premium',
          title: n.title || 'Premium',
          body: n.body || '',
          when: timeLabel(n.iso) || 'Now',
          iso: n.iso,
          unread: n.unread !== false && !readIds.has(n.id),
          action: n.action || 'recharge',
        })
      }
    } catch { /* */ }
    // Lightweight system tips (always available)
    out.push({
      id: 'sys-tips',
      kind: 'system',
      title: 'Stay private',
      body: 'You control who sees your phone number when they save you.',
      when: 'Tips',
      unread: !readIds.has('sys-tips'),
    })

    out.sort((a, b) => {
      const ta = a.iso ? Date.parse(a.iso) : 0
      const tb = b.iso ? Date.parse(b.iso) : 0
      if (ta || tb) return tb - ta
      return a.kind.localeCompare(b.kind)
    })
    return out
  }, [incoming, calls, contacts, readIds, serverNotifs, gameDoneIds])

  itemsRef.current = items

  // Do not auto-mark on tab switch — only on click / Mark all as read
  useEffect(() => {
    prevFilterRef.current = filter
  }, [filter])

  // Auto-mark on filter leave is disabled — only mark on click / Mark all as read / leave screen

  // Leaving Notifications → mark everything read
  useEffect(() => {
    return () => {
      const list = itemsRef.current || []
      const unread = list.filter((i) => i.unread)
      if (unread.length) {
        try {
          const raw = localStorage.getItem('sc_notif_read')
          const next = new Set(raw ? JSON.parse(raw) : [])
          unread.forEach((i) => next.add(i.id))
          localStorage.setItem('sc_notif_read', JSON.stringify([...next]))
        } catch {
          /* */
        }
        for (const i of unread) {
          const real = i.id.replace(/^(ginv-|slike-|snew-|cacc-|live-slike-|live-snew-|live-ginv-|live-)/, '')
          if (real && !real.startsWith('sys-') && !real.startsWith('call-') && !real.startsWith('msg-')) {
            try {
              void api.markNotificationRead(real)
            } catch {
              /* */
            }
          }
        }
        try {
          void api.markAllNotificationsRead()
        } catch {
          /* */
        }
      }
      try {
        void useStore.getState?.()
      } catch {
        /* */
      }
      // Badge will refresh on next open; force zero via event
      try {
        window.dispatchEvent(new CustomEvent('sc:notifs-cleared'))
      } catch {
        /* */
      }
    }
  }, [])

  const filtered = items.filter((i) => {
    if (filter === 'all') return true
    if (filter === 'calls') return i.kind === 'missed_call'
    if (filter === 'status') return i.kind === 'status'
    if (filter === 'games') return i.kind === 'game' || (i as any).action === 'game_invite'
    if (filter === 'system') return i.kind === 'system' || i.kind === 'premium'
    return true
  })

  const unreadCount = items.filter((i) => i.unread && i.kind !== 'system').length

  const iconFor = (kind: NotifItem['kind']) => {
    if (kind === 'request') return UserPlus
    if (kind === 'game') return Gamepad2
    if (kind === 'status') return Circle
    if (kind === 'missed_call') return PhoneMissed
    if (kind === 'message') return MessageCircle
    if (kind === 'premium') return Bell
    if (kind === 'system') return MessageCircle
    return Bell
  }

  const tintFor = (_kind: NotifItem['kind']) => {
    // Always user theme (brand tokens)
    return 'bg-brand-purple/10 text-brand-purple'
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#f3eeff]/80 via-white to-[#eef4ff]/50">
      <header className="z-10 shrink-0 border-b border-black/5 bg-white/90 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black tracking-tight text-ink">Notifications</h1>
            <p className="text-[11px] font-bold text-gray-400">
              {unreadCount ? `${unreadCount} new` : 'You are up to date'}
              {saveRequestPending ? ` · ${saveRequestPending} save request${saveRequestPending > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="flex h-10 items-center gap-1 rounded-full px-3 text-xs font-extrabold text-brand-purple hover:bg-brand-purple/8"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        </div>

        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              ['all', 'All'],
              ['calls', 'Calls'],
              ['status', 'Status'],
              ['games', 'Games'],
              ['system', 'System'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`mt-[2px] shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold transition ${
                filter === id
                  ? 'bg-brand-purple text-white'
                  : 'bg-white text-gray-500 ring-1 ring-brand-purple/15'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3">
        {loading && !filtered.length ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center px-8 pt-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5">
              <Bell size={28} className="text-gray-300" />
            </div>
            <p className="mt-4 text-base font-black text-ink">All quiet</p>
            <p className="mt-1 max-w-[240px] text-sm font-semibold text-gray-400">
              New save requests, missed calls, and messages will show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((n) => {
              const Icon = iconFor(n.kind)
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markRead(n.id)
                      if ((n as any).statusId && onOpenStatus) {
                        // status like → open my status at that item (then open viewers)
                        onOpenStatus(meIdPlaceholder || me?.id || '', (n as any).statusId)
                        try { sessionStorage.setItem('sc_open_viewers', (n as any).statusId) } catch { /* */ }
                      } else if (n.kind === 'premium' || n.action === 'recharge') {
                        try {
                          window.dispatchEvent(new CustomEvent('sc:open-premium'))
                        } catch { /* */ }
                        showToast('Open Settings → Premium to recharge')
                      } else if (n.kind === 'request') onOpenSaveRequests?.()
                      else if (n.kind === 'missed_call') {
                        if (n.contactId && onOpenChat) onOpenChat(n.contactId)
                        else onOpenCalls?.()
                      } else if (n.kind === 'message' && n.contactId) onOpenChat?.(n.contactId)
                      else if ((n as any).action === 'game_invite' && (n as any).gameId) {
                        /* buttons handle accept */
                      }
                    }}
                    className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.99] ${
                      n.unread
                        ? 'bg-brand-purple/15 shadow-sm ring-1 ring-brand-purple/30'
                        : 'bg-white/70 ring-1 ring-black/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tintFor(n.kind)}`}
                      aria-hidden
                    >
                      {n.kind === 'status' ? (
                        /* Status like: heart — filled unread, outline when read */
                        <Heart
                          size={20}
                          strokeWidth={2.2}
                          className={n.unread ? 'fill-brand-purple text-brand-purple' : 'fill-none text-brand-purple'}
                        />
                      ) : n.kind === 'game' ? (
                        <Gamepad2
                          size={20}
                          strokeWidth={2.2}
                          className={n.unread ? 'fill-brand-purple/30 text-brand-purple' : 'text-brand-purple'}
                        />
                      ) : n.kind === 'system' || n.kind === 'premium' ? (
                        /* SafeChat outline */
                        <svg width="22" height="22" viewBox="0 0 112 112" fill="none" aria-hidden>
                          <path
                            d="M56 8C29.5 8 8 27.2 8 51c0 12.6 6 23.9 15.6 31.8L18 102l22-9.6c5 1.1 10.3 1.6 16 1.6 26.5 0 48-19.2 48-43S82.5 8 56 8Z"
                            stroke={`url(#sc-notif-grad-${n.id})`}
                            strokeWidth="8"
                            fill={n.unread ? `url(#sc-notif-grad-${n.id})` : 'none'}
                            fillOpacity={n.unread ? 0.15 : 0}
                          />
                          <defs>
                            <linearGradient id={`sc-notif-grad-${n.id}`} x1="8" y1="100" x2="104" y2="12" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#FF8C00" />
                              <stop offset="0.45" stopColor="#C2308F" />
                              <stop offset="1" stopColor="#7B2CBF" />
                            </linearGradient>
                          </defs>
                        </svg>
                      ) : n.kind === 'missed_call' ? (
                        <PhoneMissed size={20} strokeWidth={2.2} className="text-brand-purple" />
                      ) : n.kind === 'request' ? (
                        <UserPlus size={20} strokeWidth={2.2} className="text-brand-purple" />
                      ) : (
                        <Icon size={20} strokeWidth={2.2} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-extrabold text-ink">{n.title}</span>
                        {n.unread ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-orange" />
                        ) : null}
                        <span className="ml-auto shrink-0 text-[11px] font-bold text-gray-400">{n.when}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[13px] font-semibold text-gray-500">
                        {n.body}
                      </span>
                      {(n.kind === 'premium' || n.action === 'recharge') && (
                        <span className="mt-2 inline-flex rounded-full bg-gradient-to-r from-brand-purple to-brand-orange px-3 py-1 text-[11px] font-extrabold text-white">
                          Recharge Premium
                        </span>
                      )}
                      {(n as any).action === 'game_invite' && (n as any).gameId && (
                        <span className="mt-2 flex gap-2">
                          {(n as any).gameDone ? (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-extrabold text-gray-400">
                              Closed
                            </span>
                          ) : (
                            <>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  const gid = String((n as any).gameId || '')
                                  if (!gid) {
                                    showToast('Invite expired')
                                    return
                                  }
                                  markRead(n.id)
                                  markGameDone(n.id, gid)
                                  try {
                                    sessionStorage.setItem('sc_open_self_chat', '1')
                                    sessionStorage.setItem('sc_open_tictactoe', gid)
                                    window.dispatchEvent(
                                      new CustomEvent('sc:open-self-tictactoe', {
                                        detail: { gameId: gid },
                                      }),
                                    )
                                    await api.tictactoeAccept(gid)
                                    const realId = n.id.replace(/^(ginv-|live-)/, '')
                                    if (realId && !n.id.startsWith('live')) {
                                      try { await api.markNotificationRead(realId) } catch { /* */ }
                                    }
                                    void refreshNotifCount?.()
                                    showToast('Game on')
                                  } catch (err: any) {
                                    showToast(err?.message || 'Could not join')
                                  }
                                }}
                                className="rounded-full bg-brand-purple px-3 py-1 text-[11px] font-extrabold text-white"
                              >
                                Play
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  markRead(n.id)
                                  markGameDone(n.id, String((n as any).gameId || ''))
                                  try {
                                    await api.tictactoeDecline(String((n as any).gameId))
                                    showToast('Invite dismissed')
                                  } catch {
                                    /* */
                                  }
                                  void refreshNotifCount?.()
                                }}
                                className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-extrabold text-gray-600"
                              >
                                Not now
                              </span>
                            </>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
