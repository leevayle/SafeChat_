import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Image as ImageIcon, User } from 'lucide-react'
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
  const [name, setName] = useState('')
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
  const valid = name.trim().length >= 2

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const user = await register({
        phone,
        countryCode,
        username: name.trim().replace(/^@/, ''),
        name: name.trim().replace(/^@/, ''),
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
        className="mt-8 text-[1.65rem] font-black leading-snug text-ink"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Tell us more<br /><span className="text-brand-purple">About</span> <span className="text-brand-red">yourself!</span>
      </motion.h2>
      <p className="mt-1.5 text-sm font-semibold text-gray-500">
        NOTE: Your username and profile pic are public!
      </p>

      <div className="mt-10 flex justify-center">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => setSheet(true)}
          aria-label="Choose profile photo"
          className="relative h-[112px] w-[112px] rounded-full bg-gray-100 shadow-md"
        >
          {photo ? (
            <img src={photo} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <User className="mx-auto text-gray-300" size={52} strokeWidth={1.5} />
          )}
          <span className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-orange-2 text-white shadow-md ring-[3px] ring-white">
            <Camera size={16} />
          </span>
        </motion.button>
      </div>

      <div className="mt-10 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-gray-500">Username</label>
          <div className="flex h-12 items-center rounded-full bg-gray-100 px-4">
            <span className="mr-1 font-bold text-brand-purple">@</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
              placeholder="your_name"
              maxLength={24}
              className="h-full flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-gray-400"
            />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-bold text-gray-500">
              Bio <span className="font-semibold text-gray-400">(optional)</span>
            </label>
            <span className="text-[11px] font-semibold text-gray-400">{bio.length}/80</span>
          </div>
          <input
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 80))}
            placeholder="Say something about yourself"
            className="h-12 w-full rounded-full bg-gray-100 px-5 text-[15px] font-semibold outline-none placeholder:text-gray-400"
          />
        </div>
        {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
      </div>

      <div className="flex-1" />

      <div className="pb-2">
        <PillButton variant="orange" loading={busy} disabled={!valid} onClick={save}>
          Save & continue
        </PillButton>
      </div>

      <AnimatePresence>
        {sheet && (
          <>
            <motion.div
              className="absolute inset-0 z-30 bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheet(false)}
            />
            <motion.div
              className="absolute inset-x-4 bottom-8 z-40 overflow-hidden rounded-3xl bg-white shadow-2xl"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            >
              <button
                type="button"
                onClick={() => camera.current?.click()}
                className="flex w-full items-center gap-3 px-5 py-4 text-left font-bold hover:bg-gray-50"
              >
                <Camera size={20} className="text-brand-purple" /> Take photo
              </button>
              <div className="mx-5 h-px bg-gray-100" />
              <button
                type="button"
                onClick={() => gallery.current?.click()}
                className="flex w-full items-center gap-3 px-5 py-4 text-left font-bold hover:bg-gray-50"
              >
                <ImageIcon size={20} className="text-brand-purple" /> Choose from gallery
              </button>
            </motion.div>
            <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={pick} />
            <input ref={gallery} type="file" accept="image/*" hidden onChange={pick} />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
