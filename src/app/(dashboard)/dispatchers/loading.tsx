function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-hover rounded-[0.5rem] ${className ?? ""}`} />
  );
}

export default function DispatchersLoading() {
  return (
    <div className="flex-1 overflow-y-auto relative">
      {/* Indeterminate progress bar */}
      <div className="fixed top-0 left-0 right-0 h-0.75 bg-brand/10 overflow-hidden z-50">
        <div className="absolute h-full bg-brand" style={{ animation: "progress-indeterminate-1 2s infinite ease-in-out" }} />
        <div className="absolute h-full bg-brand/60" style={{ animation: "progress-indeterminate-2 2s 0.5s infinite ease-in-out" }} />
      </div>

      {/* Header placeholder */}
      <div className="px-8 pt-5 pb-4 flex items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Filters placeholder */}
      <div className="px-8 pb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-52" />
        <div className="ml-auto">
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      {/* Table placeholder */}
      <div className="px-8">
        <div className="bg-white rounded-[0.75rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)]">
          {/* Header row */}
          <div className="px-6 py-3 flex gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
          {/* Data rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-6 py-[0.9rem] flex items-center gap-4">
              <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-14 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
