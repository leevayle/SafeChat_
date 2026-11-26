import { Phone, Video, MessageCircle, Bell, BellOff, Gamepad2, Ban, Copy, Pencil } from 'lucide-react'
import { Avatar, VerifiedCheck } from '../Avatar'
import { useStore } from '../../store'
import { api } from '../../api'
import { useState } from 'react'

import { kvGet, kvSet, kvRemove, kvGetJson, kvSetJson, hydrateKv } from '../../lib/kv'
type Props = {
  contactId: string
  onCall?: (kind: 'audio' | 'video') => void
  onChat?: () => void
}

/** Desktop right column — mobile contact info + chat actions (mute / game / block). */
export function ContactInfoPanel({ contactId, onCall, onChat }: Props) {
  const { contacts, chats, presenceMap, typingPeers, busyMap, showToast, me, refreshContacts } = useStore()
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
      const map = JSON.parse(kvGet('sc_chat_muted') || '{}')
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
      : typing
        ? 'typing…'
        : peerOnline && busyActive
          ? (busyInfo as any).message || 'busy'
          : peerOnline
            ? 'online'
            : 'offline'

  const displayName = isSelf
    ? `Me (${me?.name || (c as any).publicName || c.name || 'You'})`
    : c.name

  const showPremium = !!(c as any).verifiedBadge || !!(c as any).premium

  const [editingContactName, setEditingContactName] = useState(false)
  const [contactNameDraft, setContactNameDraft] = useState('')
  const [savingContactName, setSavingContactName] = useState(false)

  const copyPhone = async () => {
    const phone = c.phone || (c as any).phone_number || ''
    if (!phone) return
    try {
      const { copyText } = await import('../../lib/clipboard')
      const ok = await copyText(String(phone))
      showToast?.(ok ? 'Copied to clipboard' : 'Could not copy')
    } catch {
      showToast?.('Could not copy')
    }
  }

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m
      try {
        const map = JSON.parse(kvGet('sc_chat_muted') || '{}')
        map[contactId] = next
        kvSet('sc_chat_muted', JSON.stringify(map))
      } catch {
        /* */
      }
      showToast?.(next ? 'Chat muted' : 'Chat unmuted')
      return next
    })
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#121821]">
      <div className="flex min-h-16 shrink-0 items-center gap-2 border-b border-gray-100 px-3 pb-3 pt-[max(12px,env(safe-area-inset-top))] dark:border-white/10">
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
          {showPremium && <VerifiedCheck size={18} />}
        </h2>
        {!isSelf && (c as any).publicName && (c as any).publicName !== c.name ? (
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
            Public name: {(c as any).publicName}
          </p>
        ) : null}
        {!isSelf && (
          <div className="mt-3 w-full max-w-xs">
            {editingContactName ? (
              <div className="flex flex-col gap-2">
                <input
                  value={contactNameDraft}
                  onChange={(e) => setContactNameDraft(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-center text-sm font-bold text-ink outline-none focus:border-brand-purple dark:border-white/10 dark:bg-white/5 dark:text-white"
                  placeholder="Display name"
                  autoFocus
                  maxLength={64}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingContactName}
                    onClick={() => {
                      setEditingContactName(false)
                      setContactNameDraft('')
                    }}
                    className="flex-1 rounded-full bg-gray-100 py-2 text-sm font-extrabold text-ink dark:bg-white/10 dark:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingContactName || !contactNameDraft.trim()}
                    onClick={async () => {
                      const name = contactNameDraft.trim()
                      if (!name) return
                      const id = String((c as any).peerId || (c as any).id || contactId || '')
                      if (!id) {
                        showToast?.('Could not update contact')
                        return
                      }
                      setSavingContactName(true)
                      try {
                        await api.updateContact(id, { savedName: name })
                        await refreshContacts()
                        showToast?.('Display name updated')
                        setEditingContactName(false)
                        setContactNameDraft('')
                      } catch (e: any) {
                        showToast?.(e?.message || 'Could not update name')
                      } finally {
                        setSavingContactName(false)
                      }
                    }}
                    className="flex-1 rounded-full bg-brand-purple py-2 text-sm font-extrabold text-white disabled:opacity-50"
                  >
                    {savingContactName ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setContactNameDraft(String(displayName || c.name || ''))
                  setEditingContactName(true)
                }}
                className="mx-auto flex items-center gap-1.5 rounded-full bg-brand-purple/10 px-4 py-2 text-sm font-extrabold text-brand-purple"
              >
                <Pencil size={14} />
                Edit display name
              </button>
            )}
          </div>
        )}
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
              {((c as any).bio || '').trim() || 'No bio yet'}
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
