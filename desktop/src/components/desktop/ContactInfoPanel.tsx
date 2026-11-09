import { Phone, Video, MessageCircle, Bell, BellOff, Gamepad2, Ban, Copy } from 'lucide-react'
import { Avatar } from '../Avatar'
import { useStore } from '../../store'
import { useState } from 'react'

type Props = {
  contactId: string
  onCall?: (kind: 'audio' | 'video') => void
  onChat?: () => void
}

/** Desktop right column — mobile contact info + chat actions (mute / game / block). */
export function ContactInfoPanel({ contactId, onCall, onChat }: Props) {
  const { contacts, chats, presenceMap, typingPeers, busyMap, showToast, me } = useStore()
  const chat = chats.find((c) => c.contactId === contactId || c.conversationId === contactId)
  const contactHit = contacts.find((c) => c.id === contactId || c.peerId === contactId)
  const c = contactHit
    ? {
        ...contactHit,
        photo: contactHit.photo || chat?.photo || null,
        name: contactHit.name || chat?.name || contactId,
        hue: (contactHit.hue || (chat as any)?.hue || ['#7B2CBF', '#6389EB']) as [string, string],
      }
    : {
        id: contactId,
        name: chat?.name || contactId,
        photo: chat?.photo || null,
        hue: ((chat as any)?.hue || ['#7B2CBF', '#6389EB']) as [string, string],
        username: (chat as any)?.username,
        phone: (chat as any)?.phone,
        online: false,
        bio: (chat as any)?.bio,
        verifiedBadge: (chat as any)?.verifiedBadge,
      }

  const isSelf = !!(me?.id && contactId === me.id)
  const peer = contactId
  const peerOnline = !!(presenceMap?.[peer] || (c as any).online)
  const typing = !!(typingPeers as any)?.[peer]
  const busyInfo =
    busyMap?.[peer] ||
    ((c as any).busy ? { message: (c as any).busyMessage || 'busy', until: (c as any).busyUntil } : null)
  const busyActive = !!(
    busyInfo &&
    (busyInfo as any).message &&
    (!(busyInfo as any).until || Date.parse(String((busyInfo as any).until)) > Date.now())
  )

  const [muted, setMuted] = useState(() => {
    try {
      const map = JSON.parse(localStorage.getItem('sc_chat_muted') || '{}')
      return !!map[contactId]
    } catch {
      return false
    }
  })

  const statusLine = isSelf
    ? (() => {
        const u = (me?.username || (c as any).username || '').replace(/^@/, '')
        return u ? `@${u}` : 'Notes'
      })()
    : (c as any).onCall
      ? 'on a call'
      : busyActive
        ? (busyInfo as any).message || 'busy'
        : typing
          ? 'typing…'
          : peerOnline
            ? 'online'
            : 'offline'

  const displayName = isSelf
    ? `Me (${me?.name || (c as any).publicName || c.name || 'You'})`
    : c.name

  const showPremium = !!(c as any).verifiedBadge || !!(c as any).premium

  const copyPhone = async () => {
    const phone = c.phone
    if (!phone) return
    try {
      await navigator.clipboard.writeText(String(phone))
      showToast?.('Copied to clipboard')
    } catch {
      showToast?.('Could not copy')
    }
  }

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m
      try {
        const map = JSON.parse(localStorage.getItem('sc_chat_muted') || '{}')
        map[contactId] = next
        localStorage.setItem('sc_chat_muted', JSON.stringify(map))
      } catch {
        /* */
      }
      showToast?.(next ? 'Chat muted' : 'Chat unmuted')
      return next
    })
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#121821]">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 pb-3 pt-3 dark:border-white/10">
        <p className="text-lg font-black text-ink dark:text-white">Contact info</p>
      </div>
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pb-10 pt-8">
        <div className="flex w-full items-center justify-center">
          <div className="relative flex h-[140px] w-[140px] items-center justify-center rounded-full bg-gradient-to-br from-brand-purple/15 to-brand-orange/10">
            <Avatar
              contact={{
                ...c,
                online: peerOnline,
                premium: showPremium,
              }}
              size={120}
              premium={showPremium}
            />
          </div>
        </div>
        <h2 className="mt-4 flex items-center gap-1.5 text-2xl font-black text-ink dark:text-white">
          {displayName}
          {showPremium && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-purple text-[10px] font-black text-white" title="Premium">
              ✓
            </span>
          )}
        </h2>
        {!isSelf && (c as any).publicName && (c as any).publicName !== c.name ? (
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
            Public name: {(c as any).publicName}
          </p>
        ) : null}
        {c.username ? <p className="mt-2 font-bold text-brand-purple">@{String(c.username).replace(/^@/, '')}</p> : null}
        <p
          className={`mt-2 min-h-[1.25rem] max-w-sm px-4 text-center text-sm font-bold ${
            typing || peerOnline ? 'text-brand-blue' : 'text-gray-400'
          }`}
        >
          {statusLine}
        </p>

        {!isSelf && (
          <div className="mt-6 grid w-full grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onChat?.()}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-gray-50 py-3.5 transition active:scale-95 dark:bg-white/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
                <MessageCircle size={20} />
              </span>
              <span className="text-xs font-extrabold text-ink dark:text-white">Chat</span>
            </button>
            <button
              type="button"
              onClick={() => onCall?.('audio')}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-gray-50 py-3.5 transition active:scale-95 dark:bg-white/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
                <Phone size={20} />
              </span>
              <span className="text-xs font-extrabold text-ink dark:text-white">Audio</span>
            </button>
            <button
              type="button"
              onClick={() => onCall?.('video')}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-gray-50 py-3.5 transition active:scale-95 dark:bg-white/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
                <Video size={20} />
              </span>
              <span className="text-xs font-extrabold text-ink dark:text-white">Video</span>
            </button>
          </div>
        )}

        <div className="mt-8 w-full space-y-3">
          <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/5">
            <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Bio</p>
            <p className="mt-1 text-sm font-semibold text-ink dark:text-gray-200">
              {(c as any).bio || 'No bio yet'}
            </p>
          </div>
          {c.phone ? (
            <button
              type="button"
              onClick={() => void copyPhone()}
              className="flex w-full items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-left transition hover:bg-gray-100 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Phone</p>
                <p className="mt-1 text-sm font-semibold text-ink dark:text-gray-200">{c.phone}</p>
              </div>
              <Copy size={16} className="text-gray-400" />
            </button>
          ) : null}
          {c.username ? (
            <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/5">
              <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Username</p>
              <p className="mt-1 text-sm font-semibold text-brand-purple">@{String(c.username).replace(/^@/, '')}</p>
            </div>
          ) : null}
        </div>

        {/* Desktop-only chat actions (mobile keeps hamburger menu) */}
        {!isSelf && (
          <div className="mt-6 w-full space-y-1 border-t border-gray-100 pt-4 dark:border-white/10">
            <button
              type="button"
              onClick={toggleMute}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-ink hover:bg-gray-50 dark:text-white dark:hover:bg-white/5"
            >
              {muted ? <Bell size={18} className="text-brand-purple" /> : <BellOff size={18} className="text-brand-purple" />}
              {muted ? 'Unmute notifications' : 'Mute notifications'}
            </button>
            <button
              type="button"
              disabled
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-gray-300"
            >
              <Gamepad2 size={18} />
              Play tic tac toe
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-brand-red hover:bg-brand-red/5"
              onClick={() => showToast?.('Block is available from chat options on mobile')}
            >
              <Ban size={18} />
              Block contact
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
