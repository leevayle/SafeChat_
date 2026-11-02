import { useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Pencil, User, Lock, Bell, MessageSquare, Database, Shield, Globe, HelpCircle, LogOut, Trash2, ChevronRight, Camera, Ban, Smartphone, Info, Palette } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { OptionList, PrimaryButton, ScreenHeader, Sheet, Toast, Toggle } from '../components/ui'
import { FONT_SIZES, WALLPAPERS, useStore, type Settings as S } from '../store'

const WHO = ['Everyone', 'My contacts', 'Nobody']

function Section({ title, icon: Icon, children }: { title: string; icon: typeof User; children: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
      <h3 className="mb-2 flex items-center gap-2 px-2 text-sm font-extrabold text-brand-purple"><Icon size={16} /> {title}</h3>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-3xl bg-white shadow-sm">{children}</div>
    </motion.section>
  )
}

function Row({ label, hint, value, onClick, right, danger }: { label: string; hint?: string; value?: string; onClick?: () => void; right?: ReactNode; danger?: boolean }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`flex w-full items-center gap-3 px-5 py-3.5 text-left ${onClick ? 'transition-colors hover:bg-gray-50 active:bg-gray-100' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className={`font-bold ${danger ? 'text-brand-red' : ''}`}>{label}</p>
        {hint && <p className="text-xs font-semibold text-gray-400">{hint}</p>}
      </div>
      {value && <span className="max-w-[45%] truncate text-sm font-bold text-gray-400">{value}</span>}
      {right ?? (onClick && !danger && <ChevronRight size={18} className="text-gray-300" />)}
    </Tag>
  )
}

export function Settings({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  const { settings: s, setSetting, contacts } = useStore()
  const [picker, setPicker] = useState<{ title: string; options: string[]; key: keyof S } | null>(null)
  const [edit, setEdit] = useState(false)
  const [confirm, setConfirm] = useState<'logout' | 'delete' | null>(null)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: s.name, username: s.username, bio: s.bio })
  const file = useRef<HTMLInputElement>(null)

  const sel = (title: string, key: keyof S, options: string[]) => ({ value: String(s[key]), onClick: () => setPicker({ title, key, options }) })
  const tog = (key: keyof S, label: string) => ({ right: <Toggle on={s[key] as boolean} onChange={(v) => setSetting(key, v as never)} label={label} /> })

  return (
    <div className="relative flex h-full flex-col bg-gray-100">
      <ScreenHeader title="Settings" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5">
        <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.98 }} onClick={() => { setDraft({ name: s.name, username: s.username, bio: s.bio }); setEdit(true) }} className="flex w-full items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-sm">
          {s.photo ? <img src={s.photo} alt="" className="h-16 w-16 rounded-full object-cover" /> : <Avatar contact={{ name: s.name, hue: ['#FF8C00', '#7B2CBF'], online: false }} size={64} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black">{s.name}</p>
            <p className="truncate text-sm font-bold text-brand-purple">@{s.username}</p>
            <p className="truncate text-sm font-semibold text-gray-500">{s.bio || 'Add a bio'}</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple"><Pencil size={18} /></span>
        </motion.button>

        <Section title="Account" icon={User}>
          <Row label="Phone number" value={s.phone} onClick={() => setToast('A code would be sent to verify a new number')} />
          <Row label="Username" value={'@' + s.username} onClick={() => setEdit(true)} />
          <Row label="Language" {...sel('App language', 'language', ['English', 'Kiswahili', 'Français', 'Español', '日本語'])} />
        </Section>

        <Section title="Privacy" icon={Lock}>
          <Row label="Last seen & online" {...sel('Who can see my last seen', 'lastSeen', WHO)} />
          <Row label="Profile photo" {...sel('Who can see my profile photo', 'profilePhoto', WHO)} />
          <Row label="About" {...sel('Who can see my bio', 'about', WHO)} />
          <Row label="Add me to groups" {...sel('Who can add me to groups', 'groupsAdd', WHO)} />
          <Row label="Read receipts" hint="Turn off to hide blue ticks. You won't see others' either." {...tog('readReceipts', 'Read receipts')} />
          <Row label="Typing indicator" {...tog('typingIndicator', 'Typing indicator')} />
          <Row label="Default disappearing messages" {...sel('Default message timer', 'disappearing', ['Off', '24 hours', '7 days', '90 days'])} />
          <Row label="Blocked contacts" value={String(s.blocked.length)} onClick={() => setBlockedOpen(true)} />
        </Section>

        <Section title="Security" icon={Shield}>
          <Row label="App lock" hint="Require fingerprint or face to open SafeChat" {...tog('appLock', 'App lock')} />
          <Row label="Two-step verification" hint="Extra PIN when registering your number" {...tog('twoStep', 'Two-step verification')} />
          <Row label="Linked devices" value="1 active" onClick={() => setToast('This phone is your only linked device')} />
          <Row label="End-to-end encryption" hint="Messages and calls are secured by default" right={<Lock size={18} className="text-green-500" />} />
        </Section>

        <Section title="Notifications" icon={Bell}>
          <Row label="Message notifications" {...tog('msgNotif', 'Message notifications')} />
          <Row label="Group notifications" {...tog('groupNotif', 'Group notifications')} />
          <Row label="Call notifications" {...tog('callNotif', 'Call notifications')} />
          <Row label="Show message previews" {...tog('previews', 'Message previews')} />
          <Row label="Vibrate" {...tog('vibrate', 'Vibrate')} />
          <Row label="Notification sound" {...sel('Notification sound', 'sound', ['Chime', 'Bubble', 'Pop', 'Silent'])} />
        </Section>

        <Section title="Chats" icon={MessageSquare}>
          <Row label="Enter key sends" hint="Off adds a new line instead" {...tog('enterIsSend', 'Enter sends')} />
          <Row label="Font size" {...sel('Chat font size', 'fontSize', Object.keys(FONT_SIZES))} />
          <div className="px-5 py-3.5">
            <p className="flex items-center gap-2 font-bold"><Palette size={16} className="text-brand-purple" /> Chat wallpaper</p>
            <div className="mt-3 flex gap-3">
              {Object.entries(WALLPAPERS).map(([k, c]) => (
                <button key={k} onClick={() => setSetting('wallpaper', k)} aria-label={k} className="flex flex-col items-center gap-1.5">
                  <motion.span whileTap={{ scale: 0.9 }} animate={{ scale: s.wallpaper === k ? 1.1 : 1 }} className={`h-12 w-12 rounded-2xl ring-2 ring-offset-2 ${s.wallpaper === k ? 'ring-brand-purple' : 'ring-gray-200'}`} style={{ background: c }} />
                  <span className="text-xs font-bold text-gray-500">{k}</span>
                </button>
              ))}
            </div>
          </div>
          <Row label="Clear all chats" danger onClick={() => setToast('Chat history cleared')} />
        </Section>

        <Section title="Storage & data" icon={Database}>
          <div className="px-5 py-3.5">
            <div className="flex justify-between text-sm font-bold"><span>Used on this device</span><span className="text-gray-400">482 MB</span></div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-gray-100">
              {[['bg-brand-purple', 45], ['bg-brand-blue', 25], ['bg-brand-orange-2', 15]].map(([c, w], i) => <motion.span key={i} className={String(c)} initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ delay: 0.3 + i * 0.1 }} />)}
            </div>
            <div className="mt-2 flex gap-4 text-xs font-bold text-gray-500">
              <span>Photos 217 MB</span><span>Videos 120 MB</span><span>Docs 72 MB</span>
            </div>
          </div>
          <Row label="Media auto-download" {...sel('Auto-download media', 'autoDownload', ['Wi-Fi only', 'Wi-Fi and mobile', 'Never'])} />
          <Row label="Use less data for calls" {...tog('lowDataCalls', 'Low data calls')} />
          <Row label="Clear cache" value="64 MB" onClick={() => setToast('Cache cleared')} />
        </Section>

        <Section title="Help & about" icon={HelpCircle}>
          <Row label="Help center" onClick={() => setToast('Opening help center')} />
          <Row label="Invite friends" onClick={() => setToast('Invite link copied')} />
          <Row label="Privacy policy" onClick={() => setToast('Opening privacy policy')} />
          <Row label="Terms of service" onClick={() => setToast('Opening terms')} />
          <Row label="App version" value="1.0.0" right={<Info size={16} className="text-gray-300" />} />
        </Section>

        <div className="mt-5 divide-y divide-gray-100 overflow-hidden rounded-3xl bg-white shadow-sm">
          <Row label="Log out" danger right={<LogOut size={18} className="text-brand-red" />} onClick={() => setConfirm('logout')} />
          <Row label="Delete account" danger right={<Trash2 size={18} className="text-brand-red" />} onClick={() => setConfirm('delete')} />
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs font-bold text-gray-400"><Smartphone size={12} /> SafeChat<span className="text-brand-blue">.</span> v1.0.0</p>
      </div>

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker?.title}>
        {picker && <OptionList options={picker.options} value={String(s[picker.key])} onPick={(v) => { setSetting(picker.key, v as never); setPicker(null) }} />}
      </Sheet>

      <Sheet open={edit} onClose={() => setEdit(false)} title="Edit profile">
        <div className="mb-5 flex justify-center">
          <button onClick={() => file.current?.click()} className="relative" aria-label="Change photo">
            {s.photo ? <img src={s.photo} alt="" className="h-24 w-24 rounded-full object-cover" /> : <Avatar contact={{ name: draft.name || '?', hue: ['#FF8C00', '#7B2CBF'], online: false }} size={96} />}
            <span className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-orange-2 text-white ring-4 ring-white"><Camera size={16} /></span>
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setSetting('photo', URL.createObjectURL(f)) }} />
        </div>
        {[['Name', 'name', 30], ['Username', 'username', 20]].map(([l, k, m]) => (
          <label key={k as string} className="mb-3 block text-sm font-extrabold text-gray-500">{l}
            <input value={draft[k as 'name']} maxLength={m as number} onChange={(e) => setDraft({ ...draft, [k as string]: k === 'username' ? e.target.value.replace(/\s/g, '') : e.target.value })} className="mt-1.5 h-13 w-full rounded-full bg-gray-100 px-5 py-3 text-base font-bold text-ink outline-none focus:ring-4 focus:ring-brand-purple/25" />
          </label>
        ))}
        <label className="mb-5 block text-sm font-extrabold text-gray-500">Bio
          <textarea value={draft.bio} maxLength={80} rows={2} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} className="mt-1.5 w-full resize-none rounded-3xl bg-gray-100 px-5 py-3 text-base font-semibold text-ink outline-none focus:ring-4 focus:ring-brand-purple/25" />
        </label>
        <PrimaryButton disabled={draft.name.trim().length < 2 || draft.username.length < 3} onClick={() => { setSetting('name', draft.name.trim()); setSetting('username', draft.username); setSetting('bio', draft.bio); setEdit(false); setToast('Profile updated') }}>Save changes</PrimaryButton>
      </Sheet>

      <Sheet open={blockedOpen} onClose={() => setBlockedOpen(false)} title="Blocked contacts">
        <p className="mb-3 text-sm font-semibold text-gray-500">Blocked contacts can't call or message you. Tap a contact to toggle.</p>
        <ul className="space-y-1">
          {contacts.map((c) => {
            const b = s.blocked.includes(c.id)
            return (
              <li key={c.id}>
                <button onClick={() => setSetting('blocked', b ? s.blocked.filter((x) => x !== c.id) : [...s.blocked, c.id])} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 hover:bg-gray-100">
                  <Avatar contact={c} size={40} />
                  <span className="flex-1 text-left font-bold">{c.name}</span>
                  <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${b ? 'bg-brand-red/10 text-brand-red' : 'bg-gray-100 text-gray-500'}`}><Ban size={12} />{b ? 'Blocked' : 'Block'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'logout' ? 'Log out?' : 'Delete account?'}>
        <p className="mb-5 font-semibold text-gray-500">{confirm === 'logout' ? 'You can log back in with your phone number.' : 'This permanently deletes your profile, chats and groups. This cannot be undone.'}</p>
        <div className="space-y-3">
          <PrimaryButton danger onClick={onLogout}>{confirm === 'logout' ? 'Log out' : 'Delete my account'}</PrimaryButton>
          <button onClick={() => setConfirm(null)} className="w-full rounded-full bg-gray-100 py-3.5 font-extrabold text-gray-600 hover:bg-gray-200">Cancel</button>
        </div>
      </Sheet>

      <Toast msg={toast} clear={() => setToast(null)} />
    </div>
  )
}
