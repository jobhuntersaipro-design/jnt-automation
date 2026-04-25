function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-hover rounded-[0.5rem] ${className ?? ""}`} />
  );
}

export default function AdminLoading() {
  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className="fixed top-0 left-0 right-0 h-0.75 bg-brand/10 overflow-hidden z-50">
        <div className="absolute h-full bg-brand" style={{ animation: "progress-indeterminate-1 2s infinite ease-in-out" }} />
        <div className="absolute h-full bg-brand/60" style={{ animation: "progress-indeterminate-2 2s 0.5s infinite ease-in-out" }} />
      </div>

      <div className="px-4 lg:px-16 py-6 lg:py-8 max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>

        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
        </div>

        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface-card rounded-lg border border-outline-variant/15 p-5 flex items-center gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}
