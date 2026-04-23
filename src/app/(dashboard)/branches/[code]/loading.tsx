export default function BranchDetailLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-4 lg:px-8 pt-4 lg:pt-5 pb-3">
        <div className="h-3.5 w-32 bg-surface-hover/60 rounded animate-pulse" />
        <div className="mt-2 flex items-center gap-3">
          <div className="h-7 w-20 bg-surface-hover/60 rounded-md animate-pulse" />
          <div className="h-6 w-44 bg-surface-hover/60 rounded animate-pulse" />
        </div>
        <div className="mt-2 h-3.5 w-72 bg-surface-hover/40 rounded animate-pulse" />
      </header>

      <main className="px-4 lg:px-8 pb-12 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface-hover/40 rounded-[0.75rem] animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-surface-hover/40 rounded-[0.75rem] animate-pulse" />
        <div className="h-80 bg-surface-hover/40 rounded-[0.75rem] animate-pulse" />
      </main>
    </div>
  );
}
