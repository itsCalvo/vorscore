export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 h-9 w-56 animate-pulse rounded-lg bg-zinc-800" />
      <div className="mb-8 h-44 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60" />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map(item => (
          <div key={item} className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60" />
      <p className="mt-6 text-center text-sm text-zinc-500">Loading today&apos;s predictions…</p>
    </main>
  );
}
