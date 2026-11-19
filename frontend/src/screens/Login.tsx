import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { PillButton } from '../components/PillButton'
import { LogoIcon, Wordmark } from '../components/Logo'
import { useStore } from '../store'
import { api } from '../api'

function normalizeLoginPhone(raw: string): string {
  let s = (raw || '').trim().replace(/[\s()-]/g, '')
  if (!s) return s
  if (s.startsWith('+')) return s.replace(/[^\d+]/g, '')
  const digits = s.replace(/\D/g, '')
  if (/^0[17]\d{8}$/.test(digits)) return '+254' + digits.slice(1)
  if (/^254[17]\d{8}$/.test(digits)) return '+' + digits
  if (/^[17]\d{8}$/.test(digits)) return '+254' + digits
  if (digits.startsWith('0') && digits.length >= 9) return '+254' + digits.slice(1)
  return digits.startsWith('254') ? '+' + digits : (digits ? '+' + digits : s)
}

type LoginMode = 'login' | 'forgot' | 'reset-sent' | 'force-reset'

export function Login({
  onBack,
  onSuccess,
  onSignup,
  notice,
  clearNotice,
}: {
  onBack?: () => void
  onSuccess: () => void
  onSignup?: () => void
  notice?: string
  clearNotice?: () => void
}) {
  const { login, showToast } = useStore()
  const [mode, setMode] = useState<LoginMode>('login')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetLoginToken, setResetLoginToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState(notice || '')

  const submit = async () => {
    if (!phone.trim() || !password) {
      setError('Enter your phone number or username and password')
      return
    }
    setLoading(true)
    setError('')
    setOkMsg('')
    clearNotice?.()
    try {
      const result = await login(normalizeLoginPhone(phone), password)
      if ('passwordResetRequired' in result) {
        setResetLoginToken(result.passwordResetToken)
        setNewPassword('')
        setConfirmPassword('')
        setMode('force-reset')
        setOkMsg('')
        setLoading(false)
        return
      }
      const uname = result.username || phone.trim().replace(/^@/, '') || 'friend'
      setOkMsg('Signed in, opening your chats…')
      showToast(`Welcome ${uname}!`)
      onSuccess()
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : ''
      const low = raw.toLowerCase()
      if (
        low.includes('failed to fetch') ||
        low.includes('networkerror') ||
        low.includes('load failed') ||
        low.includes('network request failed')
      ) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        setError(
          offline
            ? "You're offline. Check your internet connection and try again."
            : 'SafeChat server could not be reached. Please try again in a moment.',
        )
      } else {
        setError(raw || 'Login failed')
      }
      setLoading(false)
      return
    }
    setLoading(false)
  }

  const requestReset = async () => {
    if (!email.trim()) {
      setError('Enter the email address on your account')
      return
    }
    setLoading(true)
    setError('')
    setOkMsg('')
    try {
      await api.requestPasswordReset(email.trim())
      setMode('reset-sent')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not request a password reset')
    } finally {
      setLoading(false)
    }
  }

  const completeReset = async () => {
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.completePasswordReset(resetLoginToken, newPassword)
      setResetLoginToken('')
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMode('login')
      setOkMsg('Password updated. Sign in with your new password.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update your password')
    } finally {
      setLoading(false)
    }
  }

  const title =
    mode === 'force-reset'
      ? 'Create a new password'
      : mode === 'forgot' || mode === 'reset-sent'
        ? 'Reset your password'
        : 'Welcome'

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-transparent px-7 safe-pt safe-pb">
      {onBack && mode !== 'force-reset' && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-[max(0.85rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-ink ring-1 ring-black/5 backdrop-blur transition hover:bg-white active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
      )}

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
        <h2 className="mt-6 text-2xl font-black tracking-tight text-ink dark:text-gray-100">{title}</h2>
        <p className="mt-1.5 max-w-[300px] text-sm font-semibold text-gray-500 dark:text-gray-400">
          {mode === 'force-reset'
            ? 'Your temporary password was accepted. Choose a new password to secure your account.'
            : mode === 'forgot' || mode === 'reset-sent'
              ? 'We’ll email a temporary sign-in password if the address belongs to an active account.'
              : 'Sign in to start Safechatting now!'}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="relative z-10 mt-10 space-y-4"
      >
        {mode === 'login' && (
          <>
            <div>
              <label className="mb-1.5 block text-left text-xs font-bold text-gray-500 dark:text-gray-400">
                Phone or username
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07… or @username"
                inputMode="text"
                autoComplete="username"
                className="h-12 w-full rounded-2xl bg-transparent px-4 text-[15px] font-semibold text-ink outline-none ring-1 ring-black/10 transition focus:ring-brand-purple/30 dark:text-gray-100 dark:ring-white/15"
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
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
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
              />
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setOkMsg('')
                  setMode('forgot')
                }}
                className="mt-2 text-left text-xs font-extrabold text-brand-purple"
              >
                Forgot password?
              </button>
            </div>
          </>
        )}

        {mode === 'forgot' && (
          <div>
            <label className="mb-1.5 block text-left text-xs font-bold text-gray-500 dark:text-gray-400">
              Account email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="h-12 w-full rounded-2xl bg-transparent px-4 text-[15px] font-semibold text-ink outline-none ring-1 ring-black/10 transition focus:ring-brand-purple/30 dark:text-gray-100 dark:ring-white/15"
              onKeyDown={(e) => e.key === 'Enter' && void requestReset()}
            />
          </div>
        )}

        {mode === 'reset-sent' && (
          <div className="rounded-2xl bg-brand-purple/8 px-4 py-4 text-sm font-semibold leading-relaxed text-gray-600 dark:text-gray-300">
            If an active SafeChat account uses that email, a temporary password is on its way. Sign in with it to choose a new password.
          </div>
        )}

        {mode === 'force-reset' && (
          <>
            <div>
              <label className="mb-1.5 block text-left text-xs font-bold text-gray-500 dark:text-gray-400">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="h-12 w-full rounded-2xl bg-transparent px-4 text-[15px] font-semibold text-ink outline-none ring-1 ring-black/10 transition focus:ring-brand-purple/30 dark:text-gray-100 dark:ring-white/15"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-left text-xs font-bold text-gray-500 dark:text-gray-400">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Enter it again"
                autoComplete="new-password"
                className="h-12 w-full rounded-2xl bg-transparent px-4 text-[15px] font-semibold text-ink outline-none ring-1 ring-black/10 transition focus:ring-brand-purple/30 dark:text-gray-100 dark:ring-white/15"
                onKeyDown={(e) => e.key === 'Enter' && void completeReset()}
              />
            </div>
          </>
        )}

        {error && <p className="text-left text-sm font-bold text-brand-red">{error}</p>}
        {okMsg && <p className="text-left text-sm font-bold text-brand-purple">{okMsg}</p>}
      </motion.div>

      <div className="relative z-10 mt-auto space-y-3 pt-8">
        {mode === 'login' && (
          <>
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
          </>
        )}
        {mode === 'forgot' && (
          <>
            <PillButton variant="orange" loading={loading} onClick={requestReset}>
              Send reset email
            </PillButton>
            <button type="button" onClick={() => setMode('login')} className="h-11 w-full text-sm font-extrabold text-brand-purple">
              Back to sign in
            </button>
          </>
        )}
        {mode === 'reset-sent' && (
          <button type="button" onClick={() => setMode('login')} className="h-12 w-full rounded-full bg-brand-purple py-3 text-sm font-extrabold text-white">
            Back to sign in
          </button>
        )}
        {mode === 'force-reset' && (
          <>
            <PillButton variant="orange" loading={loading} onClick={completeReset}>
              Save new password
            </PillButton>
            <button
              type="button"
              onClick={() => {
                setResetLoginToken('')
                setMode('forgot')
                setError('')
              }}
              className="h-11 w-full text-sm font-extrabold text-brand-purple"
            >
              Request another temporary password
            </button>
          </>
        )}
      </div>
    </div>
  )
}
