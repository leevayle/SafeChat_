import { X, Phone, Video, Bell, BellOff, Ban, User } from 'lucide-react'
import { Avatar } from '../Avatar'
import { useStore } from '../../store'

type Props = {
  open: boolean
  contactId: string | null
  onClose: () => void
  onCall?: (kind: 'audio' | 'video') => void
}

export function InfoDrawer({ open, contactId, onClose, onCall }: Props) {
  const { contacts, chats, me } = useStore()
  const chat = chats.find((c) => c.contactId === contactId || c.conversationId === contactId)
  const contact = contacts.find((c) => c.id === contactId || c.peerId === contactId)
  const name = contact?.name || chat?.name || 'Contact'
  const photo = contact?.photo || chat?.photo || null
  const hue = (contact?.hue || chat?.hue || ['#7B2CBF', '#6389EB']) as [string, string]
  const isSelf = !!(me?.id && contactId === me.id)

  return (
    <>
      {/* Backdrop on narrow desktop */}
      <div
        className={`info-drawer-backdrop fixed inset-0 z-[40] bg-black/20 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`info-drawer absolute inset-y-0 right-0 z-[41] flex w-[min(340px,100%)] flex-col border-l border-black/8 bg-white shadow-xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/6 px-4">
          <span className="text-sm font-extrabold text-ink">Contact info</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col items-center border-b border-black/6 px-6 py-8">
            <Avatar
              contact={{
                id: contactId || '',
                name,
                photo,
                hue,
                online: contact?.online,
              }}
              size={88}
            />
            <h3 className="mt-4 text-lg font-extrabold text-ink">{isSelf ? me?.name || 'You' : name}</h3>
            {contact?.username && (
              <p className="mt-0.5 text-sm font-bold text-gray-400">@{String(contact.username).replace(/^@/, '')}</p>
            )}
            {!isSelf && (
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => onCall?.('audio')}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/15"
                  title="Voice call (stub)"
                >
                  <Phone size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => onCall?.('video')}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/15"
                  title="Video call (stub)"
                >
                  <Video size={20} />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1 p-3">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-ink hover:bg-gray-50"
            >
              <Bell size={18} className="text-gray-400" />
              Mute notifications
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-ink hover:bg-gray-50"
            >
              <BellOff size={18} className="text-gray-400" />
              Disappearing messages
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-brand-red hover:bg-brand-red/5"
            >
              <Ban size={18} />
              Block contact
            </button>
          </div>

          <div className="mx-4 mb-6 rounded-2xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-400">
              <User size={14} /> About
            </div>
            <p className="mt-2 text-sm font-semibold text-gray-600">
              {(contact as any)?.about || (contact as any)?.bio || 'Hey there! I am using SafeChat.'}
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
