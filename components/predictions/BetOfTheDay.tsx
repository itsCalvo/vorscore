import { formatKickoff } from '@/lib/format-kickoff';
import type { Prediction } from '@/lib/predictions';
import { ConfidenceBadge } from './ConfidenceBadge';

type BetOfTheDayProps = {
  prediction: Prediction;
};

export function BetOfTheDay({ prediction }: BetOfTheDayProps) {
  function getMatchStatus(match?: any) {
    const status = (
      match?.fixture_status || match?.final_status || match?.status || 'upcoming'
    ).toString().toLowerCase();

    switch (status) {
      case 'live':
        return { label: '🔴 LIVE', className: 'status-live' };
      case 'finished':
      case 'ft':
        return { label: '🏁 FINISHED', className: 'status-finished' };
      default:
        return { label: '⏳ UPCOMING', className: 'status-upcoming' };
    }
  }
  const getPredictionResult = (m?: any) => {
    const outcome = (m?.verdict || m?.result || '')?.toString().toUpperCase();
    if (outcome === 'WIN') return { label: '✅ WIN', className: 'result-win' };
    if (outcome === 'LOSS') return { label: '❌ LOSS', className: 'result-loss' };
    return { label: '⏳ PENDING', className: 'result-pending' };
  };
  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-950 p-6 shadow-lg shadow-amber-500/5 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
          Bet of the Day
        </span>
        <ConfidenceBadge confidence={prediction.confidence} variant="gold" />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-400">{prediction.league ?? '—'}</p>
        <h2 className="text-2xl font-bold text-white sm:text-3xl">
          {prediction.home_team}
          <span className="mx-2 text-base font-normal text-zinc-500">vs</span>
          {prediction.away_team}
        </h2>
        {prediction.home_score != null && prediction.away_score != null ? (
          <div className="text-sm text-zinc-300">{`${prediction.home_score} : ${prediction.away_score}`}</div>
        ) : null}
        {(() => {
          const s = getMatchStatus(prediction as any);
          return <div className={`text-sm text-zinc-300 ${s.className}`}>{s.label}</div>;
        })()}
        <div className="text-sm text-zinc-300">{getPredictionResult(prediction as any).label}</div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-300">
          <span className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 font-semibold text-amber-300">
            Pick: {prediction.pick ?? '—'}
          </span>
          <span>{formatKickoff(prediction.kickoff ?? '')}</span>
        </div>
        {prediction.reason ? (
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{prediction.reason}</p>
        ) : null}
      </div>
    </section>
  );
}
