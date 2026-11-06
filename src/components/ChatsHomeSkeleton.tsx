/** Home chats skeleton — real row layout + diagonal shimmer sweep. */
export function ChatsHomeSkeleton() {
  return (
    <div className="px-2 pt-1">
      <div className="mb-2 flex gap-1.5 px-2">
        <div className="sk-shimmer h-7 w-[4.5rem] rounded-full" />
        <div className="sk-shimmer h-7 w-16 rounded-full" />
        <div className="sk-shimmer h-7 w-14 rounded-full" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-3">
          <div className="sk-shimmer h-[52px] w-[52px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div
                className="sk-shimmer h-3.5 rounded"
                style={{ width: `${38 + (i % 3) * 10}%` }}
              />
              <div className="sk-shimmer h-2.5 w-10 rounded" />
            </div>
            <div
              className="sk-shimmer h-3 rounded"
              style={{ width: `${55 + (i % 4) * 8}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
