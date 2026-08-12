export function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-16 text-center">
      <p className="text-lg font-semibold text-zinc-300">No predictions available for today</p>
      <p className="mt-2 text-sm text-zinc-500">Check back later — the auto-picker runs daily.</p>
    </div>
  );
}
