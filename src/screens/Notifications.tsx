import { ScreenHeader } from '../components/ui'

type Props = { onBack: () => void }

const SYSTEM = [
  {
    id: '1',
    title: 'System update',
    body: 'SafeChat performance improvements are rolling out this week.',
    when: 'Today',
  },
  {
    id: '2',
    title: 'Scheduled maintenance',
    body: 'Brief maintenance window may occur Sunday 02:00–03:00 local time.',
    when: 'This week',
  },
  {
    id: '3',
    title: 'Subscription',
    body: 'Premium renews automatically unless cancelled. Manage plan in Settings → Membership.',
    when: 'Info',
  },
]

export function Notifications({ onBack }: Props) {
  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader title="Notifications" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2">
        {SYSTEM.map((n) => (
          <div key={n.id} className="mb-2 rounded-2xl bg-gray-50 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-extrabold text-ink">{n.title}</p>
              <span className="shrink-0 text-[11px] font-bold text-gray-400">{n.when}</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-gray-600">{n.body}</p>
          </div>
        ))}
        <p className="mt-6 text-center text-xs font-semibold text-gray-400">
          Save requests appear under Contacts · Save requests — not here.
        </p>
      </div>
    </div>
  )
}
