function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-hover rounded-[0.5rem] ${className ?? ""}`} />
  );
}

export default function SettingsLoading() {
  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className="fixed top-0 left-0 right-0 h-0.75 bg-brand/10 overflow-hidden z-50">
        <div className="absolute h-full bg-brand" style={{ animation: "progress-indeterminate-1 2s infinite ease-in-out" }} />
        <div className="absolute h-full bg-brand/60" style={{ animation: "progress-indeterminate-2 2s 0.5s infinite ease-in-out" }} />
      </div>

      <div className="max-w-2xl mx-auto py-10 px-6 flex flex-col gap-10">
        <Skeleton className="h-8 w-28" />

        <div className="bg-surface-card rounded-lg p-6 flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Skeleton className="w-14 h-14 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-20 ml-auto" />
        </div>

        <div className="bg-surface-card rounded-lg p-6 flex flex-col gap-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
