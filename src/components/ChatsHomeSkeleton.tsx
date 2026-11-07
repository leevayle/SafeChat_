export function ChatsHomeSkeleton() {
  return (
    <div className="flex h-full flex-col bg-white px-4 pt-3">
      <style>{`
        @keyframes sc-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .sc-shim {
          background: linear-gradient(90deg, #eceff3 25%, #f7f8fa 37%, #eceff3 63%);
          background-size: 800px 100%;
          animation: sc-shimmer 1.25s ease-in-out infinite;
        }
      `}</style>
      <div className="mb-4 h-9 w-36 rounded-xl sc-shim" />
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="mb-3.5 flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-full sc-shim" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="h-3 rounded sc-shim" style={{ width: `${48 + (i % 3) * 12}%` }} />
              <div className="h-2.5 w-10 shrink-0 rounded sc-shim" />
            </div>
            <div className="h-3 rounded sc-shim" style={{ width: `${38 + (i % 4) * 10}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
