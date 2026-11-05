export function ChatsHomeSkeleton() {
  return (
    <div className="flex h-full flex-col bg-white p-4">
      <div className="mb-4 h-8 w-32 animate-pulse rounded-lg bg-gray-200" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="mb-3 flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-gray-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-3/5 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  )
}
