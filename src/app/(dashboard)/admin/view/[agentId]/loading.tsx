function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-hover rounded-[0.5rem] ${className ?? ""}`} />
  );
}

export default function AgentViewLoading() {
  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className="fixed top-0 left-0 right-0 h-0.75 bg-brand/10 overflow-hidden z-50">
        <div className="absolute h-full bg-brand" style={{ animation: "progress-indeterminate-1 2s infinite ease-in-out" }} />
        <div className="absolute h-full bg-brand/60" style={{ animation: "progress-indeterminate-2 2s 0.5s infinite ease-in-out" }} />
      </div>

      <div className="px-16 py-8 max-w-5xl mx-auto flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
