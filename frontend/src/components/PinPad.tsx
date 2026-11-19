import { useState } from 'react'
import { Delete, Lock } from 'lucide-react'

/** Modern PIN pad — digits as dots, theme-colored keys, no text field. */
export function PinPad({
  title = 'Enter PIN',
  subtitle,
  mode = 'unlock',
  length = 4,
  onComplete,
  onCancel,
}: {
  title?: string
  subtitle?: string
  mode?: 'unlock' | 'set' | 'confirm'
  length?: number
  onComplete: (pin: string) => void | boolean | Promise<void | boolean>
  onCancel?: () => void
}) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const press = async (d: string) => {
    if (busy) return
    setError('')
    if (d === 'del') {
      setDigits((x) => x.slice(0, -1))
      return
    }
    if (digits.length >= length) return
    const next = digits + d
    setDigits(next)
    if (next.length === length) {
      setBusy(true)
      try {
        const ok = await onComplete(next)
        if (ok === false) {
          setError(mode === 'unlock' ? 'Wrong PIN' : 'Try again')
          setDigits('')
        }
      } catch {
        setError('Something went wrong')
        setDigits('')
      } finally {
        setBusy(false)
      }
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-8 safe-pt safe-pb">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple/12 text-brand-purple">
        <Lock size={26} />
      </div>
      <h2 className="text-xl font-black text-ink">{title}</h2>
      {subtitle ? (
        <p className="mt-1.5 max-w-[260px] text-center text-sm font-semibold text-gray-400">{subtitle}</p>
      ) : null}

      <div className="mt-8 flex items-center gap-3">
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full transition ${
              i < digits.length
                ? 'scale-110 bg-brand-purple shadow-[0_0_0_4px_rgba(123,44,191,0.15)]'
                : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {error ? <p className="mt-3 text-sm font-bold text-brand-red">{error}</p> : <div className="mt-3 h-5" />}

      <div className="mt-8 grid w-full max-w-[280px] grid-cols-3 gap-3">
        {keys.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={busy}
              onClick={() => void press(k)}
              className={`flex h-16 items-center justify-center rounded-2xl text-xl font-black transition active:scale-95 ${
                k === 'del'
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/15'
              }`}
            >
              {k === 'del' ? <Delete size={22} /> : k}
            </button>
          ),
        )}
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-8 text-sm font-bold text-gray-400 hover:text-brand-purple"
        >
          Cancel
        </button>
      )}
    </div>
  )
}
