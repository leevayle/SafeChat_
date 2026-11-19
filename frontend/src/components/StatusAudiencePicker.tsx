import { Check } from 'lucide-react'
import type { ApiContact } from '../api'
import { Avatar } from './Avatar'

export function StatusAudiencePicker({
  contacts,
  selectedIds,
  onChange,
}: {
  contacts: ApiContact[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const selected = new Set(selectedIds)

  if (!contacts.length) {
    return (
      <p className="rounded-2xl bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500 dark:bg-white/5">
        Accept a save request or add a contact before choosing a status audience.
      </p>
    )
  }

  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-gray-50 p-2 dark:bg-white/5">
      {contacts.map((contact) => {
        const id = contact.peerId || contact.id
        const checked = selected.has(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() =>
              onChange(
                checked
                  ? selectedIds.filter((selectedId) => selectedId !== id)
                  : [...selectedIds, id],
              )
            }
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white dark:hover:bg-white/5"
          >
            <Avatar contact={contact} size={36} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink dark:text-white">
              {contact.name}
            </span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                checked
                  ? 'border-brand-purple bg-brand-purple text-white'
                  : 'border-gray-300 dark:border-white/30'
              }`}
            >
              {checked && <Check size={13} strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
