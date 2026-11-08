import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  UserPlus,
  PhoneMissed,
  MessageCircle,
  Info,
  CheckCheck,
  Sparkles,
} from 'lucide-react'
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

type Filter = 'all' | 'calls' | 'system'

type NotifItem = {
  id: string
  kind: 'request' | 'missed_call' | 'message' | 'system' | 'premium'
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
  const { saveRequestPending, calls, chats, contacts, showToast, me, refreshContacts } = useStore()
  const meIdPlaceholder = me?.id || ''
  const [filter, setFilter] = useState<Filter>('all')
  const [incoming, setIncoming] = useState<any[]>([])
  const [serverNotifs, setServerNotifs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('sc_notif_read')
      return new Set(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const cached = await loadCachedNotifications<any>()
        if (alive && cached?.length) {
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
      try {
        const { notifications } = await api.listNotifications()
        if (!alive) return
        ;(window as any).__sc_server_notifs = notifications || []
        void saveCachedNotifications(notifications || [])
        setServerNotifs(notifications || [])
        if ((notifications || []).some((n: any) => n.type === 'contact_accepted')) {
          void refreshContacts()
        }
      } catch {
        /* */
      } finally {
        if (alive) setLoading(false)
      }
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

    for (const ch of (chats || []).filter((x) => (x.unread || 0) > 0).slice(0, 12)) {
      const id = `msg-${ch.contactId}-${ch.iso || ''}`
      out.push({
        id,
        kind: 'message',
        title: ch.name || 'Message',
        body: ch.last || 'New message',
        when: ch.time || timeLabel(ch.iso),
        iso: ch.iso,
        unread: !readIds.has(id),
        contactId: ch.contactId,
        photo: ch.photo,
        hue: ch.hue as [string, string] | undefined,
      })
    }

    for (const n of serverNotifs) {
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
          kind: 'system',
          title: n.title || 'Status like',
          body: n.body || 'liked your status',
          when: timeLabel(n.created_at),
          iso: n.created_at,
          unread: !n.read && !readIds.has(id),
          contactId: n.actor_id,
          photo: n.actor_photo,
          statusId: n.status_id,
        } as any)
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
    out.push(
      {
        id: 'sys-tips',
        kind: 'system',
        title: 'Stay private',
        body: 'You control who sees your phone number when they save you.',
        when: 'Tips',
        unread: !readIds.has('sys-tips'),
      },
      {
        id: 'sys-live',
        kind: 'system',
        title: 'Live typing',
        body: 'Peers can see characters as you type. Hide it anytime in Settings.',
        when: 'Tips',
        unread: !readIds.has('sys-live'),
      },
    )

    out.sort((a, b) => {
      const ta = a.iso ? Date.parse(a.iso) : 0
      const tb = b.iso ? Date.parse(b.iso) : 0
      if (ta || tb) return tb - ta
      return a.kind.localeCompare(b.kind)
    })
    return out
  }, [incoming, calls, chats, contacts, readIds, serverNotifs])

  const filtered = items.filter((i) => {
    if (filter === 'all') return true
    if (filter === 'calls') return i.kind === 'missed_call'
    if (filter === 'system') return i.kind === 'system' || i.kind === 'premium'
    return true
  })

  const unreadCount = items.filter((i) => i.unread && i.kind !== 'system').length

  const iconFor = (kind: NotifItem['kind']) => {
    if (kind === 'request') return UserPlus
    if (kind === 'missed_call') return PhoneMissed
    if (kind === 'message') return MessageCircle
    if (kind === 'premium') return Sparkles
    return Info
  }

  const tintFor = (kind: NotifItem['kind']) => {
    if (kind === 'request') return 'bg-brand-purple/12 text-brand-purple'
    if (kind === 'missed_call') return 'bg-red-50 text-red-500'
    if (kind === 'message') return 'bg-sky-50 text-sky-600'
    if (kind === 'premium') return 'bg-brand-purple/12 text-brand-purple'
    return 'bg-amber-50 text-amber-600'
  }

  return (
    <div className="flex h-full flex-col bg-[#f7f8fa]">
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
            Read all
          </button>
        </div>

        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              ['all', 'All'],
              ['calls', 'Calls'],
              ['system', 'System'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold transition ${
                filter === id
                  ? 'bg-ink text-white'
                  : 'bg-white text-gray-500 ring-1 ring-black/6'
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
                    }}
                    className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.99] ${
                      n.unread
                        ? 'bg-white shadow-sm ring-1 ring-brand-purple/10'
                        : 'bg-white/70 ring-1 ring-black/[0.04]'
                    }`}
                  >
                    {n.kind === 'message' || n.kind === 'missed_call' || n.kind === 'request' ? (
                      n.photo || n.hue ? (
                        <Avatar
                          contact={{
                            id: n.contactId || n.id,
                            name: n.title,
                            photo: n.photo,
                            hue: n.hue || ['#7B2CBF', '#6389EB'],
                          }}
                          size={44}
                        />
                      ) : (
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tintFor(n.kind)}`}
                        >
                          <Icon size={20} strokeWidth={2.4} />
                        </span>
                      )
                    ) : (
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tintFor(n.kind)}`}>
                        <Sparkles size={18} strokeWidth={2.4} />
                      </span>
                    )}
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
