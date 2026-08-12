import { formatKickoff } from '@/lib/format-kickoff';
import { predictionKey, type Prediction } from '@/lib/predictions';
import { ConfidenceBadge } from './ConfidenceBadge';

type BankersGridProps = {
  bankers: Prediction[];
};

export function BankersGrid({ bankers }: BankersGridProps) {
  if (!bankers.length) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white">Bankers</h2>
        <span className="text-xs uppercase tracking-wide text-zinc-500">{bankers.length} picks</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {bankers.map((banker, index) => (
          <article
            key={predictionKey(banker, index)}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-emerald-500/30 hover:bg-zinc-900"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{banker.league ?? '—'}</p>
              <ConfidenceBadge confidence={banker.confidence} variant="green" />
            </div>
            <h3 className="text-base font-semibold text-white">
              {banker.home_team} <span className="font-normal text-zinc-500">vs</span> {banker.away_team}
            </h3>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-300">
                {banker.pick}
              </span>
              <span className="text-zinc-400">{formatKickoff(banker.kickoff ?? '')}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
