import { useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search,
  MoreVertical,
  Plus,
  X,
  MessageSquarePlus,
  Users,
  ContactRound,
  Settings2,
  UserRoundPlus,
  BellRing,
  Headphones,
  Clock,
  RefreshCw,
} from 'lucide-react'
import { Wordmark } from '../components/Logo'
import { Avatar } from '../components/Avatar'
import { StatusRing } from '../components/StatusRing'
import { ChatsHomeSkeleton } from '../components/ChatsHomeSkeleton'
import { useStore } from '../store'
import { api } from '../api'

const FILTERS = ['All chats', 'Unread', 'Online',] as const
type Filter = (typeof FILTERS)[number]

type Props = {
  onOpenChat: (id: string) => void
  onNewChat: () => void
  onNewGroup: () => void
  onSettings: () => void
  onContacts: () => void
  onSaveRequests: () => void
  onOpenStatus: (userId: string) => void
  onNotifications: () => void
  onSupport: () => void
}

export function ChatsHome({
  onOpenChat,
  onNewChat,
  onNewGroup,
  onSettings,
  onContacts,
  onSaveRequests,
  onOpenStatus,
  onNotifications,
  onSupport,
}: Props) {
  const { chats, contacts, statusList, me, listsReady, saveRequestPending, typingPeers, presenceMap, refreshChats, refreshCalls, refreshStatus, refreshContacts, refreshSaveRequests, refreshSubscription, showToast } = useStore()
  /** System-only: save requests etc. Chat unreads live on the bottom nav. */
  const systemNotifCount = saveRequestPending
  const [filter, setFilter] = useState<Filter>('All chats')
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const pendingCount = saveRequestPending
  const showSkeleton = !listsReady
  /** Rows that already entered - receipt/state updates must not re-animate the whole row */
  const seenRows = useRef<Set<string>>(new Set())

  // O(1) contact lookup - avoid .find() on every row / status
  const contactMap = useMemo(() => {
    const m = new Map<string, (typeof contacts)[0]>()
    for (const c of contacts) {
      if (c.id) m.set(c.id, c)
      if (c.peerId) m.set(c.peerId, c)
    }
    return m
  }, [contacts])

  const contactById = (id: string, fallback?: { name?: string; photo?: string | null; hue?: [string, string] }) => {
    const hit = contactMap.get(id)
    const online = !!(presenceMap?.[id] ?? hit?.online)
    if (hit) return { ...hit, online }
    return {
      id,
      name: fallback?.name || id,
      username: '',
      phone: '',
      bio: '',
      photo: fallback?.photo ?? null,
      online,
      hue: (fallback?.hue || ['#7B2CBF', '#6389EB']) as [string, string],
    }
  }

  /** status counts per user: total + how many I've viewed (active only) */
  const statusMeta = useMemo(() => {
    const map: Record<string, { total: number; viewed: number }> = {}
    const now = Date.now()
    for (const s of statusList) {
      if (s.userId === me?.id) continue
      if (s.expiresAt) {
        const t = Date.parse(s.expiresAt)
        if (!Number.isNaN(t) && t <= now) continue
      }
      if (!map[s.userId]) map[s.userId] = { total: 0, viewed: 0 }
      map[s.userId].total++
      if (Array.isArray(s.views) && me && s.views.includes(me.id)) map[s.userId].viewed++
    }
    return map
  }, [statusList, me])

  const list = useMemo(() => {
    // Dedupe by peer so one person never appears twice
    const byPeer = new Map<string, (typeof chats)[0]>()
    for (const c of chats) {
      const key = c.contactId
      const prev = byPeer.get(key)
      if (!prev) {
        byPeer.set(key, c)
        continue
      }
      const prevT = prev.iso ? Date.parse(prev.iso) : 0
      const nextT = c.iso ? Date.parse(c.iso) : 0
      if (nextT >= prevT) byPeer.set(key, c)
    }
    const qLower = q ? q.toLowerCase() : ''
    return Array.from(byPeer.values()).filter((c) => {
      const ct = contactById(c.contactId, { name: c.name, photo: c.photo, hue: c.hue })
      if (
        qLower &&
        !ct.name.toLowerCase().includes(qLower) &&
        !ct.username?.toLowerCase().includes(qLower)
      )
        return false
      if (filter === 'Unread') return c.unread > 0
      if (filter === 'Online') return ct.online
      return true
    })
  }, [filter, q, chats, contactMap, presenceMap])

  const statusUsers = useMemo(() => {
    const byUser = new Map<string, any>()
    const now = Date.now()
    for (const s of statusList) {
      if (!s.userId || s.userId === me?.id) continue
      if (s.expiresAt) {
        const t = Date.parse(s.expiresAt)
        if (!Number.isNaN(t) && t <= now) continue
      }
      if (byUser.has(s.userId)) continue
      const contact = contactMap.get(s.userId)
      byUser.set(s.userId, {
        id: s.userId,
        name: (contact as any)?.savedName || contact?.name || s.user?.name || 'Contact',
        username: contact?.username || s.user?.username || '',
        photo: contact?.photo ?? s.user?.photo ?? null,
        hue: contact?.hue || s.user?.hue || (['#7B2CBF', '#6389EB'] as [string, string]),
        online: false,
      })
    }
    return Array.from(byUser.values()).slice(0, 12)
  }, [statusList, contactMap, me])

  return (
    <div className="relative flex h-full flex-col bg-white">
      {/* z-10: sticky top chrome - below overlays */}
      <header className="sticky top-0 z-10 flex min-h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white/95 pb-3 px-5 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex w-full items-center">
          {searching ? (
            <div className="flex h-11 w-full items-center gap-2 rounded-full bg-gray-100 px-4">
              <Search size={18} className="shrink-0 text-brand-purple" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search chats"
                className="w-full bg-transparent font-semibold outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setSearching(false)
                  setQ('')
                }}
                aria-label="Close search"
                className="shrink-0"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between">
              <Wordmark className="text-2xl leading-none" />
              <div className="flex gap-1">
                <IconBtn label="Search" onClick={() => setSearching(true)}>
                  <Search size={22} />
                </IconBtn>
                <IconBtn label="Menu" onClick={() => setMenu((m) => !m)}>
                  <span className="relative">
                    <MoreVertical size={22} />
                    {systemNotifCount > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand-red ring-2 ring-white" />
                    ) : null}
                  </span>
                </IconBtn>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* z-40: hamburger menu covers header + list + FAB + bottom nav */}
      <AnimatePresence>
        {menu && (
          <>
            <motion.div
              key="menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm"
              onClick={() => setMenu(false)}
            />
            <motion.ul
              key="menu-panel"
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              style={{ transformOrigin: 'top right' }}
              className="fixed right-3 top-[max(3.75rem,calc(env(safe-area-inset-top)+2.75rem))] z-50 w-[15.5rem] overflow-hidden rounded-3xl bg-white/95 p-2 shadow-2xl ring-1 ring-black/6 backdrop-blur-xl"
            >
              {(
                [
                  { label: 'New chat', fn: onNewChat, Icon: MessageSquarePlus },
                  { label: 'New group', fn: onNewGroup, Icon: Users },
                  { label: 'Contacts', fn: onContacts, Icon: ContactRound },
                  { label: 'Save requests', fn: onSaveRequests, Icon: UserRoundPlus, badge: pendingCount },
                  { label: 'Notifications', fn: onNotifications, Icon: BellRing, badge: systemNotifCount },
                  {
                    label: 'Refresh',
                    fn: () => {
                      showToast('Refreshing…')
                      void (async () => {
                        // Flush pending sends before pulling new data
                        try {
                          const { loadOutbox, removeOutbox } = await import('../lib/appCache')
                          const items = await loadOutbox()
                          for (const item of items || []) {
                            if (!item.conversationId) continue
                            try {
                              await api.send(item.conversationId, item.text, item.image)
                              await removeOutbox(item.id)
                            } catch { /* retry later */ }
                          }
                        } catch { /* */ }
                        await Promise.all([
                          refreshChats({ lean: true }),
                          refreshCalls(),
                          refreshStatus(),
                          refreshContacts(),
                          refreshSaveRequests(),
                          refreshSubscription(),
                        ])
                        showToast('Up to date')
                      })()
                    },
                    Icon: RefreshCw,
                  },
                  { label: 'Support', fn: onSupport, Icon: Headphones },
                  { label: 'Settings', fn: onSettings, Icon: Settings2 },
                ] as const
              ).map(({ label, fn, Icon, ...rest }, i, arr) => {
                const badge = 'badge' in rest ? (rest as { badge?: number }).badge : 0
                return (
                  <li
                    key={label}
                    className={undefined}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(false)
                        fn()
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left text-[13px] font-extrabold text-ink transition active:scale-[0.98] hover:bg-brand-purple/6"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple/15 to-brand-orange/10 ring-1 ring-brand-purple/10">
                        <Icon size={16} className="text-brand-purple" strokeWidth={2.4} />
                      </span>
                      <span className="min-w-0 flex-1">{label}</span>
                      {badge && badge > 0 ? (
                        <span className="min-w-5 rounded-full bg-brand-red px-1.5 text-center text-[11px] font-black text-white">
                          {badge > 9 ? '9+' : badge}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </motion.ul>
          </>
        )}
      </AnimatePresence>

      <div className="min-h-0 flex-1 overflow-y-auto pb-24 ">
        {showSkeleton ? (
          <ChatsHomeSkeleton />
        ) : (
          <>
            {statusUsers.length > 0 && (
              <div data-no-tab-swipe="1" className="no-scrollbar flex gap-4 overflow-x-auto border-b border-gray-200 px-5 pb-3 pt-3">
                {statusUsers.map((c: any, i: number) => {
                  const meta = statusMeta[c.id] || { total: 1, viewed: 0 }
                  return (
                    <motion.button
                      key={c.id}
                      type="button"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.04 * i, type: 'spring' }}
                      whileTap={{ scale: 0.92 }}
                      className="flex shrink-0 flex-col items-center gap-1.5 p-[2px]"
                      onClick={() => onOpenStatus(c.id)}
                    >
                      <StatusRing total={meta.total} viewed={meta.viewed} size={60}>
                        <Avatar contact={{ ...c, online: !!(presenceMap?.[c.id] ?? c.online) }} size={50} />
                      </StatusRing>
                      <span className="w-16 truncate text-center text-xs font-bold">{c.name.split(' ')[0]}</span>
                    </motion.button>
                  )
                })}
              </div>
            )}

            <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2 pt-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`shrink-0 rounded-full px-2.5 py-1 font-ui text-[11px] font-extrabold leading-none transition ${
                    filter === f
                      ? 'bg-brand-purple text-white shadow-sm'
                      : 'bg-brand-purple/10 text-brand-purple'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <ul className="px-2">
              {list.length === 0 && (
                <p className="px-4 py-12 text-center font-bold text-gray-400">
                  No chats yet. Tap + to start one now!
                </p>
              )}
              {list.map((c, i) => {
                const ct = contactById(c.contactId, { name: c.name, photo: c.photo, hue: c.hue })
                const meta = statusMeta[c.contactId]
                const rowKey = c.conversationId || c.contactId
                const isNewRow = !seenRows.current.has(rowKey)
                if (isNewRow) seenRows.current.add(rowKey)
                return (
                  <motion.li
                    key={rowKey}
                    initial={isNewRow ? { opacity: 0, y: 10 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={isNewRow ? { delay: Math.min(i, 8) * 0.03 } : { duration: 0 }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenChat(c.contactId)}
                      className="flex w-full items-center gap-3 border-b border-gray-100/80 px-3 py-3.5 text-left last:border-0 hover:bg-gray-50/80"
                    >
                      {meta && meta.total > 0 ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenStatus(c.contactId)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              onOpenStatus(c.contactId)
                            }
                          }}
                          className="shrink-0 cursor-pointer"
                          aria-label="View status"
                        >
                          <StatusRing total={meta.total} viewed={meta.viewed} size={56}>
                            <Avatar contact={{ ...ct, online: !!(presenceMap?.[ct.id] ?? ct.online),
                          premium: !!(ct as any).verifiedBadge }} size={46} />
                          </StatusRing>
                        </span>
                      ) : (
                        <Avatar contact={{ ...ct, online: !!(presenceMap?.[ct.id] ?? ct.online),
                          premium: !!(ct as any).verifiedBadge }} size={52} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-extrabold">{(ct as any).savedName || ct.name}</p>
                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <span
                              className={`text-xs font-bold ${
                                c.unread > 0 && !c.mine ? 'text-brand-purple' : 'text-gray-400'
                              }`}
                            >
                              {c.time}
                            </span>
                            {c.mine && (
                              <span
                                className={`inline-flex items-center text-[11px] font-black leading-none ${
                                  c.state === 'read' ? 'text-brand-blue' : 'text-gray-400'
                                }`}
                                title={c.state || 'sent'}
                              >
                                {c.state === 'pending' ? (
                                  <Clock size={12} strokeWidth={2.5} className="opacity-70" aria-label="Sending" />
                                ) : c.state === 'failed' ? (
                                  '!'
                                ) : c.state === 'sent' || !c.state ? (
                                  '✓'
                                ) : (
                                  '✓✓'
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-gray-500">
                            {c.mine ? 'You: ' : ''}
                            {(typingPeers?.[ct.id] || typingPeers?.[c.contactId] || typingPeers?.[(ct as any).peerId]) ? (
                              <span className="font-bold text-brand-blue">typing…</span>
                            ) : (
                              c.last
                            )}
                          </p>
                          {c.unread > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-purple px-1.5 text-[11px] font-black text-white">
                              {c.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </motion.li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <motion.button
        type="button"
        aria-label="New chat"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={onNewChat}
        className="fab-theme fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple text-white"
      >
        <Plus size={26} strokeWidth={2.4} />
      </motion.button>
    </div>
  )
}

export function IconBtn({
  children,
  onClick,
  label,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-gray-100 ${className}`}
    >
      {children}
    </button>
  )
}
