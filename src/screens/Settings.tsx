import { useRef, useState, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Lock, Bell, MessageSquare, Database, Shield, Globe, HelpCircle, LogOut,
  Trash2, ChevronRight, Camera, Ban, Smartphone, Info, Palette, ArrowLeft,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { Select } from '../components/Select'
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
import { LogoIcon, Wordmark } from '../components/Logo'
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
  | 'premium'
  | 'mpesa'
  | 'sponsor'
  | 'account'

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

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`divide-y divide-gray-100 overflow-hidden rounded-3xl bg-white shadow-sm ${className}`}>
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
  const { settings: s, setSetting, saveProfile, contacts, me , syncSubscription } = useStore()
  useEffect(() => {
    void syncSubscription?.()
  }, [syncSubscription])
  const [page, setPage] = useState<Page>(() => {
    try {
      const p = sessionStorage.getItem('sc_settings_page') as Page | null
      if (p) {
        sessionStorage.removeItem('sc_settings_page')
        return p
      }
    } catch { /* */ }
    return 'home'
  })
  const [picker, setPicker] = useState<{ title: string; options: string[]; key: keyof S } | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [confirm, setConfirm] = useState<'logout' | 'delete' | null>(null)
  const [deleteStep, setDeleteStep] = useState<'password' | 'phrase'>('password')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePhrase, setDeletePhrase] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [chatPinStep, setChatPinStep] = useState<'idle' | 'warn' | 'set' | 'confirm' | 'change' | 'disable' | 'forgot' | 'forgot_confirm' | 'forgot_list'>('idle')
  const [chatPinDraft, setChatPinDraft] = useState('')
  const [chatPinConfirm, setChatPinConfirm] = useState('')
  const [chatPinError, setChatPinError] = useState('')
  const [forgotPhrase, setForgotPhrase] = useState('')
  const [lockedChatPreview, setLockedChatPreview] = useState<{ id: string; name: string }[]>([])
  const [deletingLocks, setDeletingLocks] = useState(false)
  const [hasChatPin, setHasChatPin] = useState(() => {
    try { return !!localStorage.getItem('sc_chat_lock_pin') } catch { return false }
  })

  const [savingProfile, setSavingProfile] = useState(false)
  const [busyUpdating, setBusyUpdating] = useState(false)
  const [mpesaPlan, setMpesaPlan] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [mpesaPhone, setMpesaPhone] = useState(() => String(me?.phone || s.phone || ''))
  const [mpesaConfirmOpen, setMpesaConfirmOpen] = useState(false)
  const [mpesaPaying, setMpesaPaying] = useState(false)
  const [mpesaPaid, setMpesaPaid] = useState(false)
  const [sponsorQuery, setSponsorQuery] = useState('')
  const [sponsorResults, setSponsorResults] = useState<any[]>([])
  const [sponsorPick, setSponsorPick] = useState<any | null>(null)
  const [sponsorSearching, setSponsorSearching] = useState(false)
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
              ? 'Themes'
              : page === 'storage'
                ? 'Storage'
                : page === 'security'
                  ? 'Security'
                  : page === 'language'
                    ? 'Language'
                    : page === 'blocked'
                      ? 'Blocked'
                      : page === 'mpesa'
                        ? 'Subscription'
                        : page === 'sponsor'
                          ? 'Sponsor a friend'
                          : page === 'premium'
                            ? 'Premium'
                            : page === 'account'
                              ? 'Account'
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
    else if (page === 'sponsor') setPage('mpesa')
    else if (page === 'mpesa') setPage('premium')
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
                  contact={{
                    id: 'me',
                    name: s.name,
                    photo: s.photo,
                    hue: ['#7B2CBF', '#6389EB'],
                    premium: ((s as any).subscriptionPlan || me?.subscriptionPlan) === 'premium' && (s as any).verifiedBadge !== false,
                  }}
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
                  <Row label="Themes" hint="Wallpaper, colors, liquid glass" onClick={() => setPage('chats')} />
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
                <SectionLabel>Premium</SectionLabel>
                <Card>
                  <Row label="Premium features" hint="Receipts, live typing, ads, badge" onClick={() => setPage('premium')} />
                  <Row
                    label="Membership"
                    value={((s as any).subscriptionPlan || me?.subscriptionPlan || 'pro') === 'premium' ? 'Premium' : 'Pro'}
                    onClick={() => setPage('account')}
                  />
                </Card>
              </div>

              <div>
                <Card>
                  <Row label="Log out" danger onClick={() => setConfirm('logout')} />
                  <Row label="Deactivate my account" danger onClick={() => setConfirm('delete')} />
                </Card>
              </div>

              {/* Credits footer */}
              <div className="px-2 pb-5 pt-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 max-w-[58%]">
                    <p className="text-left text-[12px] font-semibold leading-relaxed text-gray-500">
                      Safechat is made and maintained by{' '}
                      <a
                        href={
                          (import.meta as any).env?.VITE_PIXELDROID_URL ||
                          'https://pixeldroid.com'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-extrabold text-brand-purple"
                      >
                        pixeldroid
                      </a>
                    </p>
                    <p className="mt-2 text-left text-[11px] font-extrabold text-brand-purple">
                      Version 2.0.0
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-center gap-1.5">
                      <LogoIcon size={22} animate={false} />
                      <Wordmark className="text-[15px] leading-none" />
                    </div>
                    <div className="h-px w-full bg-gray-200 dark:bg-white/10" />
                    <a
                      href={
                        (import.meta as any).env?.VITE_PIXELDROID_URL ||
                        'https://pixeldroid.com'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src="/pixeldroid-light.png"
                        alt="PixelDroid"
                        className="h-7 w-auto object-contain dark:hidden"
                      />
                      <img
                        src="/pixeldroid-dark.png"
                        alt="PixelDroid"
                        className="hidden h-7 w-auto object-contain dark:block"
                      />
                    </a>
                  </div>
                </div>
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
                  label="Status likes"
                  hint="When someone likes your status"
                  right={
                    <Toggle
                      on={(s as any).statusLikeNotif !== false}
                      onChange={(v) => setSetting('statusLikeNotif' as any, v as never)}
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
                                <Row
                  label="Time format"
                  hint="Used across chats, calls, and statuses"
                  right={
                    <Select
                      size="sm"
                      className="min-w-[7.5rem]"
                      value={(s as any).timeFormat === '12h' ? '12h' : '24h'}
                      onChange={(v) => setSetting('timeFormat' as any, v as never)}
                      options={[
                        { value: '24h', label: '24-hour' },
                        { value: '12h', label: '12-hour' },
                      ]}
                    />
                  }
                />
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
                  try { setSetting('fontSize' as any, 'medium' as never) } catch { /* */ }
                  try { setSetting('bubbleStyle' as any, 'default' as never) } catch { /* */ }
                  // Re-apply document theme tokens so selectors + CSS snap back immediately
                  try {
                    document.documentElement.setAttribute('data-theme', 'purple')
                    document.documentElement.setAttribute('data-mode', 'light')
                    document.documentElement.classList.remove('dark')
                  } catch { /* */ }
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
            <motion.div key="sec" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 px-1">
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

              <Card>
                <div className="space-y-3 px-3 py-3">
                  <div>
                    <p className="text-sm font-extrabold text-ink">Chat lock PIN</p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-gray-400">
                      Used to lock individual chats from the chat menu. Keep this PIN safe.
                    </p>
                  </div>
                  {!hasChatPin ? (
                    <button
                      type="button"
                      className="w-full rounded-full bg-brand-purple py-3 text-sm font-extrabold text-white"
                      onClick={() => {
                        setChatPinError('')
                        setChatPinDraft('')
                        setChatPinConfirm('')
                        setChatPinStep('warn')
                      }}
                    >
                      Set chat lock PIN
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className="w-full rounded-full bg-brand-purple py-3 text-sm font-extrabold text-white"
                        onClick={() => {
                          setChatPinError('')
                          setChatPinDraft('')
                          setChatPinConfirm('')
                          setChatPinStep('change')
                        }}
                      >
                        Change PIN
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-full bg-gray-100 py-3 text-sm font-extrabold text-ink"
                        onClick={() => {
                          setChatPinError('')
                          setChatPinDraft('')
                          setChatPinStep('disable')
                        }}
                      >
                        Disable chat lock for all chats
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-full bg-brand-red/10 py-3 text-sm font-extrabold text-brand-red"
                        onClick={() => {
                          setForgotPhrase('')
                          setChatPinError('')
                          setChatPinStep('forgot')
                        }}
                      >
                        Forgot PIN
                      </button>
                    </div>
                  )}
                </div>
              </Card>

              {/* Modal: warn before set */}
              {chatPinStep === 'warn' && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setChatPinStep('idle')}>
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <p className="text-lg font-black text-ink">Before you set a PIN</p>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-500">
                      If you lose this PIN, locked chats stay locked. The only recovery is to permanently delete every locked chat on this device.
                    </p>
                    <button
                      type="button"
                      className="mt-5 w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white"
                      onClick={() => setChatPinStep('set')}
                    >
                      I understand
                    </button>
                    <button
                      type="button"
                      className="mt-2 w-full rounded-full py-3 text-sm font-extrabold text-gray-500"
                      onClick={() => setChatPinStep('idle')}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {chatPinStep === 'set' && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setChatPinStep('idle')}>
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <p className="text-lg font-black text-ink">Choose a PIN</p>
                    <p className="mt-1 text-xs font-semibold text-gray-400">4 to 8 digits</p>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={chatPinDraft}
                      onChange={(e) => {
                        setChatPinDraft(e.target.value.replace(/\D/g, '').slice(0, 8))
                        setChatPinError('')
                      }}
                      className="mt-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-brand-purple"
                      placeholder="••••"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={chatPinDraft.length < 4}
                      className="mt-4 w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
                      onClick={() => {
                        setChatPinConfirm('')
                        setChatPinStep('confirm')
                      }}
                    >
                      Continue
                    </button>
                    <button type="button" className="mt-2 w-full py-3 text-sm font-extrabold text-gray-500" onClick={() => setChatPinStep('idle')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {chatPinStep === 'confirm' && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center">
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
                    <p className="text-lg font-black text-ink">Confirm PIN</p>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={chatPinConfirm}
                      onChange={(e) => {
                        setChatPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))
                        setChatPinError('')
                      }}
                      className="mt-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-brand-purple"
                      placeholder="••••"
                      autoFocus
                    />
                    {chatPinError ? <p className="mt-2 text-center text-xs font-bold text-brand-red">{chatPinError}</p> : null}
                    <button
                      type="button"
                      disabled={chatPinConfirm.length < 4}
                      className="mt-4 w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
                      onClick={() => {
                        if (chatPinConfirm !== chatPinDraft) {
                          setChatPinError('PINs do not match')
                          return
                        }
                        try {
                          localStorage.setItem('sc_chat_lock_pin', chatPinDraft)
                          setHasChatPin(true)
                          setChatPinStep('idle')
                          setChatPinDraft('')
                          setChatPinConfirm('')
                          setToast('Chat lock PIN saved')
                        } catch {
                          setChatPinError('Could not save PIN')
                        }
                      }}
                    >
                      Save PIN
                    </button>
                    <button type="button" className="mt-2 w-full py-3 text-sm font-extrabold text-gray-500" onClick={() => setChatPinStep('set')}>
                      Back
                    </button>
                  </div>
                </div>
              )}

              {chatPinStep === 'change' && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setChatPinStep('idle')}>
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <p className="text-lg font-black text-ink">Change PIN</p>
                    <p className="mt-1 text-xs font-semibold text-gray-400">Current PIN, then new PIN</p>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={chatPinDraft}
                      onChange={(e) => {
                        setChatPinDraft(e.target.value.replace(/\D/g, '').slice(0, 8))
                        setChatPinError('')
                      }}
                      className="mt-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-brand-purple"
                      placeholder="Current PIN"
                      autoFocus
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={chatPinConfirm}
                      onChange={(e) => {
                        setChatPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))
                        setChatPinError('')
                      }}
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-brand-purple"
                      placeholder="New PIN"
                    />
                    {chatPinError ? <p className="mt-2 text-center text-xs font-bold text-brand-red">{chatPinError}</p> : null}
                    <button
                      type="button"
                      className="mt-4 w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white"
                      onClick={() => {
                        try {
                          const cur = localStorage.getItem('sc_chat_lock_pin') || ''
                          if (chatPinDraft !== cur) {
                            setChatPinError('Current PIN is wrong')
                            return
                          }
                          if (chatPinConfirm.length < 4) {
                            setChatPinError('New PIN must be at least 4 digits')
                            return
                          }
                          localStorage.setItem('sc_chat_lock_pin', chatPinConfirm)
                          setChatPinStep('idle')
                          setChatPinDraft('')
                          setChatPinConfirm('')
                          setToast('PIN updated')
                        } catch {
                          setChatPinError('Could not update PIN')
                        }
                      }}
                    >
                      Save new PIN
                    </button>
                    <button type="button" className="mt-2 w-full py-3 text-sm font-extrabold text-gray-500" onClick={() => setChatPinStep('idle')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {chatPinStep === 'disable' && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setChatPinStep('idle')}>
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <p className="text-lg font-black text-ink">Disable chat lock</p>
                    <p className="mt-1 text-xs font-semibold text-gray-400">Enter PIN to unlock all chats and remove the lock PIN</p>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={chatPinDraft}
                      onChange={(e) => {
                        setChatPinDraft(e.target.value.replace(/\D/g, '').slice(0, 8))
                        setChatPinError('')
                      }}
                      className="mt-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-brand-purple"
                      placeholder="PIN"
                      autoFocus
                    />
                    {chatPinError ? <p className="mt-2 text-center text-xs font-bold text-brand-red">{chatPinError}</p> : null}
                    <button
                      type="button"
                      className="mt-4 w-full rounded-full bg-brand-red py-3.5 text-sm font-extrabold text-white"
                      onClick={() => {
                        try {
                          const cur = localStorage.getItem('sc_chat_lock_pin') || ''
                          if (chatPinDraft !== cur) {
                            setChatPinError('Wrong PIN')
                            return
                          }
                          localStorage.removeItem('sc_chat_lock_pin')
                          localStorage.removeItem('sc_chat_locks')
                          localStorage.removeItem('sc_chats_locked')
                          setHasChatPin(false)
                          setChatPinStep('idle')
                          setChatPinDraft('')
                          setToast('Chat lock disabled')
                        } catch {
                          setChatPinError('Could not disable')
                        }
                      }}
                    >
                      Disable chat lock
                    </button>
                    <button type="button" className="mt-2 w-full py-3 text-sm font-extrabold text-gray-500" onClick={() => setChatPinStep('idle')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {chatPinStep === 'forgot' && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setChatPinStep('idle')}>
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <p className="text-lg font-black text-brand-red">Forgot PIN</p>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-500">
                      Continuing permanently deletes all locked chats from this device and clears your chat lock PIN. This cannot be undone.
                    </p>
                    <button
                      type="button"
                      className="mt-5 w-full rounded-full bg-brand-red py-3.5 text-sm font-extrabold text-white"
                      onClick={() => {
                        setForgotPhrase('')
                        setChatPinStep('forgot_confirm')
                      }}
                    >
                      I understand
                    </button>
                    <button type="button" className="mt-2 w-full py-3 text-sm font-extrabold text-gray-500" onClick={() => setChatPinStep('idle')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {chatPinStep === 'forgot_confirm' && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center">
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
                    <p className="text-lg font-black text-ink">Confirm deletion</p>
                    <p className="mt-2 text-xs font-semibold text-gray-500">
                      Type <span className="font-black text-ink">delete all my locked chats</span> exactly
                    </p>
                    <input
                      type="text"
                      value={forgotPhrase}
                      onChange={(e) => {
                        setForgotPhrase(e.target.value)
                        setChatPinError('')
                      }}
                      className="mt-3 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold outline-none focus:border-brand-purple"
                      placeholder="delete all my locked chats"
                      autoFocus
                    />
                    {chatPinError ? <p className="mt-2 text-xs font-bold text-brand-red">{chatPinError}</p> : null}
                    <button
                      type="button"
                      className="mt-4 w-full rounded-full bg-brand-red py-3.5 text-sm font-extrabold text-white"
                      onClick={() => {
                        if (forgotPhrase.trim().toLowerCase() !== 'delete all my locked chats') {
                          setChatPinError('Phrase does not match')
                          return
                        }
                        // Build list of locked chats for final screen
                        let locks: Record<string, unknown> = {}
                        try {
                          locks = JSON.parse(localStorage.getItem('sc_chat_locks') || '{}')
                        } catch { /* */ }
                        const ids = Object.keys(locks).filter((k) => locks[k])
                        const chats = (typeof window !== 'undefined' && (window as any).__sc_chats_snap) || []
                        const preview = ids.map((id) => {
                          const row = (chats as any[]).find(
                            (c: any) => String(c.contactId) === id || String(c.conversationId) === id,
                          )
                          const name = (row?.name || row?.savedName || '').trim()
                          return { id, name: name || `Chat ${id.slice(-6)}` }
                        })
                        setLockedChatPreview(preview)
                        setChatPinStep('forgot_list')
                      }}
                    >
                      Continue
                    </button>
                    <button type="button" className="mt-2 w-full py-3 text-sm font-extrabold text-gray-500" onClick={() => setChatPinStep('idle')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {chatPinStep === 'forgot_list' && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center">
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
                    <p className="text-lg font-black text-ink">You are about to delete the following chats</p>
                    <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-2xl bg-gray-50 p-3">
                      {lockedChatPreview.length === 0 ? (
                        <li className="text-sm font-semibold text-gray-400">No locked chats found</li>
                      ) : (
                        lockedChatPreview.map((c) => (
                          <li key={c.id} className="truncate text-sm font-extrabold text-ink">
                            {c.name}
                          </li>
                        ))
                      )}
                    </ul>
                    <button
                      type="button"
                      disabled={deletingLocks}
                      className="mt-4 w-full rounded-full bg-brand-red py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
                      onClick={async () => {
                        setDeletingLocks(true)
                        const ids = lockedChatPreview.map((c) => c.id)
                        const n = ids.length
                        try {
                          window.dispatchEvent(new CustomEvent('sc:delete-locked-chats', { detail: { ids } }))
                          // Best-effort server delete per conversation if API exists
                          for (const id of ids) {
                            try {
                              await (api as any).deleteConversation(id)
                            } catch { /* */ }
                          }
                          localStorage.removeItem('sc_chat_lock_pin')
                          localStorage.removeItem('sc_chat_locks')
                          localStorage.removeItem('sc_chats_locked')
                          setHasChatPin(false)
                          setChatPinStep('idle')
                          setForgotPhrase('')
                          setLockedChatPreview([])
                          setToast(`${n} chat${n === 1 ? '' : 's'} deleted successfully`)
                        } catch {
                          setToast('Could not finish deleting')
                        } finally {
                          setDeletingLocks(false)
                        }
                      }}
                    >
                      {deletingLocks ? 'Deleting…' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      className="mt-2 w-full py-3 text-sm font-extrabold text-gray-500"
                      onClick={() => setChatPinStep('idle')}
                    >
                      Exit
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {page === 'language' && (
            <motion.div key="lang" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <Row label="App language" {...sel('Language', 'language', ['English', 'Swahili', 'French'])} />
              </Card>
            </motion.div>
          )}

          
          {page === 'premium' && (
            <motion.div key="premium" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="rounded-3xl bg-gradient-to-br from-brand-purple/15 to-brand-orange/10 p-4">
                <p className="text-sm font-extrabold text-ink">
                  {((s as any).subscriptionPlan || me?.subscriptionPlan) === 'premium' ? 'Premium member' : 'Pro · Free plan'}
                </p>
                {((s as any).subscriptionPlan) === 'premium' && (s as any).premiumExpiresAt ? (
                  <p className="mt-1 text-xs font-bold text-brand-purple/80">
                    {(() => {
                      const exp = Date.parse((s as any).premiumExpiresAt)
                      if (!exp || Number.isNaN(exp)) return 'Active'
                      const ms = exp - Date.now()
                      if (ms <= 0) return 'Expired - renew to keep Premium'
                      const h = Math.floor(ms / 3600000)
                      const d = Math.floor(h / 24)
                      const rh = h % 24
                      if (d > 0) return `${d}d ${rh}h remaining`
                      const m = Math.floor((ms % 3600000) / 60000)
                      return `${h}h ${m}m remaining`
                    })()}
                  </p>
                ) : ((s as any).subscriptionPlan) !== 'premium' ? (
                  <p className="mt-1 text-xs font-bold text-gray-500">Upgrade via M-Pesa to unlock Premium</p>
                ) : null}
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  Unlock live presence and stronger messaging tools.
                </p>
              </div>
              <Card>
                <Row
                  label="Live typing"
                  hint="Premium: stream characters live. Pro only sees typing…"
                  right={
                    <Toggle
                      on={(s as any).subscriptionPlan === 'premium' && (s as any).liveTyping !== false}
                      onChange={(v) => {
                        if ((s as any).subscriptionPlan !== 'premium') {
                          setToast('Live typing is a Premium feature')
                          return
                        }
                        setSetting('liveTyping' as any, v as never) // instant UI
                        void api.updatePremiumSettings({ live_typing: v }).catch(() => {
                          setSetting('liveTyping' as any, !v as never)
                          setToast('Could not save setting')
                        })
                      }}
                      label="Live typing"
                    />
                  }
                />
                <Row
                  label="Hide my live typing"
                  hint="Peers won't see your draft as you type"
                  right={
                    <Toggle
                      on={!!(s as any).hideLiveTyping && ((s as any).subscriptionPlan === 'premium')}
                      onChange={(v) => {
                        if ((s as any).subscriptionPlan !== 'premium') {
                          setToast('Premium feature')
                          return
                        }
                        setSetting('hideLiveTyping' as any, v as never)
                        void api.updatePreferences({ hide_live_typing: v }).catch(() => {})
                      }}
                      label="Hide live typing"
                    />
                  }
                />
              </Card>
              <Card className={((s as any).subscriptionPlan || me?.subscriptionPlan) !== 'premium' ? 'pointer-events-none opacity-45' : ''}>
                <Row
                  label="Always-on read receipts"
                  hint="Always see when your messages are read, even if they turned receipts off"
                  right={
                    <Toggle
                      on={!!(s as any).forceReadReceipts}
                      onChange={(v) => {
                        if (((s as any).subscriptionPlan || me?.subscriptionPlan) !== 'premium') {
                          setToast('This is a premium feature')
                          return
                        }
                        setSetting('forceReadReceipts' as any, v as never)
                        void api.updatePremiumSettings({ force_read_receipts: v }).catch(() => {
                          setSetting('forceReadReceipts' as any, !v as never)
                          setToast('Could not save setting')
                        })
                      }}
                      label="Always-on read receipts"
                    />
                  }
                />
                <Row
                  label="Verification checkmark"
                  hint="Blue check on your photo in chats and profile"
                  right={
                    <Toggle
                      on={(s as any).verifiedBadge !== false}
                      onChange={(v) => {
                        if (((s as any).subscriptionPlan || me?.subscriptionPlan) !== 'premium') {
                          setToast('This is a premium feature')
                          return
                        }
                        setSetting('verifiedBadge' as any, v as never)
                        void api.updatePremiumSettings({ verified_badge: v }).catch(() => {
                          setSetting('verifiedBadge' as any, !v as never)
                          setToast('Could not save setting')
                        })
                      }}
                      label="Verification checkmark"
                    />
                  }
                />
                <Row
                  label="Status ads"
                  hint="Boost a status to more people (business reach)"
                  right={
                    <Toggle
                      on={!!(s as any).statusAdsEnabled}
                      onChange={(v) => {
                        if (((s as any).subscriptionPlan || me?.subscriptionPlan) !== 'premium') {
                          setToast('This is a premium feature')
                          return
                        }
                        setSetting('statusAdsEnabled' as any, v as never)
                        void api.updatePremiumSettings({ status_ads_enabled: v })
                      }}
                      label="Status ads"
                    />
                  }
                />
                <Row
                  label="Busy status"
                  hint="Show busy instead of Online - optional short note"
                  right={
                    <Toggle
                      on={!!(s as any).busyEnabled}
                      onChange={(v) => {
                        if (((s as any).subscriptionPlan || me?.subscriptionPlan) !== 'premium') {
                          setToast('This is a premium feature')
                          return
                        }
                        setSetting('busyEnabled' as any, v as never)
                        // Turning off publishes immediately so peers stop seeing the custom message
                        if (!v) {
                          void api
                            .updatePreferences({
                              busy_enabled: false,
                              busy_message: '',
                              busy_until: null as any,
                            })
                            .then(() => setToast('Busy status turned off'))
                            .catch(() => setToast('Could not update busy status'))
                        }
                      }}
                      label="Busy status"
                    />
                  }
                />
                {!!(s as any).busyEnabled && (
                  <div className="space-y-3 px-1 pb-3">
                    <label className="block text-[11px] font-extrabold text-gray-400">Who sees busy</label>
                    <Select
                      value={(s as any).busyScope || 'everyone'}
                      onChange={(v) => setSetting('busyScope' as any, v as never)}
                      options={[
                        { value: 'everyone', label: 'Everyone' },
                        { value: 'contacts', label: 'My contacts' },
                      ]}
                    />
                    <label className="block text-[11px] font-extrabold text-gray-400">Custom message</label>
                    <input
                      value={(s as any).busyMessage || ''}
                      maxLength={28}
                      onChange={(e) => setSetting('busyMessage' as any, e.target.value.slice(0, 28) as never)}
                      placeholder="e.g. in a meeting"
                      className="w-full rounded-2xl bg-gray-50 px-3 py-2.5 text-sm font-bold outline-none ring-1 ring-black/5 focus:ring-brand-purple/30"
                    />
                    <label className="block text-[11px] font-extrabold text-gray-400">Duration (max 1 hour)</label>
                    <div className="flex gap-2">
                      {[
                        { m: 15, label: '15 min' },
                        { m: 30, label: '30 min' },
                        { m: 60, label: '1 hour' },
                      ].map((d) => {
                        const active = Number((s as any).busyDurationMin || 30) === d.m
                        return (
                          <button
                            key={d.m}
                            type="button"
                            onClick={() => setSetting('busyDurationMin' as any, d.m as never)}
                            className={`flex-1 rounded-2xl py-2.5 text-xs font-extrabold transition ${
                              active
                                ? 'bg-brand-purple text-white shadow-md'
                                : 'bg-gray-50 text-ink ring-1 ring-black/5'
                            }`}
                          >
                            {d.label}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={busyUpdating}
                      className="w-full rounded-full bg-gradient-to-r from-brand-purple to-brand-orange py-3 text-sm font-extrabold text-white shadow-md active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
                      onClick={() => {
                        if (busyUpdating) return
                        const mins = Number((s as any).busyDurationMin || 30)
                        const until = new Date(Date.now() + mins * 60 * 1000).toISOString()
                        setSetting('busyUntil' as any, until as never)
                        setSetting('busyEnabled' as any, true as never)
                        setBusyUpdating(true)
                        void api
                          .updatePreferences({
                            busy_enabled: true,
                            busy_message: (s as any).busyMessage || '',
                            busy_until: until,
                            busy_scope: (s as any).busyScope || 'everyone',
                          })
                          .then(() => setToast('Busy status updated, contacts see your message'))
                          .catch(() => setToast('Could not update busy status'))
                          .finally(() => setBusyUpdating(false))
                      }}
                    >
                      {busyUpdating ? 'Updating…' : 'Update busy status'}
                    </button>
                    <p className="text-[11px] font-semibold text-gray-400">
                      Overrides Online for contacts. Typing still shows. Expires after the duration.
                    </p>
                  </div>
                )}
              </Card>
              {((s as any).subscriptionPlan || me?.subscriptionPlan) !== 'premium' && (
                <button
                  type="button"
                  className="w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white shadow-md"
                  onClick={() => setPage('mpesa' as any)}
                >
                  Upgrade to Premium
                </button>
              )}
            </motion.div>
          )}

          
          {page === 'mpesa' && (
            <motion.div key="mpesa" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-purple via-[#5b21b6] to-brand-orange p-5 text-white shadow-lg">
                <p className="text-xs font-extrabold uppercase tracking-widest text-white/70">Subscription</p>
                <h2 className="mt-1 text-2xl font-black">SafeChat Premium</h2>
                <p className="mt-1 text-sm font-semibold text-white/85">
                  Busy status, force receipts, badge, status ads, and more.
                </p>
              </div>

              <div className="grid gap-2">
                {(
                  [
                    { id: 'daily' as const, label: 'Daily', price: 99, hint: '24 hours of Premium' },
                    { id: 'weekly' as const, label: 'Weekly', price: 499, hint: '7 days · best trial' },
                    { id: 'monthly' as const, label: 'Monthly', price: 2999, hint: '30 days · best value' },
                  ] as const
                ).map((plan) => {
                  const active = mpesaPlan === plan.id
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setMpesaPlan(plan.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left shadow-sm ring-2 transition ${
                        active
                          ? 'bg-brand-purple/10 ring-brand-purple'
                          : 'bg-white ring-gray-100'
                      }`}
                    >
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-black ${
                          active ? 'bg-brand-purple text-white' : 'bg-brand-purple/10 text-brand-purple'
                        }`}
                      >
                        {plan.label[0]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-extrabold text-ink">{plan.label}</span>
                        <span className="block text-[11px] font-semibold text-gray-400">{plan.hint}</span>
                      </span>
                      <span className="text-sm font-black text-ink">KES {plan.price}</span>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <button
                  type="button"
                  disabled={mpesaPaying || mpesaPaid}
                  className="w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white shadow-md active:scale-[0.99] disabled:opacity-70"
                  onClick={() => {
                    if (!mpesaPhone.trim()) {
                      setMpesaPhone(String(me?.phone || s.phone || ''))
                    }
                    setMpesaConfirmOpen(true)
                  }}
                >
                  {mpesaPaid
                    ? "You're a Premium user"
                    : mpesaPaying
                      ? 'Initiating payment…'
                      : 'Pay with M-Pesa'}
                </button>
                <p className="mt-2 text-center text-[11px] font-semibold text-gray-400">
                  Selected: <span className="font-extrabold text-ink capitalize">{mpesaPlan}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPage('sponsor')}
                className="flex w-full items-center gap-3 rounded-3xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-gray-100 active:scale-[0.99]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange">
                  <User size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-ink">Sponsor a friend</span>
                  <span className="block text-[11px] font-semibold text-gray-400">
                    Pay Premium for someone by username
                  </span>
                </span>
                <ChevronRight size={18} className="text-gray-300" />
              </button>

              {mpesaConfirmOpen && (
                <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
                  <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
                    <p className="text-lg font-black text-ink">Confirm M-Pesa number</p>
                    <p className="mt-1 text-sm font-semibold text-gray-500">
                      Is this the number that should receive the STK push for{' '}
                      <span className="font-extrabold capitalize text-ink">{mpesaPlan}</span>?
                    </p>
                    <label className="mt-4 block text-[11px] font-extrabold text-gray-400">M-Pesa number</label>
                    <input
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value.replace(/[^\d+]/g, ''))}
                      inputMode="tel"
                      className="mt-1 w-full rounded-2xl bg-gray-50 px-3 py-3 text-sm font-bold outline-none ring-1 ring-black/5 focus:ring-brand-purple/30"
                      placeholder="07xxxxxxxx"
                    />
                    <button
                      type="button"
                      disabled={mpesaPaying || !mpesaPhone.trim()}
                      className="mt-4 w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white disabled:opacity-60"
                      onClick={async () => {
                        const phone = mpesaPhone.trim()
                        if (!phone) {
                          setToast('Enter your M-Pesa number')
                          return
                        }
                        setMpesaPaying(true)
                        setMpesaConfirmOpen(false)
                        try {
                          const res = await api.mpesaStkPush({ phone, plan: mpesaPlan })
                          const checkoutId = (res as any)?.checkoutRequestId || (res as any)?.checkout_request_id
                          if (!checkoutId) {
                            setToast('Could not start payment')
                            setMpesaPaying(false)
                            return
                          }
                          setToast('Check your phone and enter M-Pesa PIN')
                          let tries = 0
                          const poll = async () => {
                            tries += 1
                            try {
                              let st: any = null
                              try {
                                st = await api.mpesaStatus(checkoutId)
                              } catch {
                                st = await api.mpesaVerify(checkoutId)
                              }
                              if (st?.paid) {
                                setSetting('subscriptionPlan' as any, 'premium' as never)
                                setMpesaPaid(true)
                                setMpesaPaying(false)
                                setToast("You're a Premium user")
                                void syncSubscription?.()
                                return
                              }
                            } catch { /* */ }
                            if (tries < 24) setTimeout(poll, 2500)
                            else {
                              setMpesaPaying(false)
                              setToast('Still waiting for payment. You can retry.')
                            }
                          }
                          setTimeout(poll, 2500)
                        } catch (e: any) {
                          setMpesaPaying(false)
                          setToast(e?.message || 'Payment failed')
                        }
                      }}
                    >
                      Send STK push
                    </button>
                    <button
                      type="button"
                      className="mt-2 w-full rounded-full py-3 text-sm font-extrabold text-gray-500"
                      onClick={() => setMpesaConfirmOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {page === 'sponsor' && (
            <motion.div key="sponsor" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <p className="text-sm font-extrabold text-ink">Find a friend</p>
                <p className="mt-0.5 text-[11px] font-semibold text-gray-400">
                  Search by username, then pay their Premium with M-Pesa.
                </p>
                <input
                  value={sponsorQuery}
                  onChange={(e) => {
                    const q = e.target.value
                    setSponsorQuery(q)
                    setSponsorPick(null)
                  }}
                  placeholder="@username"
                  className="mt-3 w-full rounded-2xl bg-gray-50 px-3 py-3 text-sm font-bold outline-none ring-1 ring-black/5 focus:ring-brand-purple/30"
                />
                <button
                  type="button"
                  disabled={sponsorSearching || sponsorQuery.trim().length < 2}
                  className="mt-3 w-full rounded-full bg-brand-purple/10 py-2.5 text-sm font-extrabold text-brand-purple disabled:opacity-50"
                  onClick={async () => {
                    setSponsorSearching(true)
                    try {
                      const { users } = await api.searchUsers(sponsorQuery.trim().replace(/^@/, ''))
                      setSponsorResults(users || [])
                    } catch {
                      setSponsorResults([])
                      setToast('Could not search users')
                    } finally {
                      setSponsorSearching(false)
                    }
                  }}
                >
                  {sponsorSearching ? 'Searching…' : 'Search'}
                </button>
              </div>
              <div className="space-y-2">
                {sponsorResults.map((u: any) => {
                  const active = sponsorPick?.id === u.id
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSponsorPick(u)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ring-2 transition ${
                        active ? 'bg-brand-purple/10 ring-brand-purple' : 'bg-white ring-gray-100'
                      }`}
                    >
                      <Avatar
                        contact={{
                          id: u.id,
                          name: u.name || u.username,
                          photo: u.photo,
                          hue: u.hue || ['#7B2CBF', '#6389EB'],
                        }}
                        size={44}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-ink">
                          {u.name || u.username}
                        </span>
                        <span className="block text-[11px] font-semibold text-gray-400">@{u.username}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {sponsorPick && (
                <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                  <p className="text-sm font-extrabold text-ink">
                    Sponsoring @{sponsorPick.username} · <span className="capitalize">{mpesaPlan}</span>
                  </p>
                  <label className="mt-3 block text-[11px] font-extrabold text-gray-400">Your M-Pesa number</label>
                  <input
                    value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value.replace(/[^\d+]/g, ''))}
                    className="mt-1 w-full rounded-2xl bg-gray-50 px-3 py-3 text-sm font-bold outline-none ring-1 ring-black/5 focus:ring-brand-purple/30"
                    placeholder="07xxxxxxxx"
                  />
                  <button
                    type="button"
                    disabled={mpesaPaying || !mpesaPhone.trim()}
                    className="mt-4 w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white disabled:opacity-60"
                    onClick={async () => {
                      setMpesaPaying(true)
                      try {
                        const res = await api.mpesaStkPush({
                          phone: mpesaPhone.trim(),
                          plan: mpesaPlan,
                          gift_username: sponsorPick.username,
                        } as any)
                        const checkoutId = (res as any)?.checkoutRequestId
                        if (!checkoutId) {
                          setToast('Could not start payment')
                          setMpesaPaying(false)
                          return
                        }
                        setToast('STK sent, enter PIN on your phone')
                        let tries = 0
                        const poll = async () => {
                          tries += 1
                          try {
                            const st = await api.mpesaStatus(checkoutId).catch(() => api.mpesaVerify(checkoutId))
                            if (st?.paid) {
                              setMpesaPaying(false)
                              setToast(`Premium gifted to @${sponsorPick.username}`)
                              setPage('mpesa')
                              return
                            }
                          } catch { /* */ }
                          if (tries < 24) setTimeout(poll, 2500)
                          else {
                            setMpesaPaying(false)
                            setToast('Still waiting for payment')
                          }
                        }
                        setTimeout(poll, 2500)
                      } catch (e: any) {
                        setMpesaPaying(false)
                        setToast(e?.message || 'Payment failed')
                      }
                    }}
                  >
                    {mpesaPaying ? 'Initiating payment…' : `Pay ${mpesaPlan} for @${sponsorPick.username}`}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {page === 'account' && (
            <motion.div key="account" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="overflow-hidden rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <div className="flex items-center gap-4">
                  <Avatar
                    contact={{
                      id: 'me',
                      name: s.name,
                      photo: s.photo,
                      hue: ['#7B2CBF', '#6389EB'],
                      premium: ((s as any).subscriptionPlan || me?.subscriptionPlan) === 'premium' && (s as any).verifiedBadge !== false,
                    }}
                    size={64}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-black">{s.name}</p>
                    <p className="text-sm font-bold text-gray-500">@{s.username}</p>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold ${
                      ((s as any).subscriptionPlan || me?.subscriptionPlan) === 'premium'
                        ? 'bg-brand-purple/15 text-brand-purple'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {((s as any).subscriptionPlan || me?.subscriptionPlan) === 'premium' ? 'Premium member' : 'Pro · Free plan'}
                    </span>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 text-xs font-semibold text-gray-500">
                  <li>• Pro: core chat, status, calls</li>
                  <li>• Premium: live typing, force receipts, badge, status ads</li>
                </ul>
                {((s as any).subscriptionPlan || me?.subscriptionPlan) !== 'premium' ? (
                  <button
                    type="button"
                    className="mt-4 w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white shadow-md"
                    onClick={async () => {
                      try {
                        await api.upgradePremium()
                        setSetting('subscriptionPlan' as any, 'premium' as never)
                        setSetting('verifiedBadge' as any, true as never)
                        setToast('Welcome to Premium - payment can be wired later')
                      } catch (e: any) {
                        setToast(e?.message || 'Could not upgrade')
                      }
                    }}
                  >
                    Upgrade to Premium
                  </button>
                ) : (
                  <p className="mt-4 rounded-2xl bg-brand-purple/10 px-3 py-2 text-center text-xs font-bold text-brand-purple">
                    You are on Premium. Thank you for supporting SafeChat.
                  </p>
                )}
              </div>
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
        title={confirm === 'logout' ? 'Log out?' : 'Deactivate account?'}
      >
        {confirm === 'logout' ? (
          <>
            <p className="mb-4 text-sm font-semibold text-gray-500">
              You can sign back in anytime with your number.
            </p>
            <PrimaryButton
              danger
              onClick={() => {
                setConfirm(null)
                setLoggingOut(true)
                void (async () => {
                  try {
                    await Promise.resolve(onLogout())
                  } catch {
                    /* stay on overlay until parent routes away */
                  }
                })()
              }}
            >
              Log out
            </PrimaryButton>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm font-semibold text-gray-500">
              Your account will be deactivated. After 6 months without reactivation it may be permanently deleted. Monthly reminder emails can be sent while deactivated.
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

      {loggingOut && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gradient-to-b from-[#F8F1FF] via-white to-[#EEF2FF]">
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-transparent px-10 py-8">
            <div className="flex h-12 items-end gap-1.5" aria-hidden>
              <span className="h-3 w-3 animate-bounce rounded-full bg-brand-purple [animation-delay:-0.3s]" />
              <span className="h-3 w-3 animate-bounce rounded-full bg-brand-orange [animation-delay:-0.15s]" />
              <span className="h-3 w-3 animate-bounce rounded-full bg-brand-blue" />
            </div>
            <p className="text-base font-extrabold text-ink">Logging you out…</p>
            <p className="text-xs font-semibold text-gray-400">Please wait</p>
          </div>
        </div>
      )}
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
