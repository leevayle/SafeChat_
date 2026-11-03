/**
 * High-quality wireframe skeleton for Chats home.
 * Mirrors status strip + filter chips + chat rows with a soft diagonal shimmer sweep.
 */
export function ChatsHomeSkeleton() {
  // Varied widths so rows feel like real name/preview pairs (WhatsApp/Signal style)
  const rows: { name: string; preview: string; time: string; unread?: boolean }[] = [
    { name: 'w-[42%]', preview: 'w-[68%]', time: 'w-9', unread: true },
    { name: 'w-[36%]', preview: 'w-[52%]', time: 'w-8' },
    { name: 'w-[48%]', preview: 'w-[74%]', time: 'w-9', unread: true },
    { name: 'w-[31%]', preview: 'w-[58%]', time: 'w-8' },
    { name: 'w-[44%]', preview: 'w-[40%]', time: 'w-9' },
    { name: 'w-[38%]', preview: 'w-[66%]', time: 'w-8', unread: true },
    { name: 'w-[50%]', preview: 'w-[55%]', time: 'w-9' },
    { name: 'w-[34%]', preview: 'w-[72%]', time: 'w-8' },
  ]

  const statusSlots = [0, 1, 2, 3, 4, 5]

  return (
    <div className="min-h-0 flex-1 overflow-hidden" aria-hidden="true" role="presentation">
      {/* Status strip */}
      <div className="no-scrollbar flex gap-4 overflow-x-hidden border-b border-gray-100 px-5 pb-3 pt-3">
        {statusSlots.map((i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="sk-shimmer h-[54px] w-[54px] rounded-full" />
            <div className={`sk-shimmer h-2.5 rounded-full ${i % 2 === 0 ? 'w-12' : 'w-10'}`} />
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-3 px-5 pb-3 pt-3">
        <div className="sk-shimmer h-7 w-[76px] rounded-xl" />
        <div className="sk-shimmer h-7 w-[64px] rounded-xl" />
        <div className="sk-shimmer h-7 w-[58px] rounded-xl" />
      </div>

      {/* Chat rows */}
      <ul className="px-2">
        {rows.map((row, i) => (
          <li
            key={i}
            className="flex items-center gap-3 border-b border-gray-50 px-3 py-3.5 last:border-0"
          >
            <div className="sk-shimmer h-[52px] w-[52px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className={`sk-shimmer h-3.5 rounded-full ${row.name}`} />
                <div className={`sk-shimmer h-2.5 shrink-0 rounded-full ${row.time}`} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className={`sk-shimmer h-3 rounded-full ${row.preview}`} />
                {row.unread ? (
                  <div className="sk-shimmer h-5 w-5 shrink-0 rounded-full" />
                ) : (
                  <div className="h-5 w-5 shrink-0" />
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
