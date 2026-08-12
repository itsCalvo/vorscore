import { EmptyState } from '@/components/predictions/EmptyState';
import { PicksView } from '@/components/predictions/PicksView';
import { getTodayPredictions, splitPredictions } from '@/lib/predictions';

export default async function HomePage() {
  const predictions = await getTodayPredictions();
  const split = splitPredictions(predictions);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">VorScore</p>
        <h1 className="mt-1 text-3xl font-bold text-white">Today&apos;s Picks</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Bet of the Day · Bankers · All Picks — live from your Supabase `predictions` table
        </p>
      </header>

      {!predictions.length ? (
        <EmptyState />
      ) : (
        <>
          <p className="mb-6 text-xs uppercase tracking-wide text-zinc-500">
            {predictions.length} predictions · highest confidence first
          </p>
          <PicksView {...split} />
        </>
      )}
    </main>
  );
}
