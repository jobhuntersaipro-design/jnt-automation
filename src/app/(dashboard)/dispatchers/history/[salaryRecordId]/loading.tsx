export default function Loading() {
  return (
    <main className="flex-1 overflow-y-auto px-4 lg:px-16 py-6 lg:py-8">
      <div className="flex flex-col gap-5">
        <div className="h-6 w-40 bg-surface-hover/60 rounded animate-pulse" />
        <div className="h-20 bg-surface-hover/50 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-surface-hover/50 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-60 bg-surface-hover/50 rounded-xl animate-pulse" />
        <div className="h-96 bg-surface-hover/50 rounded-xl animate-pulse" />
      </div>
    </main>
  );
}
