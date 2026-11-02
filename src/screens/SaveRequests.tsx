import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, UserPlus, Clock, Inbox } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { ScreenHeader } from '../components/ui'
import { useStore } from '../store'
import { api } from '../api'

type RequestItem = {
  id: string
  fromUserId: string
  toUserId: string
  username: string
  name: string
  photo: string | null
  message: string | null
  status: string
  createdAt: string
  hue: [string, string]
}

type Props = {
  onClose: () => void
  onChat?: (userId: string) => void
}

function timeAgo(iso: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
    if (sec < 60) return 'just now'
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
    if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
    return d.toLocaleDateString()
  } catch {
    return ''
  }
}

export function SaveRequests({ onClose, onChat }: Props) {
  const { refreshContacts, showToast } = useStore()
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming')
  const [incoming, setIncoming] = useState<RequestItem[]>([])
  const [outgoing, setOutgoing] = useState<RequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inRes, outRes] = await Promise.all([
        api.incomingContactRequests(),
        api.outgoingContactRequests(),
      ])
      setIncoming((inRes.requests || []).filter((r) => r.status === 'pending'))
      setOutgoing((outRes.requests || []).filter((r) => r.status === 'pending'))
    } catch {
      showToast('Could not load save requests')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const accept = async (id: string) => {
    setBusyId(id)
    try {
      await api.acceptContactRequest(id)
      setIncoming((list) => list.filter((r) => r.id !== id))
      await refreshContacts()
      showToast('Contact saved')
    } catch (e: any) {
      showToast(e?.message || 'Could not accept')
    } finally {
      setBusyId(null)
    }
  }

  const decline = async (id: string) => {
    setBusyId(id)
    try {
      await api.rejectContactRequest(id)
      setIncoming((list) => list.filter((r) => r.id !== id))
      showToast('Request declined')
    } catch (e: any) {
      showToast(e?.message || 'Could not decline')
    } finally {
      setBusyId(null)
    }
  }

  const list = tab === 'incoming' ? incoming : outgoing

  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader title="Save requests" onBack={onClose} />

      <div className="flex gap-2 px-4 pb-3 pt-3">
        {(
          [
            { id: 'incoming' as const, label: 'Incoming', count: incoming.length },
            { id: 'outgoing' as const, label: 'Sent', count: outgoing.length },
          ]
        ).map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-extrabold transition-colors ${
                active
                  ? 'bg-brand-purple text-white shadow-md shadow-brand-purple/25'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-[11px] font-black ${
                    active ? 'bg-white/25 text-white' : 'bg-brand-purple/15 text-brand-purple'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="h-8 w-8 rounded-full border-2 border-brand-purple border-t-transparent"
            />
            <p className="text-sm font-bold">Loading requests…</p>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
              {tab === 'incoming' ? <Inbox size={28} /> : <Clock size={28} />}
            </div>
            <p className="text-base font-extrabold text-gray-700">
              {tab === 'incoming' ? 'No save requests' : 'No pending requests'}
            </p>
            <p className="text-sm font-semibold text-gray-400">
              {tab === 'incoming'
                ? 'When someone wants to save you as a contact, their request will show up here.'
                : 'Requests you send will appear here until they accept or decline.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {list.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100"
                >
                  <div className="flex items-start gap-3 p-3.5">
                    <Avatar
                      contact={{
                        name: r.name,
                        photo: r.photo,
                        hue: r.hue,
                        online: false,
                      }}
                      size={48}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-extrabold text-ink">{r.name}</p>
                        <span className="shrink-0 text-[11px] font-bold text-gray-400">
                          {timeAgo(r.createdAt)}
                        </span>
                      </div>
                      {r.username && (
                        <p className="truncate text-sm font-bold text-brand-purple">@{r.username}</p>
                      )}
                      {r.message && (
                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-gray-500">
                          “{r.message}”
                        </p>
                      )}
                      {tab === 'outgoing' && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-amber-600">
                          <Clock size={12} /> Waiting for response
                        </p>
                      )}
                    </div>
                  </div>

                  {tab === 'incoming' && (
                    <div className="flex gap-2 border-t border-gray-100 px-3 py-2.5">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => decline(r.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-200/80 py-2.5 text-sm font-extrabold text-gray-600 transition hover:bg-gray-300 disabled:opacity-50"
                      >
                        <X size={16} strokeWidth={2.5} />
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => accept(r.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-purple py-2.5 text-sm font-extrabold text-white shadow-sm shadow-brand-purple/30 transition hover:bg-brand-magenta disabled:opacity-50"
                      >
                        <Check size={16} strokeWidth={2.5} />
                        Accept
                      </button>
                    </div>
                  )}

                  {tab === 'outgoing' && onChat && (
                    <div className="border-t border-gray-100 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onChat(r.toUserId)}
                        className="w-full rounded-xl py-2 text-sm font-bold text-brand-purple hover:bg-brand-purple/5"
                      >
                        Message
                      </button>
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="border-t border-gray-100 px-5 py-3">
        <p className="flex items-center justify-center gap-2 text-center text-xs font-semibold text-gray-400">
          <UserPlus size={14} className="text-brand-purple/60" />
          Saving someone sends a request they can accept or decline
        </p>
      </div>
    </div>
  )
}
