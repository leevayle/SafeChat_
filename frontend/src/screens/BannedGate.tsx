import { useState } from 'react'
import { ShieldBan, LifeBuoy, LogOut, MessageCircle } from 'lucide-react'
import { LogoIcon, Wordmark } from '../components/Logo'

type Props = {
  reason?: string | null
  onAppeal: (prefill: { subject: string; body: string }) => void
  onLimitedAccess: () => void
  onLogout: () => void
}

/**
 * Shown after a successful login when account_status === 'banned'.
 * User may appeal (opens Support with a prefilled ticket) or continue
 * in limited mode (read chats only; messaging blocked server-side).
 */
export function BannedGate({ reason, onAppeal, onLimitedAccess, onLogout }: Props) {
  const [busy, setBusy] = useState(false)
  const appealBody =
    `I would like to appeal my SafeChat ban.\n\n` +
    `Ban reason shown to me: ${reason?.trim() || 'No reason was provided.'}\n\n` +
    `Please review my account. Additional context:\n`

  return (
    <div className="flex h-full min-h-dvh flex-col items-center justify-center bg-white px-6 dark:bg-[#0b141a]">
      <div className="mb-4 flex flex-col items-center gap-2">
        <LogoIcon size={72} animate={false} />
        <Wordmark className="text-2xl leading-none" />
      </div>
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
        <ShieldBan size={28} />
      </div>
      <p className="text-xl font-black text-ink dark:text-gray-100">You have been banned from SafeChat</p>
      <p className="mt-2 max-w-sm text-center text-sm font-semibold text-gray-500 dark:text-gray-400">
        You can still browse the app, but sending messages, calls, new chats, groups, status posts, and similar actions are blocked. Contact customer care to appeal.
      </p>
      {reason?.trim() ? (
        <div className="mt-4 w-full max-w-sm rounded-2xl bg-gray-50 px-4 py-3 text-left ring-1 ring-black/5 dark:bg-[#1a222d] dark:ring-white/10">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-400">Reason</p>
          <p className="mt-1 text-sm font-semibold text-ink dark:text-gray-200">{reason}</p>
        </div>
      ) : null}
      <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5">
        <button
          type="button"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white"
          onClick={() => {
            setBusy(true)
            onAppeal({ subject: 'Appeal: account ban', body: appealBody })
            setBusy(false)
          }}
        >
          <LifeBuoy size={18} /> Appeal ban
        </button>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-100 py-3.5 text-sm font-extrabold text-ink dark:bg-[#1f2c34] dark:text-gray-100"
          onClick={onLimitedAccess}
        >
          <MessageCircle size={18} /> Continue with limited access
        </button>
        <button
          type="button"
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-gray-500"
          onClick={onLogout}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  )
}
