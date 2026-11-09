import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Plus, Link2, BellOff, Pin, Users } from 'lucide-react'
import { BrandMark } from '../components/AppHeaderLogo'
import { Avatar } from '../components/Avatar'
import { PrimaryButton, Sheet, Toast } from '../components/ui'
import { useStore } from '../store'
import { IconBtn } from './ChatsHome'

export function GroupsTab({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const { groups, joinGroup, contacts } = useStore()
  const whoById = (id: string) => contacts.find(c => c.id === id) || { name: id }
  const [q, setQ] = useState('')
  const [join, setJoin] = useState(false)
  const [link, setLink] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const list = useMemo(
    () => groups.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [groups, q],
  )
  const code = link.trim().split('/').pop() ?? ''
  const doJoin = async () => {
    if (code.length < 5) return setToast('That invite link looks invalid')
    try {
      const id = await joinGroup(code)
      setJoin(false); setLink(''); onOpen(id)
    } catch (e: any) {
      setToast(e.message || 'Could not join')
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="sticky top-0 z-10 flex min-h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white/95 px-5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur">
        <BrandMark />
        <IconBtn label="Join with invite link" onClick={() => setJoin(true)}><Link2 size={22} /></IconBtn>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        <div className="px-5 pb-3 pt-2">
          <h2 className="text-xl font-black">Groups</h2>
          <div className="mt-3 flex h-11 items-center gap-2 rounded-full bg-gray-100 px-4 focus-within:ring-4 focus-within:ring-brand-purple/20">
            <Search size={18} className="text-brand-purple" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups" className="w-full bg-transparent font-semibold outline-none placeholder:text-gray-400" />
          </div>
        </div>
        <motion.button whileTap={{ scale: 0.98 }} onClick={onCreate} className="mx-5 mb-2 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-3xl bg-brand-purple/10 p-3 text-left">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-purple text-white"><Plus /></span>
          <span><span className="block font-extrabold text-brand-purple">Create new group</span><span className="text-sm font-semibold text-gray-500">Add people and start chatting</span></span>
        </motion.button>
        <ul className="px-2">
          <AnimatePresence initial={false}>
            {list.map((g, i) => {
              const msgs = Array.isArray(g.messages) ? g.messages : []
              const last = msgs.length ? msgs[msgs.length - 1] : null
              const who = last ? (last.from === 'me' ? 'You' : whoById(last.from).name.split(' ')[0]) : ''
              return (
                <motion.li key={g.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ delay: i * 0.03 }}>
                  <button onClick={() => onOpen(g.id)} className="flex w-full items-center gap-3 rounded-3xl px-3 py-3 text-left transition-colors hover:bg-gray-100 active:bg-gray-200">
                    <Avatar contact={{ id: g.id, name: g.name, hue: g.hue, online: false }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 font-extrabold"><span className="truncate">{g.name}</span>{g.pinned && <Pin size={13} className="shrink-0 text-gray-400" />}</span>
                        <span className="shrink-0 text-xs font-bold text-gray-400">{last?.time}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-500">{last && (last.system ? `${who} ${last.text}` : `${who}: ${last.text}`)}</span>
                        <span className="flex items-center gap-1.5">
                          {g.muted && <BellOff size={14} className="text-gray-400" />}
                          {g.unread > 0 && <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold text-white ${g.muted ? 'bg-gray-400' : 'bg-brand-red'}`}>{g.unread}</span>}
                        </span>
                      </div>
                    </div>
                  </button>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
        {list.length === 0 && <p className="flex flex-col items-center gap-2 py-14 font-bold text-gray-400"><Users /> No groups found</p>}
      </div>

      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.2 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={onCreate}
        aria-label="New group"
        className="fab-theme fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple text-white"
      >
        <Plus size={26} strokeWidth={2.4} />
      </motion.button>

      <Sheet open={join} onClose={() => setJoin(false)} title="Join with invite link">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="safechat.app/join/abc123" className="mb-4 h-13 w-full rounded-full bg-gray-100 px-5 py-3 font-bold outline-none focus:ring-4 focus:ring-brand-purple/25" />
        <PrimaryButton disabled={!link.trim()} onClick={doJoin}>Join group</PrimaryButton>
      </Sheet>
      <Toast msg={toast} clear={() => setToast(null)} />
    </div>
  )
}
