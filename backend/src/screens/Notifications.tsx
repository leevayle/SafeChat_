import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, UserPlus, MessageSquare, Phone, Info } from 'lucide-react'
import { ScreenHeader } from '../components/ui'
import { useStore } from '../store'
import { api } from '../api'

type Notif = {
  id: string
  type: 'request' | 'message' | 'call' | 'system'
  title: string
  body: string
  time: string
  unread?: boolean
}

type Props = {
  onClose: () => void
  onOpenSaveRequests?: () => void
  onOpenChat?: (id: string) => void
}

export function Notifications({ onClose, onOpenSaveRequests, onOpenChat }: Props) {
  const { chats, showToast } = useStore()
  const [items, setItems] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      try {
        const notifs: Notif[] = []
        try {
          const { requests } = await api.incomingContactRequests()
          for (const r of requests || []) {
            if (r.status !== 'pending') continue
            notifs.push({
              id: `req-${r.id}`,
              type: 'request',
              title: 'Save request',
              body: `${r.name || r.username || 'Someone'} wants to save you as a contact`,
              time: r.createdAt || '',
              unread: true,
            })
          }
        } catch {
          /* offline */
        }
        for (const c of chats) {
          if (c.unread > 0) {
            notifs.push({
              id: `chat-${c.conversationId || c.contactId}`,
              type: 'message',
              title: c.name || 'Chat',
              body: c.last || 'New message',
              time: c.iso || '',
              unread: true,
            })
          }
        }
        if (!notifs.length) {
          notifs.push({
            id: 'sys-1',
            type: 'system',
            title: 'You\'re all caught up',
            body: 'New save requests, messages, and calls will show up here.',
            time: new Date().toISOString(),
          })
        }
        if (alive) setItems(notifs)
      } catch {
        if (alive) showToast('Could not load notifications')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [chats, showToast])

  const icon = (t: Notif['type']) => {
    if (t === 'request') return UserPlus
    if (t === 'message') return MessageSquare
    if (t === 'call') return Phone
    return Info
  }

  const timeLabel = (iso: string) => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader title="Notifications" onBack={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-10 pt-2">
        {loading && (
          <p className="py-12 text-center text-sm font-bold text-gray-400">Loading…</p>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <Bell size={28} />
            <p className="font-bold">No notifications</p>
          </div>
        )}
        <ul className="space-y-1">
          {items.map((n, i) => {
            const I = icon(n.type)
            return (
              <motion.li
                key={n.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (n.type === 'request') onOpenSaveRequests?.()
                    else if (n.type === 'message' && n.id.startsWith('chat-')) {
                      const id = n.id.replace(/^chat-/, '')
                      onOpenChat?.(id)
                    }
                  }}
                  className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left hover:bg-gray-50 ${
                    n.unread ? 'bg-brand-purple/5' : ''
                  }`}
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
                    <I size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-extrabold">{n.title}</p>
                      <span className="shrink-0 text-[11px] font-bold text-gray-400">
                        {timeLabel(n.time)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-gray-500">{n.body}</p>
                  </div>
                </button>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
