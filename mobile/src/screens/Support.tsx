import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LifeBuoy, Send, MessageCircle } from 'lucide-react'
import { ScreenHeader } from '../components/ui'
import { PillButton } from '../components/PillButton'
import { useStore } from '../store'

type Ticket = {
  id: string
  subject: string
  body: string
  createdAt: string
  status: 'open' | 'replied'
  reply?: string
  repliedAt?: string
}

const STORAGE_KEY = 'sc_support_tickets'

function loadTickets(): Ticket[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveTickets(list: Ticket[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

type Props = { onClose: () => void }

export function Support({ onClose }: Props) {
  const { showToast, me } = useStore()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setTickets(loadTickets())
  }, [])

  const submit = async () => {
    if (!subject.trim() || !body.trim() || sending) return
    setSending(true)
    try {
      const ticket: Ticket = {
        id: `t-${Date.now()}`,
        subject: subject.trim(),
        body: body.trim(),
        createdAt: new Date().toISOString(),
        status: 'open',
      }
      const next = [ticket, ...tickets]
      setTickets(next)
      saveTickets(next)
      setSubject('')
      setBody('')
      showToast('Support request sent')

      // Simulated support reply after a short delay (offline-friendly)
      window.setTimeout(() => {
        setTickets((prev) => {
          const updated = prev.map((t) =>
            t.id === ticket.id
              ? {
                  ...t,
                  status: 'replied' as const,
                  reply:
                    `Hi${me?.name ? ` ${me.name.split(' ')[0]}` : ''}, thanks for reaching out. ` +
                    `We've received your report about “${ticket.subject}”. Our team will follow up if we need more detail. — SafeChat Support`,
                  repliedAt: new Date().toISOString(),
                }
              : t,
          )
          saveTickets(updated)
          return updated
        })
      }, 2500)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader title="Support" onBack={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-brand-purple/5 px-4 py-3">
          <LifeBuoy className="mt-0.5 shrink-0 text-brand-purple" size={22} />
          <p className="text-sm font-semibold text-gray-600">
            Tell us what went wrong or what you need help with. You can track replies on this page.
          </p>
        </div>

        <label className="mb-1 block text-xs font-extrabold text-gray-500">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, 80))}
          placeholder="e.g. Can't send photos"
          className="mb-3 h-11 w-full rounded-2xl border border-gray-200 px-4 font-semibold outline-none focus:border-brand-purple"
        />
        <label className="mb-1 block text-xs font-extrabold text-gray-500">Describe the issue</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 1000))}
          rows={4}
          placeholder="What happened? Include steps if you can."
          className="mb-3 w-full resize-none rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
        />
        <PillButton
          variant="orange"
          onClick={submit}
          loading={sending}
          disabled={!subject.trim() || !body.trim()}
        >
          <span className="inline-flex items-center gap-2">
            <Send size={16} /> Send to support
          </span>
        </PillButton>

        <h3 className="mb-2 mt-8 text-sm font-extrabold uppercase tracking-wide text-gray-400">
          Your tickets
        </h3>
        {tickets.length === 0 && (
          <p className="py-8 text-center text-sm font-bold text-gray-400">No support requests yet</p>
        )}
        <ul className="space-y-3">
          {tickets.map((t, i) => (
            <motion.li
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-2xl border border-gray-100 bg-gray-50 p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-extrabold text-ink">{t.subject}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                    t.status === 'replied'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {t.status === 'replied' ? 'Replied' : 'Open'}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-gray-600">{t.body}</p>
              <p className="mt-1 text-[11px] font-bold text-gray-400">
                {new Date(t.createdAt).toLocaleString()}
              </p>
              {t.reply && (
                <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-brand-purple/15">
                  <p className="mb-1 flex items-center gap-1 text-xs font-extrabold text-brand-purple">
                    <MessageCircle size={12} /> Support
                  </p>
                  <p className="text-sm font-semibold text-gray-700">{t.reply}</p>
                  {t.repliedAt && (
                    <p className="mt-1 text-[11px] font-bold text-gray-400">
                      {new Date(t.repliedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  )
}
