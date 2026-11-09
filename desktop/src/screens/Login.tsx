import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { PillButton } from '../components/PillButton'
import { LogoIcon, Wordmark } from '../components/Logo'
import { useStore } from '../store'

export function Login({
  onBack,
  onSuccess,
  onSignup,
}: {
  onBack: () => void
  onSuccess: () => void
  onSignup?: () => void
}) {
  const { login, showToast } = useStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const submit = async () => {
    if (!phone.trim() || !password) {
      setError('Enter your phone number and password')
      return
    }
    setLoading(true)
    setError('')
    setOkMsg('')
    try {
      const user = await login(phone.trim().replace(/[^+\d]/g, ''), password)
      const uname =
        (user as any)?.username ||
        (user as any)?.name ||
        phone.trim().replace(/^@/, '') ||
        'friend'
      setOkMsg('Signed in, opening your chats…')
      try {
        showToast(`Welcome ${uname}!`)
      } catch { /* */ }
      onSuccess()
    } catch (e: any) {
      setError(e?.message || 'Login failed')
      setLoading(false)
      return
    }
    setLoading(false)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-transparent px-7 safe-pt safe-pb">
      <button
        type="button"
        onClick={onBack}
        className="absolute left-4 top-[max(0.85rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-ink ring-1 ring-black/5 backdrop-blur transition hover:bg-white active:scale-95"
        aria-label="Back"
      >
        <ArrowLeft size={20} />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 mt-[max(3.5rem,env(safe-area-inset-top))] flex flex-col items-center text-center"
      >
        <LogoIcon size={72} />
        <div className="mt-3">
          <Wordmark className="text-3xl" />
        </div>
        <h2 className="mt-6 text-2xl font-black tracking-tight text-ink dark:text-gray-100">Welcome</h2>
        <p className="mt-1.5 max-w-[280px] text-sm font-semibold text-gray-500 dark:text-gray-400">
          Sign in to start Safechatting now!
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="relative z-10 mt-10 space-y-4"
      >
        <div>
          <label className="mb-1.5 block text-left text-xs font-bold text-gray-500 dark:text-gray-400">
            Phone
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2547…"
            inputMode="tel"
            autoComplete="tel"
            className="h-12 w-full rounded-2xl bg-transparent px-4 text-[15px] font-semibold text-ink outline-none ring-1 ring-black/10 transition focus:ring-brand-purple/30 dark:text-gray-100 dark:ring-white/15"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-left text-xs font-bold text-gray-500 dark:text-gray-400">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            className="h-12 w-full rounded-2xl bg-transparent px-4 text-[15px] font-semibold text-ink outline-none ring-1 ring-black/10 transition focus:ring-brand-purple/30 dark:text-gray-100 dark:ring-white/15"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        {error && <p className="text-left text-sm font-bold text-brand-red">{error}</p>}
        {okMsg && <p className="text-left text-sm font-bold text-brand-purple">{okMsg}</p>}
      </motion.div>

      <div className="relative z-10 mt-auto space-y-3 pt-8">
        <PillButton variant="orange" loading={loading} onClick={submit}>
          Log in
        </PillButton>
        <div className="flex items-center gap-3 px-2">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">or</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <button
          type="button"
          onClick={() => onSignup?.()}
          className="mb-10 h-12 w-full rounded-full bg-white/80 text-sm font-extrabold text-brand-purple ring-1 ring-brand-purple/15 transition hover:bg-brand-purple/5 active:scale-[0.99]"
        >
          Create a new account
        </button>
      </div>
    </div>
  )
}
