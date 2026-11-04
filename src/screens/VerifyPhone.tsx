import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, MessageSquareText, ShieldCheck } from 'lucide-react'
import { PillButton } from '../components/PillButton'
import { ProgressDots } from '../components/ProgressDots'

type Props = {
  phoneNumber: string
  developmentCode?: string | null
  onVerify: (code: string) => Promise<void>
  onResend: () => Promise<string | null>
  onBack: () => void
  onEditNumber: () => void
}

export function VerifyPhone({ phoneNumber, developmentCode, onVerify, onResend, onBack, onEditNumber }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [devCode, setDevCode] = useState(developmentCode || '')
  const [seconds, setSeconds] = useState(60)

  useEffect(() => {
    if (seconds <= 0) return
    const timer = window.setTimeout(() => setSeconds((v) => v - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [seconds])

  const submit = async () => {
    if (code.length !== 6 || busy) return
    setBusy(true); setError('')
    try { await onVerify(code) } catch (e: any) { setError(e?.message || 'Could not verify this code. Try again.') }
    finally { setBusy(false) }
  }

  const resend = async () => {
    if (seconds > 0 || resending) return
    setResending(true); setError('')
    try { setDevCode((await onResend()) || ''); setSeconds(60); setCode('') }
    catch (e: any) { setError(e?.message || 'Could not resend the code.') }
    finally { setResending(false) }
  }

  return (
    <div className="flex h-full flex-col px-7 safe-pt safe-pb sm:px-8">
      <div className="flex items-center justify-between pt-4">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-gray-200"><ArrowLeft size={21}/></button>
        <ProgressDots step={3} total={4}/>
        <span className="w-11" />
      </div>
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="mt-12 flex flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-purple/10 text-brand-purple"><MessageSquareText size={30}/></span>
        <h2 className="mt-6 text-2xl font-black text-ink">Verify your number</h2>
        <p className="mt-2 max-w-[290px] text-sm leading-relaxed text-gray-500">We sent a 6-digit code to <strong className="text-ink">{phoneNumber}</strong>. Enter it below to continue.</p>
        <button type="button" onClick={onEditNumber} className="mt-2 text-sm font-bold text-brand-purple">Edit phone number</button>
      </motion.div>

      <div className="mt-10">
        <label htmlFor="otp-code" className="mb-3 block text-center text-xs font-bold uppercase tracking-wider text-gray-400">6-digit verification code</label>
        <input id="otp-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="••••••" className="h-16 w-full rounded-2xl border border-gray-200 bg-gray-50 text-center text-3xl font-black tracking-[0.65em] text-brand-purple outline-none transition focus:border-brand-purple focus:bg-white focus:ring-4 focus:ring-brand-purple/10" />
        {devCode && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">Development mode code: <span className="font-black tracking-widest">{devCode}</span></p>}
        {error && <p role="alert" className="mt-3 text-center text-sm font-bold text-brand-red">{error}</p>}
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        Didn&apos;t receive a code?{' '}
        <button type="button" onClick={resend} disabled={seconds > 0 || resending} className="font-bold text-brand-purple disabled:text-gray-300">{resending ? 'Sending…' : seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}</button>
      </div>
      <div className="flex-1" />
      <div className="pb-4">
        <div className="mb-4 flex items-center justify-center gap-2 text-[11px] font-medium text-gray-400"><ShieldCheck size={14}/> Your number is used to secure your account.</div>
        <PillButton variant="orange" loading={busy} disabled={code.length !== 6 || busy} onClick={submit}>Verify and continue</PillButton>
      </div>
    </div>
  )
}
