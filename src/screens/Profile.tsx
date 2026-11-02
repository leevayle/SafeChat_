import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, User } from 'lucide-react'
import { ProgressDots } from '../components/ProgressDots'
import { PillButton } from '../components/PillButton'
import { useStore } from '../store'

type Props = {
  phone: string
  countryCode: string
  onDone: (name: string) => void
}

export function Profile({ phone, countryCode, onDone }: Props) {
  const { register } = useStore()
  const [photo, setPhoto] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setPhoto(URL.createObjectURL(f))
    setSheet(false)
  }
  const valid =
    username.trim().length >= 3 &&
    displayName.trim().length >= 1 &&
    password.length >= 8

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const user = await register({
        phone,
        countryCode,
        username: username.trim().toLowerCase().replace(/^@/, ''),
        name: displayName.trim(),
        password,
        bio: bio.trim() || 'Hey there! I am using SafeChat.',
        photo,
      })
      onDone(user.username)
    } catch (e: any) {
      setError(e.message || 'Could not create account')
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-full flex-col px-6 safe-pt safe-pb sm:px-8">
      <div className="flex items-center justify-between pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-orange via-brand-magenta to-brand-purple">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3C7 3 3 6.6 3 11c0 2.3 1.1 4.4 2.9 5.9L4.5 21l4.2-1.8c1 .2 2.1.3 3.3.3 5 0 9-3.6 9-8s-4-8-9-8Z"
              fill="white"
              opacity="0.95"
            />
          </svg>
        </div>
        <ProgressDots step={3} />
      </div>

      <motion.h2
        className="mt-6 text-[1.65rem] font-black leading-snug text-ink"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Tell us more<br /><span className="text-brand-purple">About</span> <span className="text-brand-red">yourself!</span>
      </motion.h2>
      <p className="mt-1.5 text-sm font-semibold text-gray-500">
        Choose a username and password to secure your account.
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
          <label className="mb-1 block text-xs font-bold text-gray-500">Username</label>
          <div className="flex h-11 items-center rounded-full bg-gray-100 px-4">
            <span className="mr-1 font-bold text-brand-purple">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
              placeholder="yourname"
              maxLength={32}
              className="h-full flex-1 bg-transparent text-[15px] font-semibold outline-none"
            />
          </div>
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
          <label className="mb-1 block text-xs font-bold text-gray-500">Bio</label>
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
