import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, UserPlus, Clock, Inbox, Trash2 } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { ScreenHeader } from '../components/ui'
import { useStore } from '../store'
import { api } from '../api'
import { kvGet, kvSet } from '../lib/kv'

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

const CACHE_KEY = 'sc_save_requests_cache'

function timeAgo(iso: string) {
  if (!iso) return ''
  try {
    let raw = iso.trim()
    if (raw && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      raw = raw.includes('T') ? `${raw}Z` : `${raw.replace(' ', 'T')}Z`
    }
    const d = new Date(raw)
    if (isNaN(d.getTime())) return ''
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
    if (sec < 45) return 'just now'
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
    if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

function statusLabel(status: string) {
  const s = (status || '').toLowerCase()
  if (s === 'pending') return 'Pending'
  if (s === 'accepted') return 'Accepted'
  if (s === 'rejected' || s === 'declined') return 'Declined'
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled'
  return status || 'Unknown'
}

export function SaveRequests({ onClose, onChat }: Props) {
  const { refreshContacts, showToast } = useStore()
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming')
  const [incoming, setIncoming] = useState<RequestItem[]>([])
  const [outgoing, setOutgoing] = useState<RequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  const load = useCallback(async (): Promise<void> => {
    try {
      const [inRes, outRes] = await Promise.all([
        api.incomingContactRequests(),
        api.outgoingContactRequests(),
      ])
      // Full history — first to latest (API already sorts newest first)
      const nextIncoming = inRes.requests || []
      const nextOutgoing = outRes.requests || []
      setIncoming(nextIncoming)
      setOutgoing(nextOutgoing)
      try {
        kvSet(
          CACHE_KEY,
          JSON.stringify({
            incoming: nextIncoming,
            outgoing: nextOutgoing,
            at: Date.now(),
          }),
        )
      } catch {
        /* */
      }
    } catch {
      showToast('Could not load save requests')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    // Instant paint from local cache
    try {
      const raw = kvGet(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed?.incoming)) setIncoming(parsed.incoming)
        if (Array.isArray(parsed?.outgoing)) setOutgoing(parsed.outgoing)
        setLoading(false)
      }
    } catch {
      /* */
    }
    void load()
  }, [load])

  const accept = async (id: string) => {
    setBusyId(id)
    try {
      await api.acceptContactRequest(id)
      setIncoming((list) =>
        list.map((r) => (r.id === id ? { ...r, status: 'accepted' } : r)),
      )
      showToast('Contact saved on both sides')
      void refreshContacts()
      void load()
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
      setIncoming((list) =>
        list.map((r) => (r.id === id ? { ...r, status: 'rejected' } : r)),
      )
      showToast('Request declined')
    } catch (e: any) {
      showToast(e?.message || 'Could not decline')
    } finally {
      setBusyId(null)
    }
  }

  const cancelOutgoing = async (id: string) => {
    setBusyId(id)
    try {
      await api.cancelContactRequest(id)
      setOutgoing((list) =>
        list.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)),
      )
      showToast('Request cancelled')
    } catch (e: any) {
      showToast(e?.message || 'Could not cancel')
    } finally {
      setBusyId(null)
    }
  }

  const unsave = async (peerId: string, requestId: string) => {
    setBusyId(requestId)
    try {
      await api.deleteContact(peerId)
      setOutgoing((list) =>
        list.map((r) => (r.id === requestId ? { ...r, status: 'cancelled' } : r)),
      )
      showToast('Contact removed')
      void refreshContacts()
    } catch (e: any) {
      showToast(e?.message || 'Could not remove')
    } finally {
      setBusyId(null)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const deleteSelected = async () => {
    if (!selected.length) return
    const ids = [...selected]
    setSelected([])
    // Optimistic remove from UI
    setIncoming((list) => list.filter((r) => !ids.includes(r.id)))
    setOutgoing((list) => list.filter((r) => !ids.includes(r.id)))
    let failed = 0
    for (const id of ids) {
      try {
        await api.deleteContactRequest(id)
      } catch {
        failed += 1
      }
    }
    if (failed) showToast(`Could not delete ${failed} item(s)`)
    else showToast(ids.length > 1 ? 'Requests deleted' : 'Request deleted')
    void load()
  }

  const list = tab === 'incoming' ? incoming : outgoing

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#121821]">
      <ScreenHeader title="Save requests" onBack={onClose} />

      <div className="flex gap-2 px-4 pb-3 pt-3">
        {(
          [
            { id: 'incoming' as const, label: 'Received', count: incoming.length },
            { id: 'outgoing' as const, label: 'Sent', count: outgoing.length },
          ]
        ).map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setSelected([])
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-extrabold transition-colors ${
                active
                  ? 'bg-brand-purple text-white shadow-md shadow-brand-purple/25'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300'
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

      {selected.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2 dark:border-white/10">
          <p className="text-sm font-extrabold text-ink dark:text-gray-100">
            {selected.length} selected
          </p>
          <button
            type="button"
            onClick={() => void deleteSelected()}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-extrabold text-brand-red dark:bg-red-500/15"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-10">
        {loading && list.length === 0 ? (
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
            <p className="text-base font-extrabold text-gray-700 dark:text-gray-200">
              {tab === 'incoming' ? 'No received requests' : 'No sent requests'}
            </p>
            <p className="text-sm font-semibold text-gray-400">
              {tab === 'incoming'
                ? 'When someone wants to save you as a contact, their request will show up here.'
                : 'Requests you send appear here - from the first to the latest.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {list.map((r, i) => {
                const pending = (r.status || '').toLowerCase() === 'pending'
                const accepted = (r.status || '').toLowerCase() === 'accepted'
                const peerId = tab === 'incoming' ? r.fromUserId : r.toUserId
                const isSelected = selected.includes(r.id)
                return (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.2) }}
                    className={`overflow-hidden rounded-2xl ring-1 ${
                      isSelected
                        ? 'bg-brand-purple/10 ring-brand-purple/30'
                        : 'bg-gray-50 ring-gray-100 dark:bg-white/5 dark:ring-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-3 p-3.5">
                      <button
                        type="button"
                        aria-label="Select"
                        onClick={() => toggleSelect(r.id)}
                        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          isSelected
                            ? 'border-brand-purple bg-brand-purple text-white'
                            : 'border-gray-300 bg-white dark:border-white/20 dark:bg-transparent'
                        }`}
                      >
                        {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                      </button>
                      <Avatar
                        contact={{
                          id: peerId,
                          name: r.name,
                          photo: r.photo,
                          hue: r.hue,
                          online: false,
                        }}
                        size={48}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate font-extrabold text-ink dark:text-gray-100">{r.name}</p>
                          <span className="shrink-0 text-[11px] font-bold text-gray-400">
                            {timeAgo(r.createdAt)}
                          </span>
                        </div>
                        {r.username && (
                          <p className="truncate text-sm font-bold text-brand-purple">
                            @{String(r.username).replace(/^@/, '')}
                          </p>
                        )}
                        {r.message && (
                          <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-gray-500">
                            {r.message}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">
                          {statusLabel(r.status)}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {tab === 'incoming' && pending && (
                            <>
                              <button
                                type="button"
                                disabled={busyId === r.id}
                                onClick={() => void accept(r.id)}
                                className="inline-flex items-center gap-1 rounded-full bg-brand-purple px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-60"
                              >
                                <UserPlus size={14} />
                                Accept
                              </button>
                              <button
                                type="button"
                                disabled={busyId === r.id}
                                onClick={() => void decline(r.id)}
                                className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-3 py-1.5 text-xs font-extrabold text-gray-700 disabled:opacity-60 dark:bg-white/10 dark:text-gray-200"
                              >
                                <X size={14} />
                                Decline
                              </button>
                            </>
                          )}
                          {tab === 'outgoing' && pending && (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void cancelOutgoing(r.id)}
                              className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-3 py-1.5 text-xs font-extrabold text-gray-700 disabled:opacity-60 dark:bg-white/10 dark:text-gray-200"
                            >
                              Cancel request
                            </button>
                          )}
                          {tab === 'outgoing' && accepted && (
                            <>
                              {onChat && (
                                <button
                                  type="button"
                                  onClick={() => onChat(peerId)}
                                  className="inline-flex items-center gap-1 rounded-full bg-brand-purple px-3 py-1.5 text-xs font-extrabold text-white"
                                >
                                  Message
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busyId === r.id}
                                onClick={() => void unsave(peerId, r.id)}
                                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-extrabold text-brand-red disabled:opacity-60 dark:bg-red-500/15"
                              >
                                Unsave
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}
