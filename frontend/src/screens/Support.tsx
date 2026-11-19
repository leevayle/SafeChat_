import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { LifeBuoy, MessageCircle, RefreshCw, Send } from 'lucide-react'
import { ScreenHeader } from '../components/ui'
import { PillButton } from '../components/PillButton'
import { useStore } from '../store'
import { api, type SupportTicket } from '../api'

type Props = { onClose: () => void; prefill?: { subject?: string; body?: string } | null }

function ticketTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

export function Support({ onClose, prefill }: Props) {
  const { showToast } = useStore()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [subject, setSubject] = useState(prefill?.subject || '')
  const [body, setBody] = useState(prefill?.body || '')
  const [replyDraft, setReplyDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const knownReplies = useRef<Map<string, Set<string>>>(new Map())

  const loadTickets = useCallback(async (notifyReplies = false) => {
    try {
      const result = await api.supportTickets(1, 100)
      if (notifyReplies) {
        for (const ticket of result.items) {
          const seen = knownReplies.current.get(ticket.id) || new Set<string>()
          if (ticket.replies.some((reply) => reply.authorRole !== 'USER' && !seen.has(reply.id))) {
            showToast(`Customer care replied: ${ticket.subject}`)
          }
        }
      }
      knownReplies.current = new Map(
        result.items.map((ticket) => [ticket.id, new Set(ticket.replies.map((reply) => reply.id))]),
      )
      setTickets(result.items)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load your support tickets.')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadTickets()
    const timer = window.setInterval(() => void loadTickets(true), 20_000)
    return () => window.clearInterval(timer)
  }, [loadTickets])

  const submitTicket = async () => {
    if (!subject.trim() || !body.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const ticket = await api.createSupportTicket(subject.trim(), body.trim())
      setTickets((current) => [ticket, ...current])
      knownReplies.current.set(ticket.id, new Set())
      setSubject('')
      setBody('')
      showToast('Customer care request sent')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send your support request.')
    } finally {
      setSending(false)
    }
  }

  const submitReply = async (ticket: SupportTicket) => {
    if (!replyDraft.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const updated = await api.replySupportTicket(ticket.id, replyDraft.trim())
      setTickets((current) => current.map((item) => item.id === updated.id ? updated : item))
      knownReplies.current.set(updated.id, new Set(updated.replies.map((reply) => reply.id)))
      setReplyDraft('')
      setReplyingTo(null)
      showToast('Reply sent to support')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send your reply.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader title="Customer care" onBack={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-brand-purple/5 px-4 py-3">
          <LifeBuoy className="mt-0.5 shrink-0 text-brand-purple" size={22} />
          <p className="text-sm font-semibold text-gray-600">
            Tell us what went wrong. Your requests and support replies stay synced to your account.
          </p>
        </div>

        <label className="mb-1 block text-xs font-extrabold text-gray-500" htmlFor="support-subject">Subject</label>
        <input
          id="support-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value.slice(0, 80))}
          placeholder="e.g. Can't send photos"
          className="mb-3 h-11 w-full rounded-2xl border border-gray-200 px-4 font-semibold outline-none focus:border-brand-purple"
        />
        <label className="mb-1 block text-xs font-extrabold text-gray-500" htmlFor="support-body">Describe the issue</label>
        <textarea
          id="support-body"
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, 1000))}
          rows={4}
          placeholder="What happened? Include steps if you can."
          className="mb-3 w-full resize-none rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
        />
        <PillButton
          variant="purple"
          onClick={submitTicket}
          loading={sending}
          disabled={!subject.trim() || !body.trim()}
        >
          <span className="inline-flex items-center gap-2">
            <Send size={16} /> Send to customer care
          </span>
        </PillButton>

        <div className="mb-2 mt-8 flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-400">Your tickets</h3>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-brand-purple hover:bg-brand-purple/5"
            onClick={() => void loadTickets(true)}
            aria-label="Refresh support tickets"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        {loading && <p className="py-8 text-center text-sm font-bold text-gray-400">Loading your tickets…</p>}
        {!loading && tickets.length === 0 && (
          <p className="py-8 text-center text-sm font-bold text-gray-400">No support requests yet</p>
        )}
        <ul className="space-y-3">
          {tickets.map((ticket, index) => (
            <motion.li
              key={ticket.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="rounded-2xl border border-gray-100 bg-gray-50 p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-extrabold text-ink">{ticket.subject}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                  ticket.status === 'replied'
                    ? 'bg-green-100 text-green-700'
                    : ticket.status === 'closed'
                      ? 'bg-gray-200 text-gray-600'
                      : 'bg-amber-100 text-amber-700'
                }`}>
                  {ticket.status === 'replied' ? 'Customer care replied' : ticket.status}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-600">{ticket.body}</p>
              <p className="mt-1 text-[11px] font-bold text-gray-400">Sent {ticketTime(ticket.createdAt)}</p>
              {ticket.replies.map((reply) => {
                const isCare = reply.authorRole !== 'USER'
                return (
                  <div key={reply.id} className="mt-3 rounded-xl bg-white p-3 ring-1 ring-brand-purple/15">
                    <p className={`mb-1 flex items-center gap-1.5 text-xs font-extrabold ${
                      isCare ? 'text-brand-purple' : 'text-gray-500'
                    }`}>
                      <MessageCircle
                        size={13}
                        strokeWidth={isCare ? 2.25 : 2}
                        className={isCare ? 'fill-brand-purple text-brand-purple' : 'fill-none text-gray-500'}
                      />
                      {isCare ? 'Customer care' : 'You'}
                    </p>
                    <p className="whitespace-pre-wrap text-sm font-semibold text-gray-700">{reply.body}</p>
                    <p className="mt-1 text-[11px] font-bold text-gray-400">{ticketTime(reply.createdAt)}</p>
                  </div>
                )
              })}
              {ticket.status === 'open' && ticket.replies.length === 0 && (
                <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-500">
                  Your request is with the support team. Replies will appear here automatically.
                </p>
              )}
              {ticket.status !== 'closed' && (
                replyingTo === ticket.id ? (
                  <div className="mt-3">
                    <textarea
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value.slice(0, 2000))}
                      rows={3}
                      placeholder="Add more details or reply to support…"
                      className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-purple"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-bold text-gray-500" onClick={() => { setReplyingTo(null); setReplyDraft('') }}>Cancel</button>
                      <button
                        type="button"
                        disabled={!replyDraft.trim() || sending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-purple px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-50"
                        onClick={() => void submitReply(ticket)}
                      >
                        <Send size={12} /> Send reply
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-3 text-xs font-extrabold text-brand-purple"
                    onClick={() => { setReplyingTo(ticket.id); setReplyDraft('') }}
                  >
                    Reply to this ticket
                  </button>
                )
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  )
}
