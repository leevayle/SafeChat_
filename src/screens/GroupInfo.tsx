import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BellOff, Pin, Crown, UserPlus, Copy, RefreshCw, Share2, LogOut, Pencil, Timer, Megaphone, Image as Img, Flag, Check, Search } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { OptionList, PrimaryButton, ScreenHeader, Sheet, Toast, Toggle } from '../components/ui'
import { HUES, whoById } from '../data'
import { stamp, useStore } from '../store'

function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="mt-4">
      {title && <h3 className="mb-2 px-2 text-sm font-extrabold text-brand-purple">{title}</h3>}
      <div className="divide-y divide-gray-100 overflow-hidden rounded-3xl bg-white shadow-sm">{children}</div>
    </section>
  )
}
function Line({ icon: I, label, hint, right, onClick, danger }: { icon: typeof Pin; label: string; hint?: string; right?: ReactNode; onClick?: () => void; danger?: boolean }) {
  const T = onClick ? 'button' : 'div'
  return (
    <T onClick={onClick} className={`flex w-full items-center gap-3 px-5 py-3.5 text-left ${onClick ? 'hover:bg-gray-50' : ''}`}>
      <I size={20} className={danger ? 'text-brand-red' : 'text-brand-purple'} />
      <span className="min-w-0 flex-1"><span className={`block font-bold ${danger ? 'text-brand-red' : ''}`}>{label}</span>{hint && <span className="block text-xs font-semibold text-gray-400">{hint}</span>}</span>
      {right}
    </T>
  )
}

type Sh = null | 'edit' | 'add' | 'timer' | 'leave' | 'color' | { member: string }

