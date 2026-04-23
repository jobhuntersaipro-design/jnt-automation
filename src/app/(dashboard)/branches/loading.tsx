export default function BranchesLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-4 lg:px-8 pt-4 lg:pt-5 pb-3">
        <div className="h-6 w-32 bg-surface-hover/60 rounded animate-pulse" />
        <div className="mt-2 h-3.5 w-72 bg-surface-hover/40 rounded animate-pulse" />
      </header>
      <main className="px-4 lg:px-8 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 bg-surface-hover/40 rounded-[0.75rem] animate-pulse"
            />
          ))}
        </div>
      </main>
    </div>
  );
}
