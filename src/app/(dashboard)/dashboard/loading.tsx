function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-hover rounded-[0.5rem] ${className ?? ""}`} />
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-3 border-l-4 border-on-surface-variant/20 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)]">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

function ChartSkeleton({ tall }: { tall?: boolean }) {
  return (
    <div className={`bg-white rounded-[0.75rem] p-6 flex flex-col gap-4 border-l-4 border-on-surface-variant/20 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] ${tall ? "h-full" : ""}`}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="flex-1 min-h-56" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="flex-1 overflow-y-auto relative">
      {/* Indeterminate progress bar */}
      <div className="fixed top-0 left-0 right-0 h-0.75 bg-primary/10 overflow-hidden z-50">
        <div className="absolute h-full bg-primary" style={{ animation: "progress-indeterminate-1 2s infinite ease-in-out" }} />
        <div className="absolute h-full bg-primary/60" style={{ animation: "progress-indeterminate-2 2s 0.5s infinite ease-in-out" }} />
      </div>
      {/* Top bar placeholder — just spacer, real header is sticky */}
      <div className="px-8 pt-7 pb-5 flex items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-64" />
      </div>

      <main className="px-8 pb-16 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>

        {/* Row 2: trend + branch */}
        <div className="grid grid-cols-2 gap-4">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>

        {/* Row 3: salary breakdown + incentive hit rate */}
        <div className="grid grid-cols-2 gap-4">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>

        {/* Row 4: top dispatchers */}
        <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-4 border-l-4 border-on-surface-variant/20 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)]">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </main>
    </div>
  );
}
