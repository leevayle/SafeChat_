import { useRef, useState, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Lock, Bell, MessageSquare, Database, Shield, Globe, HelpCircle, LogOut,
  Trash2, ChevronRight, Camera, Ban, Smartphone, Info, Palette, ArrowLeft,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { OptionList, PrimaryButton, ScreenHeader, Sheet, Toast, Toggle } from '../components/ui'
import {
  FONT_SIZES,
  WALLPAPERS,
  WALLPAPER_SOLIDS,
  WALLPAPER_GRADIENTS,
  THEMES,
  CHAT_ACCENTS,
  useStore,
  type Settings as S,
} from '../store'
import { api } from '../api'
import { ImageCropper } from '../components/ImageCropper'
import { fileToDataUrl } from '../lib/imageProcess'

const WHO = ['Everyone', 'My contacts', 'Nobody']
const themeLabelFromId = (id: string) =>
  THEMES[id as keyof typeof THEMES]?.label || THEMES.purple.label

type Page =
  | 'home'
  | 'profile'
  | 'privacy'
  | 'notifications'
  | 'chats'
  | 'storage'
  | 'security'
  | 'language'
  | 'help'
  | 'blocked'

function Row({
  label,
  hint,
  value,
  onClick,
  right,
  danger,
}: {
  label: string
  hint?: string
  value?: string
  onClick?: () => void
  right?: ReactNode
  danger?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-5 py-3.5 text-left ${
        onClick ? 'transition-colors hover:bg-gray-50 active:bg-gray-100' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`font-bold ${danger ? 'text-brand-red' : ''}`}>{label}</p>
        {hint && <p className="text-xs font-semibold text-gray-400">{hint}</p>}
      </div>
      {value && <span className="max-w-[45%] truncate text-sm font-bold text-gray-400">{value}</span>}
      {right ?? (onClick && !danger && <ChevronRight size={18} className="text-gray-300" />)}
    </Tag>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-gray-100 overflow-hidden rounded-3xl bg-white shadow-sm">
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 px-2 text-sm font-extrabold text-brand-purple">{children}</h3>
}

export function Settings({
  onBack,
  onLogout,
  onSupport,
}: {
  onBack: () => void
  onLogout: () => void
  onSupport?: () => void
}) {
  const { settings: s, setSetting, saveProfile, contacts } = useStore()
  const [page, setPage] = useState<Page>('home')
  const [picker, setPicker] = useState<{ title: string; options: string[]; key: keyof S } | null>(null)
  const [confirm, setConfirm] = useState<'logout' | 'delete' | null>(null)
  const [deleteStep, setDeleteStep] = useState<'password' | 'phrase'>('password')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePhrase, setDeletePhrase] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [draft, setDraft] = useState({ name: s.name, username: s.username, bio: s.bio })
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'own'
  >('idle')
  const usernameCheckRef = useRef(0)
  const file = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  useEffect(() => {
    if (page !== 'profile') return
    setDraft({ name: s.name, username: s.username, bio: s.bio })
  }, [page, s.name, s.username, s.bio])

  useEffect(() => {
    if (page !== 'profile') return
    const raw = draft.username.trim().toLowerCase()
    if (raw === (s.username || '').toLowerCase()) {
      setUsernameStatus('own')
      return
    }
    if (raw.length < 3) {
      setUsernameStatus(raw.length === 0 ? 'idle' : 'invalid')
      return
    }
    if (!/^[a-z0-9._]+$/.test(raw)) {
      setUsernameStatus('invalid')
      return
    }
    setUsernameStatus('checking')
    const token = ++usernameCheckRef.current
    const t = setTimeout(async () => {
      try {
        const { available } = await api.checkUsername(raw)
        if (token !== usernameCheckRef.current) return
        setUsernameStatus(available ? 'available' : 'taken')
      } catch {
        if (token !== usernameCheckRef.current) return
        setUsernameStatus('idle')
      }
    }, 400)
    return () => clearTimeout(t)
  }, [draft.username, page, s.username])

  const sel = (title: string, key: keyof S, options: string[]) => ({
    value: String(s[key]),
    onClick: () => setPicker({ title, key, options }),
  })

  const title =
    page === 'home'
      ? 'Settings'
      : page === 'profile'
        ? 'Profile'
        : page === 'privacy'
          ? 'Privacy'
          : page === 'notifications'
            ? 'Notifications'
            : page === 'chats'
              ? 'Chats'
              : page === 'storage'
                ? 'Storage'
                : page === 'security'
                  ? 'Security'
                  : page === 'language'
                    ? 'Language'
                    : page === 'blocked'
                      ? 'Blocked'
                      : 'Help'

  const persistThemeToServer = async () => {
    try {
      await api.updateMe({ theme: s.theme || 'purple' })
    } catch {
      /* ignore offline / auth errors */
    }
  }

  const goBack = () => {
    if (page === 'chats') {
      void persistThemeToServer()
    }
    if (page === 'home') onBack()
    else setPage('home')
  }

  const canSaveProfile =
    !savingProfile &&
    draft.name.trim().length >= 2 &&
    draft.username.length >= 3 &&
    (usernameStatus === 'available' || usernameStatus === 'own')

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <ScreenHeader title={title} onBack={goBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2">
        <AnimatePresence mode="wait">
          {page === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="space-y-5"
            >
              <button
                type="button"
                onClick={() => setPage('profile')}
                className="flex w-full items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-sm"
              >
                <Avatar
                  contact={{ id: 'me', name: s.name, photo: s.photo, hue: ['#7B2CBF', '#6389EB'] }}
                  size={64}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-black text-ink">{s.name}</p>
                  <p className="truncate text-sm font-bold text-brand-purple">@{s.username}</p>
                  {s.bio ? <p className="mt-0.5 truncate text-xs font-semibold text-gray-400">{s.bio}</p> : null}
                </div>
                <ChevronRight size={20} className="text-gray-300" />
              </button>

              <div>
                <SectionLabel>Account</SectionLabel>
                <Card>
                  <Row label="Profile" hint="Name, username, bio, photo" onClick={() => setPage('profile')} />
                  <Row label="Privacy" hint="Last seen, read receipts" onClick={() => setPage('privacy')} />
                  <Row label="Security" hint="App lock" onClick={() => setPage('security')} />
                </Card>
              </div>

              <div>
                <SectionLabel>Preferences</SectionLabel>
                <Card>
                  <Row label="Notifications" onClick={() => setPage('notifications')} />
                  <Row label="Chats" hint="Wallpaper, font size" onClick={() => setPage('chats')} />
                  <Row label="Storage & data" onClick={() => setPage('storage')} />
                  <Row label="Language" value={String(s.language || 'English')} onClick={() => setPage('language')} />
                </Card>
              </div>

              <div>
                <SectionLabel>Support</SectionLabel>
                <Card>
                  <Row label="Help" onClick={() => setPage('help')} />
                  <Row label="Blocked contacts" onClick={() => setPage('blocked')} />
                </Card>
              </div>

              <div>
                <Card>
                  <Row label="Log out" danger onClick={() => setConfirm('logout')} />
                  <Row label="Delete account" danger onClick={() => setConfirm('delete')} />
                </Card>
              </div>
            </motion.div>
          )}

          {page === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="space-y-4"
            >
              <div className="flex flex-col items-center rounded-3xl bg-white p-6 shadow-sm">
                <button
                  type="button"
                  onClick={() => file.current?.click()}
                  className="relative"
                  aria-label="Change photo"
                >
                  <Avatar
                    contact={{ id: 'me', name: draft.name, photo: s.photo, hue: ['#7B2CBF', '#6389EB'] }}
                    size={96}
                  />
                  <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-purple text-white shadow">
                    <Camera size={16} />
                  </span>
                </button>
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f || !f.type.startsWith('image/')) return
                    try {
                      const src = await fileToDataUrl(f)
                      setCropSrc(src)
                    } catch {
                      setToast('Could not open image')
                    }
                  }}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => file.current?.click()}
                    className="rounded-full bg-brand-purple/10 px-4 py-2 text-xs font-extrabold text-brand-purple"
                  >
                    Change photo
                  </button>
                  {s.photo ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await saveProfile({
                            name: draft.name.trim() || s.name,
                            username: draft.username.trim() || s.username,
                            bio: draft.bio || s.bio || '',
                            photo: null,
                          })
                          setToast('Profile photo removed')
                        } catch (e: any) {
                          setToast(e?.message || 'Could not remove photo')
                        }
                      }}
                      className="rounded-full bg-red-50 px-4 py-2 text-xs font-extrabold text-brand-red"
                    >
                      Delete photo
                    </button>
                  ) : null}
                </div>
              </div>

              <Card>
                <div className="space-y-3 px-5 py-4">
                  <label className="block text-xs font-extrabold text-gray-500">
                    Name
                    <input
                      value={draft.name}
                      maxLength={30}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="mt-1.5 h-12 w-full rounded-2xl bg-gray-100 px-4 font-bold outline-none focus:ring-4 focus:ring-brand-purple/20"
                    />
                  </label>
                  <label className="block text-xs font-extrabold text-gray-500">
                    Username
                    <input
                      value={draft.username}
                      maxLength={20}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          username: e.target.value.replace(/\s/g, '').toLowerCase(),
                        })
                      }
                      className="mt-1.5 h-12 w-full rounded-2xl bg-gray-100 px-4 font-bold outline-none focus:ring-4 focus:ring-brand-purple/20"
                    />
                  </label>
                  <p
                    className={`px-1 text-xs font-bold ${
                      usernameStatus === 'available' || usernameStatus === 'own'
                        ? 'text-[#5C8A5E]'
                        : usernameStatus === 'taken' || usernameStatus === 'invalid'
                          ? 'text-brand-red'
                          : 'text-gray-400'
                    }`}
                  >
                    {usernameStatus === 'checking' && 'Checking availability…'}
                    {usernameStatus === 'available' && 'Username is available'}
                    {usernameStatus === 'own' && 'This is your current username'}
                    {usernameStatus === 'taken' && 'Username is taken'}
                    {usernameStatus === 'invalid' && 'At least 3 characters, letters/numbers only'}
                    {usernameStatus === 'idle' && 'Usernames are unique'}
                  </p>
                  <label className="block text-xs font-extrabold text-gray-500">
                    Bio
                    <textarea
                      value={draft.bio || ''}
                      maxLength={140}
                      rows={3}
                      onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                      className="mt-1.5 w-full resize-none rounded-2xl bg-gray-100 px-4 py-3 font-semibold outline-none focus:ring-4 focus:ring-brand-purple/20"
                    />
                  </label>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-400">Phone</p>
                    <p className="mt-0.5 font-bold text-ink">{s.phone || 'Not set'}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-400">Email</p>
                    <p className="mt-0.5 font-bold text-ink">{(s as any).email || 'Not set'}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-brand-purple/10 to-orange-50 px-4 py-3 ring-1 ring-brand-purple/15">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-400">Subscription</p>
                      <p className="mt-0.5 font-black capitalize text-ink">{(s as any).subscriptionPlan || 'Free'}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-brand-purple shadow-sm ring-1 ring-brand-purple/20">
                      Current plan
                    </span>
                  </div>
                  <PrimaryButton
                    disabled={!canSaveProfile}
                    onClick={async () => {
                      setSavingProfile(true)
                      try {
                        await saveProfile({
                          name: draft.name.trim(),
                          username: draft.username.trim().toLowerCase(),
                          bio: draft.bio || '',
                        })
                        setToast('Profile updated')
                      } catch (e: any) {
                        setToast(e?.message || 'Could not update profile')
                      } finally {
                        setSavingProfile(false)
                      }
                    }}
                  >
                    {savingProfile ? 'Updating…' : 'Save changes'}
                  </PrimaryButton>
                </div>
              </Card>
            </motion.div>
          )}

          {page === 'privacy' && (
            <motion.div key="privacy" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <SectionLabel>Who can see</SectionLabel>
              <Card>
                <Row label="Last seen" {...sel('Last seen', 'lastSeen', WHO)} />
                <Row label="Profile photo" {...sel('Profile photo', 'profilePhoto', WHO)} />
                <Row label="About" {...sel('About', 'about', WHO)} />
                <Row
                  label="Status"
                  {...sel('Status', 'statusPrivacy', [
                    'My contacts',
                    'Contacts except…',
                    'Only share with…',
                  ])}
                />
              </Card>
              <Card>
                <Row
                  label="Read receipts"
                  hint="If off, you won't send or receive read receipts"
                  right={
                    <Toggle
                      on={!!s.readReceipts}
                      onChange={(v) => setSetting('readReceipts', v as never)}
                      label="Read receipts"
                    />
                  }
                />
              </Card>
            </motion.div>
          )}

          {page === 'notifications' && (
            <motion.div key="notif" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <Row
                  label="Message notifications"
                  right={
                    <Toggle
                      on={!!s.msgNotif}
                      onChange={(v) => setSetting('msgNotif', v as never)}
                      label="Messages"
                    />
                  }
                />
                <Row
                  label="Call notifications"
                  right={
                    <Toggle
                      on={!!s.callNotif}
                      onChange={(v) => setSetting('callNotif', v as never)}
                      label="Calls"
                    />
                  }
                />
                <Row
                  label="Status notifications"
                  right={
                    <Toggle
                      on={!!s.groupNotif}
                      onChange={(v) => setSetting('groupNotif', v as never)}
                      label="Status"
                    />
                  }
                />
              </Card>
            </motion.div>
          )}

          {page === 'chats' && (
            <motion.div key="chats" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              <Card>
                <Row label="Font size" {...sel('Font size', 'fontSize', Object.keys(FONT_SIZES))} />
                <Row
                  label="Enter is send"
                  right={
                    <Toggle
                      on={!!s.enterIsSend}
                      onChange={(v) => setSetting('enterIsSend', v as never)}
                      label="Enter send"
                    />
                  }
                />
                <Row
                  label="Typing indicator"
                  right={
                    <Toggle
                      on={!!s.typingIndicator}
                      onChange={(v) => setSetting('typingIndicator', v as never)}
                      label="Typing"
                    />
                  }
                />
              </Card>

              <Card>
                <Row
                  label="Liquid glass"
                  hint="Reflective blur on panels"
                  right={
                    <Toggle
                      on={!!s.liquidGlass}
                      onChange={(v) => setSetting('liquidGlass', v as never)}
                      label="Liquid glass"
                    />
                  }
                />
                <Row
                  label="Dark mode"
                  hint="Switch interface brightness"
                  right={
                    <Toggle
                      on={(s.colorMode || 'light') === 'dark'}
                      onChange={(v) => setSetting('colorMode', (v ? 'dark' : 'light') as never)}
                      label="Dark mode"
                    />
                  }
                />
              </Card>

              <div>
                <SectionLabel>Brand color</SectionLabel>
                <div className="overflow-hidden rounded-3xl bg-white p-3 shadow-sm">
                  <div className="grid grid-cols-4 gap-2">
                    {Object.values(THEMES).map((t) => {
                      const active = (s.theme || 'purple') === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSetting('theme', t.id as never)
                            void api.updateMe({ theme: t.id })
                          }}
                          className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-3 transition ${
                            active
                              ? 'bg-brand-purple/10 ring-2 ring-brand-purple/40'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <span
                            className="h-11 w-11 rounded-full"
                            style={{
                              background: `linear-gradient(145deg, ${t.primary}, ${t.accent})`,
                              boxShadow: active
                                ? `0 8px 18px -4px ${t.primary}aa`
                                : `0 4px 10px -4px ${t.primary}66`,
                            }}
                          />
                          <span className="text-[11px] font-extrabold text-ink">{t.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-3 px-1 text-center text-[11px] font-semibold text-gray-400">
                    Buttons, rings, and accents follow this color. Logo stays fixed.
                  </p>
                </div>
              </div>

              <div>
                <SectionLabel>Chat bubble</SectionLabel>
                <div className="overflow-hidden rounded-3xl bg-white p-3 shadow-sm">
                  <div className="grid grid-cols-4 gap-2">
                    {CHAT_ACCENTS.map((a) => {
                      const active = (s.chatAccent || 'purple') === a.id
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSetting('chatAccent', a.id as never)}
                          className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-3 transition ${
                            active
                              ? 'bg-brand-purple/10 ring-2 ring-brand-purple/40'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <span
                            className="flex h-11 w-11 items-center justify-center rounded-2xl"
                            style={{ background: a.color }}
                          >
                            <span className="h-2.5 w-6 rounded-full bg-white/90" />
                          </span>
                          <span className="text-[11px] font-extrabold text-ink">{a.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div>
                <SectionLabel>Wallpaper</SectionLabel>
                <div className="overflow-hidden rounded-3xl bg-white p-3 shadow-sm">
                  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Solids</p>
                  <div className="grid grid-cols-4 gap-2">
                    {WALLPAPER_SOLIDS.map((w) => {
                      const active = (s.wallpaper || 'Cloud') === w.id
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setSetting('wallpaper', w.id as never)}
                          className={`overflow-hidden rounded-2xl ring-2 transition ${
                            active ? 'ring-brand-purple' : 'ring-transparent'
                          }`}
                        >
                          <div className="h-12 w-full" style={{ background: w.css }} />
                          <span className="block truncate bg-white px-1 py-1 text-center text-[10px] font-extrabold text-ink">
                            {w.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="mb-2 mt-3 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Gradients</p>
                  <div className="grid grid-cols-4 gap-2">
                    {WALLPAPER_GRADIENTS.map((w) => {
                      const active = (s.wallpaper || 'Cloud') === w.id
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setSetting('wallpaper', w.id as never)}
                          className={`overflow-hidden rounded-2xl ring-2 transition ${
                            active ? 'ring-brand-purple' : 'ring-transparent'
                          }`}
                        >
                          <div className="h-12 w-full" style={{ background: w.css }} />
                          <span className="block truncate bg-white px-1 py-1 text-center text-[10px] font-extrabold text-ink">
                            {w.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSetting('theme', 'purple' as never)
                  setSetting('chatAccent', 'purple' as never)
                  setSetting('wallpaper', 'Cloud' as never)
                  setSetting('liquidGlass', false as never)
                  setSetting('colorMode', 'light' as never)
                  setToast('Defaults restored')
                  void api.updateMe({ theme: 'purple' })
                }}
                className="w-full rounded-2xl bg-white py-3.5 text-sm font-extrabold text-brand-purple shadow-sm ring-1 ring-gray-100"
              >
                Restore defaults
              </button>
            </motion.div>
          )}

          {page === 'storage' && (
            <motion.div key="storage" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <Row label="Auto-download media" {...sel('Auto-download', 'autoDownload', ['Wi-Fi', 'Wi-Fi and cellular', 'Never'])} />
                <Row label="Network usage" value="Normal" />
              </Card>
            </motion.div>
          )}

          {page === 'security' && (
            <motion.div key="sec" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <Row
                  label="App lock"
                  hint="Require login when opening the app"
                  right={
                    <Toggle
                      on={!!s.appLock}
                      onChange={(v) => setSetting('appLock', v as never)}
                      label="App lock"
                    />
                  }
                />
              </Card>
            </motion.div>
          )}

          {page === 'language' && (
            <motion.div key="lang" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <Row label="App language" {...sel('Language', 'language', ['English', 'Swahili', 'French'])} />
              </Card>
            </motion.div>
          )}

          {page === 'blocked' && (
            <motion.div key="blocked" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                {(contacts || []).filter((c: any) => c.blocked).length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm font-bold text-gray-400">No blocked contacts</p>
                ) : (
                  (contacts || [])
                    .filter((c: any) => c.blocked)
                    .map((c: any) => <Row key={c.id} label={c.name} value={c.username ? `@${c.username}` : undefined} />)
                )}
              </Card>
            </motion.div>
          )}

          {page === 'help' && (
            <motion.div key="help" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <Row label="FAQ" hint="Coming soon" />
                <Row
                  label="Contact support"
                  hint="Open a support ticket"
                  onClick={() => onSupport?.()}
                />
                <Row label="App version" value="1.0.0" />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker?.title}>
        {picker && (
          <OptionList
            options={picker.options}
            value={
              picker.key === 'theme'
                ? themeLabelFromId(String(s.theme || 'purple'))
                : String(s[picker.key])
            }
            onPick={(o) => {
              if (picker.key === 'theme') {
                setSetting('theme', themeIdFromLabel(o) as never)
              } else {
                setSetting(picker.key, o as never)
              }
              setPicker(null)
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={!!confirm}
        onClose={() => {
          setConfirm(null)
          setDeleteStep('password')
          setDeletePassword('')
          setDeletePhrase('')
        }}
        title={confirm === 'logout' ? 'Log out?' : 'Delete account'}
      >
        {confirm === 'logout' ? (
          <>
            <p className="mb-4 text-sm font-semibold text-gray-500">
              You can sign back in anytime with your number.
            </p>
            <PrimaryButton
              danger
              onClick={() => {
                onLogout()
                setConfirm(null)
              }}
            >
              Log out
            </PrimaryButton>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm font-semibold text-gray-500">
              This deactivates your account. You will be signed out on all devices.
            </p>
            {deleteStep === 'password' ? (
              <>
                <label className="mb-1 block text-xs font-extrabold text-gray-500">Password</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your password"
                  className="mb-4 h-12 w-full rounded-2xl bg-gray-100 px-4 font-semibold outline-none focus:ring-4 focus:ring-brand-red/15"
                  autoFocus
                />
                <PrimaryButton
                  danger
                  disabled={!deletePassword || deletingAccount}
                  onClick={async () => {
                    if (!deletePassword) return
                    setDeletingAccount(true)
                    try {
                      // Validate password by attempting deactivate path pre-check via login-style verify
                      // Step 1 only advances UI after local non-empty; actual delete on phrase step
                      setDeleteStep('phrase')
                    } finally {
                      setDeletingAccount(false)
                    }
                  }}
                >
                  Continue
                </PrimaryButton>
              </>
            ) : (
              <>
                <p className="mb-2 text-sm font-semibold text-gray-500">
                  Type <span className="font-black text-ink">delete my account permanently</span> to confirm.
                </p>
                <input
                  value={deletePhrase}
                  onChange={(e) => setDeletePhrase(e.target.value)}
                  placeholder="delete my account permanently"
                  className="mb-4 h-12 w-full rounded-2xl bg-gray-100 px-4 font-semibold outline-none focus:ring-4 focus:ring-brand-red/15"
                  autoFocus
                />
                <PrimaryButton
                  danger
                  disabled={
                    deletingAccount ||
                    deletePhrase.trim().toLowerCase() !== 'delete my account permanently'
                  }
                  onClick={async () => {
                    setDeletingAccount(true)
                    try {
                      await api.deactivateAccount(deletePassword)
                      setConfirm(null)
                      setToast('Account deleted')
                      onLogout()
                    } catch (e: any) {
                      setToast(e?.message || 'Could not delete account')
                      if (String(e?.message || '').toLowerCase().includes('password')) {
                        setDeleteStep('password')
                        setDeletePhrase('')
                      }
                    } finally {
                      setDeletingAccount(false)
                    }
                  }}
                >
                  {deletingAccount ? 'Deleting…' : 'Delete permanently'}
                </PrimaryButton>
              </>
            )}
          </>
        )}
      </Sheet>

      <Toast msg={toast} clear={() => setToast(null)} />

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          title="Adjust profile photo"
          onCancel={() => setCropSrc(null)}
          onDone={async (dataUrl) => {
            setCropSrc(null)
            try {
              await saveProfile({
                name: s.name,
                username: s.username,
                bio: s.bio,
                photo: dataUrl,
              })
              setToast('Photo updated')
            } catch {
              setToast('Could not update photo')
            }
          }}
        />
      )}
    </div>
  )
}
