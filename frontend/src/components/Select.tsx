import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export type SelectOption = {
  value: string
  label: string
  description?: string
}

type Props = {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

/** Modern custom dropdown — replaces bare <select> across the app. */
export function Select({
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  className = '',
  disabled = false,
  size = 'md',
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2.5 text-sm'

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-2xl bg-gray-50 font-extrabold text-ink outline-none ring-1 ring-black/[0.06] transition hover:bg-gray-100 focus:ring-brand-purple/30 disabled:opacity-50 ${pad}`}
      >
        <span className={`min-w-0 flex-1 truncate text-left ${selected ? '' : 'text-gray-400'}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          size={size === 'sm' ? 14 : 16}
          className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-56 overflow-y-auto rounded-2xl bg-white py-1.5 shadow-xl ring-1 ring-black/8"
        >
          {options.map((o) => {
            const active = o.value === value
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-bold transition ${
                    active ? 'bg-brand-purple/8 text-brand-purple' : 'text-ink hover:bg-gray-50'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{o.label}</span>
                    {o.description ? (
                      <span className="block text-[11px] font-semibold text-gray-400">{o.description}</span>
                    ) : null}
                  </span>
                  {active ? <Check size={16} className="shrink-0 text-brand-purple" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