export function GroupInfo({ groupId, onBack, onLeft }: { groupId: string; onBack: () => void; onLeft: () => void }) {
  const { groups, patchGroup, removeGroup, contacts, settings } = useStore()
  const g = groups.find((x) => x.id === groupId)
  const [sheet, setSheet] = useState<Sh>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', desc: '' })
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState<string[]>([])
  if (!g) return null

  const isAdmin = !!g.members.find((m) => m.id === 'me')?.admin
  const sys = (text: string, from = 'me') => ({ id: String(Date.now()) + Math.random(), from, text, time: stamp(), system: true })
  const log = (text: string) => patchGroup(groupId, (x) => ({ ...x, messages: [...x.messages, sys(text)] }))
  const link = `safechat.app/join/${g.invite}`
  const members = [...g.members].sort((a, b) => Number(b.admin) - Number(a.admin))
  const shown = members.filter((m) => whoById(m.id).name.toLowerCase().includes(q.toLowerCase()))
  const addable = contacts.filter((c) => !g.members.some((m) => m.id === c.id) && !settings.blocked.includes(c.id))
  const target = sheet && typeof sheet === 'object' ? g.members.find((m) => m.id === sheet.member) : undefined

  const leave = () => {
    const rest = g.members.filter((m) => m.id !== 'me')
    if (!rest.some((m) => m.admin) && rest.length) rest[0] = { ...rest[0], admin: true }
    if (rest.length === 0) removeGroup(groupId)
    else patchGroup(groupId, (x) => ({ ...x, members: rest }))
    onLeft()
  }

  return (
    <div className="relative flex h-full flex-col bg-gray-100">
      <ScreenHeader title="Group info" onBack={onBack} right={isAdmin ? <button onClick={() => { setDraft({ name: g.name, desc: g.desc }); setSheet('edit') }} aria-label="Edit group" className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-gray-100"><Pencil size={20} /></button> : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6">
        <div className="flex flex-col items-center text-center">
          <motion.button whileTap={isAdmin ? { scale: 0.94 } : undefined} onClick={() => isAdmin && setSheet('color')} aria-label="Change group colour"><Avatar contact={{ name: g.name, hue: g.hue, online: false }} size={112} /></motion.button>
          <h2 className="mt-3 text-2xl font-black">{g.name}</h2>
          <p className="text-sm font-bold text-gray-400">Group · {g.members.length} members</p>
          <p className="mt-2 max-w-xs font-semibold text-gray-500">{g.desc || 'No description'}</p>
        </div>

        <Card title="Settings">
          <Line icon={BellOff} label="Mute notifications" right={<Toggle on={g.muted} onChange={(v) => patchGroup(groupId, (x) => ({ ...x, muted: v }))} label="Mute" />} />
          <Line icon={Pin} label="Pin group" right={<Toggle on={g.pinned} onChange={(v) => patchGroup(groupId, (x) => ({ ...x, pinned: v }))} label="Pin" />} />
          <Line icon={Timer} label="Disappearing messages" onClick={isAdmin ? () => setSheet('timer') : undefined} right={<span className="text-sm font-bold text-gray-400">{g.disappearing}</span>} />
          <Line icon={Megaphone} label="Only admins can send" hint={isAdmin ? 'Members will only be able to read' : 'Set by admins'} right={<Toggle on={g.adminOnly} onChange={(v) => { if (!isAdmin) return setToast('Only admins can change this'); patchGroup(groupId, (x) => ({ ...x, adminOnly: v })); log(v ? 'restricted messaging to admins' : 'allowed everyone to send messages') }} label="Admins only" />} />
          <Line icon={Img} label="Media, links and docs" right={<span className="text-sm font-bold text-gray-400">24</span>} onClick={() => setToast('Shared media would open here')} />
        </Card>

        {isAdmin && (
          <Card title="Invite link">
            <div className="p-4">
              <p className="truncate rounded-2xl bg-gray-100 px-4 py-3 text-sm font-bold text-brand-purple">{link}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-extrabold">
                <button onClick={() => { navigator.clipboard?.writeText(link); setToast('Link copied') }} className="flex items-center justify-center gap-1.5 rounded-full bg-brand-purple/10 py-2.5 text-brand-purple"><Copy size={15} />Copy</button>
                <button onClick={() => setToast('Share sheet would open')} className="flex items-center justify-center gap-1.5 rounded-full bg-brand-blue/10 py-2.5 text-brand-blue"><Share2 size={15} />Share</button>
                <button onClick={() => { patchGroup(groupId, (x) => ({ ...x, invite: Math.random().toString(36).slice(2, 8) })); setToast('Old link revoked') }} className="flex items-center justify-center gap-1.5 rounded-full bg-brand-red/10 py-2.5 text-brand-red"><RefreshCw size={15} />Reset</button>
              </div>
            </div>
          </Card>
        )}

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between px-2"><h3 className="text-sm font-extrabold text-brand-purple">{g.members.length} members</h3></div>
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3"><Search size={16} className="text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-gray-400" /></div>
            {isAdmin && <button onClick={() => { setAdding([]); setSheet('add') }} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple text-white"><UserPlus size={20} /></span><span className="font-extrabold">Add members</span></button>}
            {shown.map((m) => { const c = whoById(m.id); return (
              <button key={m.id} onClick={() => m.id !== 'me' && setSheet({ member: m.id })} className="flex w-full items-center gap-3 border-t border-gray-100 px-5 py-3 text-left hover:bg-gray-50">
                <Avatar contact={c} size={44} />
                <div className="min-w-0 flex-1"><p className="truncate font-extrabold">{m.id === 'me' ? settings.name + ' (You)' : c.name}</p><p className="truncate text-xs font-semibold text-gray-400">{m.id === 'me' ? settings.bio : c.status}</p></div>
                {m.admin && <span className="flex items-center gap-1 rounded-full bg-brand-orange-2/10 px-2.5 py-1 text-xs font-extrabold text-brand-orange-2"><Crown size={12} />Admin</span>}
              </button>) })}
          </div>
        </section>

        <Card>
          <Line icon={LogOut} danger label="Exit group" onClick={() => setSheet('leave')} />
          <Line icon={Flag} danger label="Report group" onClick={() => setToast('Report sent. Thank you.')} />
        </Card>
      </div>

      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit group">
        <input value={draft.name} maxLength={30} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mb-3 h-13 w-full rounded-full bg-gray-100 px-5 py-3 font-bold outline-none focus:ring-4 focus:ring-brand-purple/25" aria-label="Group name" />
        <textarea value={draft.desc} maxLength={120} rows={3} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Description" className="mb-4 w-full resize-none rounded-3xl bg-gray-100 px-5 py-3 font-semibold outline-none focus:ring-4 focus:ring-brand-purple/25" />
        <PrimaryButton disabled={draft.name.trim().length < 2} onClick={() => { patchGroup(groupId, (x) => ({ ...x, name: draft.name.trim(), desc: draft.desc.trim() })); log('updated the group details'); setSheet(null) }}>Save</PrimaryButton>
      </Sheet>

      <Sheet open={sheet === 'color'} onClose={() => setSheet(null)} title="Group colour">
        <div className="flex flex-wrap justify-center gap-4 py-2">
          {HUES.map((h, i) => <motion.button key={i} whileTap={{ scale: 0.85 }} onClick={() => { patchGroup(groupId, (x) => ({ ...x, hue: h })); setSheet(null) }} aria-label={`Colour ${i + 1}`} className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${h[0]}, ${h[1]})` }}>{g.hue[0] === h[0] && g.hue[1] === h[1] && <Check />}</motion.button>)}
        </div>
      </Sheet>

      <Sheet open={sheet === 'timer'} onClose={() => setSheet(null)} title="Disappearing messages">
        <OptionList options={['Off', '24 hours', '7 days', '90 days']} value={g.disappearing} onPick={(v) => { patchGroup(groupId, (x) => ({ ...x, disappearing: v })); log(v === 'Off' ? 'turned off disappearing messages' : `set messages to disappear after ${v}`); setSheet(null) }} />
      </Sheet>

      <Sheet open={sheet === 'add'} onClose={() => setSheet(null)} title="Add members">
        {addable.length === 0 ? <p className="py-6 text-center font-bold text-gray-400">Everyone is already in this group</p> : (
          <>
            <ul className="mb-4 space-y-1">
              {addable.map((c) => { const on = adding.includes(c.id); return (
                <li key={c.id}><button onClick={() => setAdding((a) => (on ? a.filter((x) => x !== c.id) : [...a, c.id]))} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 hover:bg-gray-100">
                  <Avatar contact={c} size={40} /><span className="flex-1 text-left font-bold">{c.name}</span>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-brand-purple bg-brand-purple text-white' : 'border-gray-300'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
                </button></li>) })}
            </ul>
            <PrimaryButton disabled={!adding.length} onClick={() => { patchGroup(groupId, (x) => ({ ...x, members: [...x.members, ...adding.map((id) => ({ id, admin: false }))], messages: [...x.messages, sys(`added ${adding.map((id) => whoById(id).name.split(' ')[0]).join(', ')}`)] })); setSheet(null); setToast('Members added') }}>Add {adding.length || ''} {adding.length === 1 ? 'member' : 'members'}</PrimaryButton>
          </>
        )}
      </Sheet>

      <Sheet open={!!target} onClose={() => setSheet(null)} title={target ? whoById(target.id).name : ''}>
        {target && (
          <div className="space-y-1">
            {[
              { l: 'Message', show: true, f: () => setToast('Opening chat…') },
              { l: target.admin ? 'Dismiss as admin' : 'Make group admin', show: isAdmin, f: () => { patchGroup(groupId, (x) => ({ ...x, members: x.members.map((m) => (m.id === target.id ? { ...m, admin: !m.admin } : m)) })); log(`${target.admin ? 'dismissed' : 'made'} ${whoById(target.id).name.split(' ')[0]} ${target.admin ? 'as admin' : 'an admin'}`); setSheet(null) } },
              { l: 'Remove from group', show: isAdmin, danger: true, f: () => { patchGroup(groupId, (x) => ({ ...x, members: x.members.filter((m) => m.id !== target.id), messages: [...x.messages, sys(`removed ${whoById(target.id).name.split(' ')[0]}`)] })); setSheet(null) } },
            ].filter((o) => o.show).map((o) => <button key={o.l} onClick={o.f} className={`w-full rounded-2xl px-4 py-3.5 text-left font-bold hover:bg-gray-100 ${o.danger ? 'text-brand-red' : ''}`}>{o.l}</button>)}
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'leave'} onClose={() => setSheet(null)} title="Exit group?">
        <p className="mb-5 font-semibold text-gray-500">You won't receive new messages from “{g.name}”.{isAdmin && ' If you are the only admin, another member will be promoted.'}</p>
        <div className="space-y-3"><PrimaryButton danger onClick={leave}>Exit group</PrimaryButton><button onClick={() => setSheet(null)} className="w-full rounded-full bg-gray-100 py-3.5 font-extrabold text-gray-600">Cancel</button></div>
      </Sheet>
      <Toast msg={toast} clear={() => setToast(null)} />
    </div>
  )
}
