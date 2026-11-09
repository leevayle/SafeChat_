import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, User } from 'lucide-react'
import { ProgressDots } from '../components/ProgressDots'
import { PillButton } from '../components/PillButton'
import { ImageCropper } from '../components/ImageCropper'
import { fileToDataUrl } from '../lib/imageProcess'
import { useStore } from '../store'
import { api } from '../api'

type Props = {
  phone: string
  countryCode: string
  registrationToken: string
  onBack?: () => void
  onSubmitStart?: () => void
  onDone: (name: string) => void
  onError?: (message: string) => void
}

type Step = 'photo' | 'identity' | 'password' | 'extras'

const inputCls =
  'h-12 w-full rounded-2xl bg-white px-4 text-[15px] font-semibold text-ink outline-none ring-1 ring-black/10 shadow-sm transition focus:ring-brand-purple/35 focus:shadow-[0_0_0_3px_rgba(123,44,191,0.10)] mx-0.5'

export function Profile({
  phone,
  countryCode,
  registrationToken,
  onBack,
  onSubmitStart,
  onDone,
  onError,
}: Props) {
  const { register } = useStore()
  const [step, setStep] = useState<Step>('photo')
  const [photo, setPhoto] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle')
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const checkRef = useRef(0)

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setSheet(false)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Choose an image smaller than 12 MB.')
      return
    }
    try {
      const src = await fileToDataUrl(file)
      setCropSrc(src)
      setError('')
    } catch {
      setError('Could not read that image. Please choose another one.')
    }
  }

  useEffect(() => {
    const raw = username.trim().toLowerCase().replace(/^@/, '')
    if (raw.length < 3) {
      setUsernameStatus(raw.length === 0 ? 'idle' : 'invalid')
      return
    }
    if (!/^[a-z0-9._]+$/.test(raw)) {
      setUsernameStatus('invalid')
      return
    }
    const token = ++checkRef.current
    setUsernameStatus('checking')
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const { available } = await api.checkUsername(raw)
          if (token !== checkRef.current) return
          setUsernameStatus(available ? 'available' : 'taken')
        } catch {
          if (token !== checkRef.current) return
          setUsernameStatus('idle')
        }
      })()
    }, 280)
    return () => clearTimeout(t)
  }, [username])

  const identityOk =
    displayName.trim().length >= 1 &&
    username.trim().replace(/^@/, '').length >= 3 &&
    usernameStatus === 'available'
  const passwordOk = password.length >= 8 && password === password2

  const goBack = () => {
    setError('')
    if (step === 'photo') onBack?.()
    else if (step === 'identity') setStep('photo')
    else if (step === 'password') setStep('identity')
    else setStep('password')
  }

  const save = async () => {
    if (busy) return
    if (!identityOk || !passwordOk) {
      setError('Check your details and try again.')
      return
    }
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
      if (/username.*taken|already taken|already registered/i.test(msg)) {
        setUsernameStatus('taken')
        setStep('identity')
        return
      }
      onError?.(msg)
    }
  }

  const title =
    step === 'photo'
      ? 'Add a photo'
      : step === 'identity'
        ? 'Your identity'
        : step === 'password'
          ? 'Secure your account'
          : 'Almost there'

  const subtitle =
    step === 'photo'
      ? 'Optional, you can skip and add one later.'
      : step === 'identity'
        ? 'Choose a display name and a unique username.'
        : step === 'password'
          ? 'At least 8 characters. Confirm it below.'
          : 'Bio and email are optional.'

  return (
    <div className="relative flex h-full flex-col bg-transparent px-6 safe-pt safe-pb sm:px-8">
      {/* Top bar: back + centered dashes */}
      <div className="relative flex items-center justify-center pt-4">
        <button
          type="button"
          onClick={goBack}
          className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-ink ring-1 ring-black/10 transition hover:bg-gray-100 active:scale-95"
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
        <ProgressDots total={3} />
      </div>

      {/* Content area */}
      <div className="flex min-h-0 flex-1 flex-col">
        <motion.div
          key={step + '-head'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 text-center"
        >
          <h2 className="text-[1.7rem] font-black leading-snug tracking-tight text-ink">{title}</h2>
          <p className="mx-auto mt-2 max-w-[280px] text-sm font-semibold text-gray-500">{subtitle}</p>
        </motion.div>

        <div className="mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-visible px-0.5">
          <AnimatePresence mode="wait">
            {step === 'photo' && (
              <motion.div
                key="photo"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-1 flex-col items-center justify-center pb-6"
              >
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  aria-label="Choose profile photo"
                  className="relative flex h-36 w-36 items-center justify-center rounded-full bg-gray-100 ring-[3px] ring-brand-purple/15"
                >
                  {photo ? (
                    <img src={photo} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <User size={52} className="text-gray-300" />
                  )}
                  {/* Camera sits outside the clip so it is not cut by the ring */}
                  <span className="absolute -bottom-0.5 -right-0.5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple text-white shadow-md ring-4 ring-white">
                    <Camera size={18} />
                  </span>
                </button>
                <p className="mt-6 text-center text-xs font-semibold text-gray-400">
                  Tap to choose · you can crop before saving
                </p>
              </motion.div>
            )}

            {step === 'identity' && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center space-y-5 px-1 pb-6"
              >
                <div>
                  <label className="mb-1.5 block text-left text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
                    Display name
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
                    placeholder="How friends see you"
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-left text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
                    Username
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                      @
                    </span>
                    <input
                      value={username.replace(/^@/, '')}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24))
                      }
                      placeholder="unique_name"
                      className={`${inputCls} pl-8 ${
                        usernameStatus === 'taken' || usernameStatus === 'invalid'
                          ? 'text-brand-red ring-brand-red/40'
                          : ''
                      }`}
                    />
                  </div>
                  <p className="mt-1.5 text-left text-[11px] font-bold text-gray-400">
                    {usernameStatus === 'checking' && 'Checking…'}
                    {usernameStatus === 'available' && (
                      <span className="text-emerald-600">Available</span>
                    )}
                    {usernameStatus === 'taken' && (
                      <span className="text-brand-red">Taken, try another</span>
                    )}
                    {usernameStatus === 'invalid' && username.length > 0 && (
                      <span className="text-brand-red">Use letters, numbers, . or _</span>
                    )}
                    {usernameStatus === 'idle' && 'At least 3 characters'}
                  </p>
                </div>
              </motion.div>
            )}

            {step === 'password' && (
              <motion.div
                key="password"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center space-y-5 px-1 pb-6"
              >
                <div>
                  <label className="mb-1.5 block text-left text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.slice(0, 72))}
                    placeholder="At least 8 characters"
                    className={inputCls}
                    autoFocus
                  />
                  <p className="mt-1.5 text-left text-[11px] font-bold text-gray-400">
                    {password.length === 0
                      ? 'Choose something memorable'
                      : password.length < 8
                        ? `${8 - password.length} more character${password.length === 7 ? '' : 's'}`
                        : <span className="text-emerald-600">Strong enough</span>}
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-left text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
                    Repeat password
                  </label>
                  <input
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value.slice(0, 72))}
                    placeholder="Type it again"
                    className={`${inputCls} ${
                      password2.length > 0 && password2 !== password
                        ? 'text-brand-red ring-brand-red/40'
                        : ''
                    }`}
                  />
                  <p className="mt-1.5 text-left text-[11px] font-bold text-gray-400">
                    {password2.length === 0
                      ? 'Confirm your password'
                      : password2 !== password
                        ? <span className="text-brand-red">Passwords do not match</span>
                        : <span className="text-emerald-600">Match</span>}
                  </p>
                </div>
              </motion.div>
            )}

            {step === 'extras' && (
              <motion.div
                key="extras"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center space-y-5 px-1 pb-6"
              >
                <div>
                  <label className="mb-1.5 block text-left text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
                    Bio <span className="font-semibold normal-case text-gray-300">(optional)</span>
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 140))}
                    placeholder="A short line about you"
                    rows={3}
                    className="w-full resize-none rounded-2xl bg-white px-4 py-3 text-[15px] font-semibold text-ink outline-none ring-1 ring-black/10 shadow-sm transition focus:ring-brand-purple/35"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-left text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
                    Email <span className="font-semibold normal-case text-gray-300">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.slice(0, 120))}
                    placeholder="you@email.com"
                    className={inputCls}
                  />
                </div>
                <div className="rounded-2xl bg-brand-purple/5 px-4 py-3 text-left text-[12px] font-semibold text-gray-500 ring-1 ring-brand-purple/10">
                  Signing up as{' '}
                  <span className="font-extrabold text-ink">
                    {countryCode}
                    {phone.replace(/\D/g, '').replace(/^0/, '')}
                  </span>{' '}
                  · @{username.replace(/^@/, '') || '…'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {error && (
            <p role="alert" className="mx-auto mb-2 max-w-[360px] text-center text-xs font-bold text-brand-red">
              {error}
            </p>
          )}
        </div>

        {/* Bottom actions, fixed footprint */}
        <div className="mx-auto w-full max-w-[360px] space-y-2 pb-2 pt-3">
          {step === 'photo' && (
            <>
              <PillButton variant="orange" onClick={() => setStep('identity')}>
                {photo ? 'Continue' : 'Continue without photo'}
              </PillButton>
              {!photo && (
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  className="w-full py-2 text-center text-sm font-bold text-brand-purple"
                >
                  Choose a photo
                </button>
              )}
            </>
          )}
          {step === 'identity' && (
            <PillButton variant="orange" disabled={!identityOk} onClick={() => setStep('password')}>
              Continue
            </PillButton>
          )}
          {step === 'password' && (
            <PillButton variant="orange" disabled={!passwordOk} onClick={() => setStep('extras')}>
              Continue
            </PillButton>
          )}
          {step === 'extras' && (
            <PillButton variant="orange" loading={busy} disabled={busy} onClick={() => void save()}>
              Create account
            </PillButton>
          )}
        </div>
      </div>

      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={pick} />
      <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />

      <AnimatePresence>
        {sheet && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-end bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheet(false)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              className="w-full rounded-t-3xl bg-white p-5 sm:mx-auto sm:max-w-md sm:rounded-3xl sm:mb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-3 text-center text-sm font-extrabold text-ink">Profile photo</p>
              <button
                type="button"
                className="mb-2 w-full rounded-2xl bg-gray-50 py-3.5 text-sm font-bold ring-1 ring-black/5"
                onClick={() => camera.current?.click()}
              >
                Take photo
              </button>
              <button
                type="button"
                className="mb-2 w-full rounded-2xl bg-gray-50 py-3.5 text-sm font-bold ring-1 ring-black/5"
                onClick={() => gallery.current?.click()}
              >
                Choose from gallery
              </button>
              {photo && (
                <button
                  type="button"
                  className="mb-2 w-full rounded-2xl bg-red-50 py-3.5 text-sm font-bold text-brand-red"
                  onClick={() => {
                    setPhoto(null)
                    setSheet(false)
                  }}
                >
                  Remove photo
                </button>
              )}
              <button
                type="button"
                className="w-full py-3 text-sm font-bold text-gray-400"
                onClick={() => setSheet(false)}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onDone={(out) => {
            setPhoto(out)
            setCropSrc(null)
          }}
        />
      )}
    </div>
  )
}
