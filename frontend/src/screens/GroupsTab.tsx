import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Plus, Link2, BellOff, Pin, Users, Check, X } from 'lucide-react'
import { BrandMark } from '../components/AppHeaderLogo'
import { Avatar } from '../components/Avatar'
import { PrimaryButton, Sheet, Toast } from '../components/ui'
import { api } from '../api'
import { useStore } from '../store'
import { IconBtn } from './ChatsHome'

type GroupInvite = {
  id: string
  group_id: string
  group_name?: string
  group_photo?: string | null
  invited_by?: { id?: string; display_name?: string; username?: string; profile_photo?: string | null }
}

export function GroupsTab({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const { settings, groups, joinGroup, refreshGroups } = useStore()
  const [q, setQ] = useState('')
  const [join, setJoin] = useState(false)
  const [joining, setJoining] = useState(false)
  const [link, setLink] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [invites, setInvites] = useState<GroupInvite[]>([])
  const [inviteBusy, setInviteBusy] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    try {
      const { invites: list } = await api.groupInvites()
      setInvites(Array.isArray(list) ? list : [])
    } catch {
      setInvites([])
    }
  }, [])

  useEffect(() => {
    void loadInvites()
  }, [loadInvites])

  const list = useMemo(
    () => groups.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [groups, q],
  )
  const code = link.trim().split('/').pop() ?? ''
  const doJoin = async () => {
    if (code.length < 5) return setToast('That invite link looks invalid')
    if (joining) return
    setJoining(true)
    try {
      const id = await joinGroup(code)
      setJoin(false)
      setLink('')
      await loadInvites()
      setToast('Joined group')
      if (id) onOpen(id)
    } catch (e: any) {
      setToast(e?.message || 'Could not join')
    } finally {
      setJoining(false)
    }
  }

  const acceptInvite = async (inv: GroupInvite) => {
    setInviteBusy(inv.id)
    try {
      await api.acceptGroupInvite(inv.id)
      await refreshGroups()
      await loadInvites()
      setToast('Joined group')
      if (inv.group_id) onOpen(inv.group_id)
    } catch (e: any) {
      setToast(e?.message || 'Could not accept invite')
    } finally {
      setInviteBusy(null)
    }
  }

  const declineInvite = async (inv: GroupInvite) => {
    setInviteBusy(inv.id)
    try {
      await api.rejectGroupInvite(inv.id)
      await loadInvites()
      setToast('Invite declined')
    } catch (e: any) {
      setToast(e?.message || 'Could not decline')
    } finally {
      setInviteBusy(null)
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="sticky top-0 z-10 flex min-h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white/95 px-5 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur dark:border-white/10 dark:bg-[#0b141a]/95">
        <BrandMark />
        <IconBtn label="Join with invite link" onClick={() => setJoin(true)}>
          <Link2 size={22} />
        </IconBtn>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        <div className="px-5 pb-3 pt-2">
          <h2 className="text-xl font-black">Groups</h2>
          <div className="mt-3 flex h-11 items-center gap-2 rounded-full bg-gray-100 px-4 focus-within:ring-4 focus-within:ring-brand-purple/20 dark:bg-white/10">
            <Search size={18} className="text-brand-purple" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups" className="w-full bg-transparent font-semibold outline-none placeholder:text-gray-400" />
          </div>
        </div>

        {invites.length > 0 && (
          <div className="mx-5 mb-3 rounded-3xl border border-brand-purple/20 bg-brand-purple/5 p-3 dark:bg-brand-purple/10">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold uppercase tracking-wide text-brand-purple">Group invites</p>
              <button type="button" onClick={() => setJoin(true)} className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-brand-purple shadow-sm dark:bg-white/10">
                <Link2 size={12} /> Link
              </button>
            </div>
            <ul className="space-y-2">
              {invites.map((inv) => {
                const inviter = inv.invited_by?.display_name || inv.invited_by?.username || 'Someone'
                return (
                  <li key={inv.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm dark:bg-white/5">
                    <Avatar contact={{ id: inv.group_id, name: inv.group_name || 'Group', photo: inv.group_photo }} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{inv.group_name || 'Group'}</p>
                      <p className="truncate text-xs font-semibold text-gray-500">Invited by {inviter}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" disabled={inviteBusy === inv.id} onClick={() => void acceptInvite(inv)} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-purple text-white disabled:opacity-50" aria-label="Accept">
                        <Check size={16} />
                      </button>
                      <button type="button" disabled={inviteBusy === inv.id} onClick={() => void declineInvite(inv)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 disabled:opacity-50 dark:bg-white/10" aria-label="Decline">
                        <X size={16} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Big "New group" CTA only while the user has zero groups at all */}
        {groups.length === 0 && (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onCreate}
            className="mx-5 mb-2 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-3xl bg-brand-purple/10 p-3 text-left"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-purple text-white">
              <Plus size={22} />
            </span>
            <span>
              <span className="block font-extrabold text-brand-purple">New group</span>
              <span className="block text-xs font-semibold text-gray-500">Create and share an invite link</span>
            </span>
          </motion.button>
        )}

        <ul className="px-2">
          <AnimatePresence initial={false}>
            {list.map((g) => {
              const preview = g.last || g.desc || 'No messages yet'
              return (
                <motion.li key={g.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <button type="button" onClick={() => onOpen(g.id)} className="flex w-full items-center gap-3 rounded-3xl px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5">
                    <Avatar contact={{ id: g.id, name: g.name, photo: g.photo, hue: g.hue }} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-extrabold">{g.name}</span>
                          {g.pinned ? <Pin size={12} className="shrink-0 text-gray-400" /> : null}
                        </span>
                        <span className="shrink-0 text-xs font-bold text-gray-400">{g.time || ''}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-500">{preview}</span>
                        <span className="flex items-center gap-1.5">
                          {g.muted ? <BellOff size={14} className="text-gray-400" /> : null}
                          {g.mentionUnread ? (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-purple px-1.5 text-[11px] font-black text-white">
                              @
                            </span>
                          ) : null}
                          {g.unread > 0 ? (
                            <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-center text-[11px] font-extrabold leading-none tabular-nums text-white ${g.muted ? 'bg-gray-400' : 'bg-brand-red'}`}>
                              {g.unread > 99 ? '99+' : g.unread}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </button>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
        {list.length === 0 && invites.length === 0 && (
          <p className="flex flex-col items-center gap-2 py-14 font-bold text-gray-400">
            <Users /> No groups found
          </p>
        )}
      </div>

      {settings.showFab !== false && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={onCreate}
          aria-label="New group"
          className="fab-theme absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple text-white md:bottom-6"
        >
          <Plus size={26} strokeWidth={2.4} />
        </motion.button>
      )}

      <Sheet open={join} onClose={() => setJoin(false)} title="Join with invite link">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="safechat.app/join/abc123" className="mb-4 h-13 w-full rounded-full bg-gray-100 px-5 py-3 font-bold outline-none focus:ring-4 focus:ring-brand-purple/25 dark:bg-white/10" />
        <PrimaryButton disabled={!link.trim() || joining} onClick={() => void doJoin()}>{joining ? 'Joining…' : 'Join group'}</PrimaryButton>
      </Sheet>
      <Toast msg={toast} clear={() => setToast(null)} />
    </div>
  )
}
