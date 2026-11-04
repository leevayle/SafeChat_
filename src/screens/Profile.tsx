import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, User } from 'lucide-react'
import { ProgressDots } from '../components/ProgressDots'
import { PillButton } from '../components/PillButton'
import { useStore } from '../store'
import { api } from '../api'

type Props = {
  phone: string
  countryCode: string
  registrationToken: string
  onBack?: () => void
  /** Called immediately when user submits — parent shows setup screen */
  onSubmitStart?: () => void
  /** Success with username/display for welcome */
  onDone: (name: string) => void
  /** Registration failed with a user-facing message */
  onError?: (message: string) => void
}

export function Profile({ phone, countryCode, registrationToken, onBack, onSubmitStart, onDone, onError }: Props) {
  const { register } = useStore()
  const [photo, setPhoto] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setSheet(false)
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return }
    if (file.size > 8 * 1024 * 1024) { setError('Choose an image smaller than 8 MB.'); return }
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image processing is unavailable.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      setPhoto(canvas.toDataURL('image/jpeg', 0.78))
      bitmap.close()
      setError('')
    } catch { setError('Could not read that image. Please choose another one.') }
  }

  const valid =
    username.trim().length >= 3 &&
    displayName.trim().length >= 1 &&
    password.length >= 8 &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'checking'

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    onSubmitStart?.()
    try {
      const user = await register({
        phone,
        countryCode,
        username: username.trim().toLowerCase().replace(/^@/, ''),
        name: displayName.trim(),
        password,
        email: email.trim() || undefined,
        bio: bio.trim() || undefined,
        photo,
        registrationToken,
      })
      onDone(user.username || displayName.trim())
    } catch (e: any) {
      const msg =
        e?.message ||
        (typeof e === 'string' ? e : '') ||
        'Could not create account. Check your details and try again.'
      setError(msg)
      setBusy(false)
      onError?.(msg)
    }
  }

  return (
    <div className="relative flex h-full flex-col px-6 safe-pt safe-pb sm:px-8">
      <div className="flex items-center justify-between pt-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-gray-200/80 transition hover:bg-gray-50 active:scale-95"
            aria-label="Back"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-orange via-brand-magenta to-brand-purple">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3C7 3 3 6.6 3 11c0 2.3 1.1 4.4 2.9 5.9L4.5 21l4.2-1.8c1 .2 2.1.3 3.3.3 5 0 9-3.6 9-8s-4-8-9-8Z"
                fill="white"
                opacity="0.95"
              />
            </svg>
          </div>
        )}
        <ProgressDots step={4} total={4} />
      </div>

      <motion.h2
        className="mt-6 text-[1.65rem] font-black leading-snug text-ink"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Tell us more
        <br />
        <span className="text-brand-purple">About</span>{' '}
        <span className="text-brand-red">yourself!</span>
      </motion.h2>
      <p className="mt-1.5 text-sm font-semibold text-gray-500">
        Your phone is verified. Choose a username so people can find you without sharing your number.
      </p>

      <div className="mt-6 flex justify-center">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => setSheet(true)}
          aria-label="Choose profile photo"
          className="relative h-[96px] w-[96px] rounded-full bg-gray-100 shadow-md"
        >
          {photo ? (
            <img src={photo} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <User className="mx-auto text-gray-300" size={44} strokeWidth={1.5} />
          )}
          <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-orange-2 text-white shadow-md ring-[3px] ring-white">
            <Camera size={14} />
          </span>
        </motion.button>
      </div>

      <div className="mt-6 space-y-3 overflow-y-auto no-scrollbar pb-2">
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-500">Username (required)</label>
          <div className="flex h-11 items-center rounded-full bg-gray-100 px-4">
            <span className="mr-1 font-bold text-brand-purple">@</span>
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()); setUsernameStatus('idle') }}
              onBlur={async () => {
                const value = username.trim().toLowerCase()
                if (value.length < 3) return
                setUsernameStatus('checking')
                try { const result = await api.checkUsername(value); setUsernameStatus(result.available ? 'available' : 'taken') }
                catch { setUsernameStatus('idle') }
              }}
              placeholder="yourname"
              maxLength={32}
              className="h-full flex-1 bg-transparent text-[15px] font-semibold outline-none"
            />
          </div>
          {usernameStatus === 'checking' && <p className="mt-1 px-3 text-[11px] font-semibold text-gray-400">Checking username…</p>}
          {usernameStatus === 'available' && <p className="mt-1 px-3 text-[11px] font-semibold text-emerald-600">Username is available</p>}
          {usernameStatus === 'taken' && <p className="mt-1 px-3 text-[11px] font-semibold text-brand-red">That username is already taken</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-500">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How you appear to others"
            maxLength={64}
            className="h-11 w-full rounded-full bg-gray-100 px-5 text-[15px] font-semibold outline-none focus:ring-4 focus:ring-brand-purple/15"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-500">Password (min 8)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className="h-11 w-full rounded-full bg-gray-100 px-5 text-[15px] font-semibold outline-none focus:ring-4 focus:ring-brand-purple/15"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-500">Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="h-11 w-full rounded-full bg-gray-100 px-5 text-[15px] font-semibold outline-none focus:ring-4 focus:ring-brand-purple/15"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-500">Bio (optional)</label>
          <input
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Hey there! I am using SafeChat."
            maxLength={256}
            className="h-11 w-full rounded-full bg-gray-100 px-5 text-[15px] font-semibold outline-none focus:ring-4 focus:ring-brand-purple/15"
          />
        </div>
        {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
      </div>

      <div className="mt-auto pb-4 pt-3">
        <PillButton variant="orange" loading={busy} disabled={!valid} onClick={save}>
          Create account
        </PillButton>
      </div>

      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={pick} />
      <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />

      <AnimatePresence>
        {sheet && (
          <motion.div
            className="absolute inset-0 z-20 flex items-end bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheet(false)}
          >
            <motion.div
              className="w-full rounded-t-3xl bg-white p-5 safe-pb"
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-3 text-center text-sm font-bold text-gray-500">Profile photo</p>
              <button type="button" className="mb-2 w-full rounded-2xl bg-gray-100 py-3 font-bold" onClick={() => camera.current?.click()}>
                Camera
              </button>
              <button type="button" className="mb-2 w-full rounded-2xl bg-gray-100 py-3 font-bold" onClick={() => gallery.current?.click()}>
                Gallery
              </button>
              <button type="button" className="w-full rounded-2xl py-3 font-bold text-brand-red" onClick={() => setSheet(false)}>
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
