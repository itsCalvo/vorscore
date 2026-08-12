import { formatKickoff } from '@/lib/format-kickoff';
import { formatCategory, predictionKey, type Prediction } from '@/lib/predictions';
import { ConfidenceBadge } from './ConfidenceBadge';

type AllPicksTableProps = {
  picks: Prediction[];
};

export function AllPicksTable({ picks }: AllPicksTableProps) {
  if (!picks.length) return null;

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
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white">All Picks</h2>
        <span className="text-xs uppercase tracking-wide text-zinc-500">{picks.length} total</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Time (EAT)</th>
              <th className="px-4 py-3">League</th>
              <th className="px-4 py-3">Match</th>
              <th className="px-4 py-3">Pick</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Category</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((pick, index) => (
              <tr
                key={predictionKey(pick, index)}
                className="border-t border-zinc-800/80 bg-zinc-950/40 hover:bg-zinc-900/50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-zinc-300">{formatKickoff(pick.kickoff ?? '')}</td>
                <td className="px-4 py-3 text-zinc-400">{pick.league ?? '—'}</td>
                <td className="px-4 py-3 font-medium text-white">
                  {pick.home_team} <span className="font-normal text-zinc-500">vs</span> {pick.away_team}
                  {pick.home_score != null && pick.away_score != null ? (
                    <div className="mt-1 text-sm text-zinc-400">{`${pick.home_score} : ${pick.away_score}`}</div>
                  ) : null}
                  {(() => {
                    const s = getMatchStatus(pick as any);
                    return (
                      <div className={`mt-1 text-sm text-zinc-400 ${s.className}`}>{s.label}</div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-semibold text-amber-300">
                    {pick.pick ?? '—'}
                  </span>
                  {(() => {
                    const res = getPredictionResult(pick as any);
                    return res ? <div className="mt-1 text-sm text-zinc-300">{res.label}</div> : null;
                  })()}
                </td>
                <td className="px-4 py-3">
                  <ConfidenceBadge confidence={pick.confidence} />
                </td>
                <td className="px-4 py-3 capitalize text-zinc-400">{formatCategory(pick.category)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
