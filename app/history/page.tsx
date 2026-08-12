import { createClient } from '@supabase/supabase-js';
import {
  enrichMatchesFromFixtures,
  historyDisplayStatus,
  isMatchFinished,
  matchScores,
} from '@/lib/match-helpers';
import { resolveResult } from '@/lib/resolve-result';

type HistoryTip = {
  fixture_id: string | number;
  match_date: string;
  time_eat: string;
  league: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  score?: string | null;
  pick: string;
  status: string;
  api_status: string | null;
};

const PICK_LABELS: Record<string, string> = {
  OVER_0_5: 'OVER 0.5',
  OVER_1_5: 'OVER 1.5',
  OVER_2_5: 'OVER 2.5',
  UNDER_0_5: 'UNDER 0.5',
  UNDER_1_5: 'UNDER 1.5',
  UNDER_2_5: 'UNDER 2.5',
  YES: 'GG YES',
  NO: 'GG NO',
  HOME: 'HOME',
  DRAW: 'DRAW',
  AWAY: 'AWAY',
};

function pickLabel(market?: string | null, selection?: string | null): string {
  if (!selection) return '—';
  if (market === '1X2') return PICK_LABELS[selection] || selection.replaceAll('_', ' ');
  if (market === 'GOALS') return PICK_LABELS[selection] || selection.replaceAll('_', ' ');
  if (market === 'BTTS') return PICK_LABELS[selection] || selection.replaceAll('_', ' ');
  return PICK_LABELS[selection] || selection.replaceAll('_', ' ');
}

function formatKickoffEat(kickoffTime?: string | null): string {
  if (!kickoffTime) return '—';
  return kickoffTime.includes('EAT') ? kickoffTime : `${kickoffTime} EAT`;
}

function formatHistoryDateHeading(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const label = d.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Nairobi',
  });
  return `${label} · ${dateStr}`;
}

function toHistoryTip(row: Record<string, unknown>): HistoryTip {
  const isLocked = Boolean(row.is_locked);
  const market = row.prediction_market as string | null | undefined;
  const selection = row.prediction_selection as string | null | undefined;
  const pick = isLocked ? '🔒 Subscriber pick' : pickLabel(market, selection);

  return {
    fixture_id: (row.external_match_id ?? row.fixture_id ?? row.id) as string | number,
    match_date: String(row.match_date ?? ''),
    time_eat: formatKickoffEat(row.kickoff_time as string | null),
    league: (row.league as string | null) ?? null,
    home_team: String(row.home_team ?? ''),
    away_team: String(row.away_team ?? ''),
    home_score: row.home_score as number | null,
    away_score: row.away_score as number | null,
    score: row.score as string | null,
    pick,
    status: String(row.status ?? 'upcoming'),
    api_status: (row.api_status as string | null) ?? null,
  };
}

function verdictClassName(verdict: string): string {
  if (verdict.includes('WIN')) return 'text-green-600 font-semibold';
  if (verdict.includes('LOSS')) return 'text-red-600 font-semibold';
  if (verdict.includes('Locked')) return 'text-gray-500 font-semibold';
  return 'text-yellow-600 font-semibold';
}

function groupByDate(history: HistoryTip[]): [string, HistoryTip[]][] {
  const groups = history.reduce<Record<string, HistoryTip[]>>((byDate, tip) => {
    (byDate[tip.match_date] ||= []).push(tip);
    return byDate;
  }, {});
  return Object.entries(groups).sort(([left], [right]) => right.localeCompare(left));
}

async function loadHistory(): Promise<HistoryTip[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());

  const { data, error } = await supabase
    .from('matches')
    .select(
      'id, external_match_id, match_date, kickoff_time, league, home_team, away_team, home_score, away_score, status, api_status, is_locked, prediction_market, prediction_selection, publication_status',
    )
    .neq('publication_status', 'draft')
    .or(`status.eq.finished,match_date.lt.${today}`)
    .order('match_date', { ascending: false })
    .order('kickoff_time', { ascending: false });

  if (error || !data) return [];
  const enriched = await enrichMatchesFromFixtures(supabase, data as Record<string, unknown>[]);
  return enriched.map(row => toHistoryTip(row));
}

function HistoryTable({ tips }: { tips: HistoryTip[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
        <tr>
          <th className="px-4 py-3">Time (EAT)</th>
          <th className="px-4 py-3">League</th>
          <th className="px-4 py-3">Match</th>
          <th className="px-4 py-3">Score</th>
          <th className="px-4 py-3">Pick</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Result</th>
        </tr>
      </thead>
      <tbody>
        {tips.map(tip => {
          const scores = matchScores(tip);
          const effectiveStatus = isMatchFinished(tip) ? 'finished' : tip.status;
          const verdict = resolveResult(
            tip.pick,
            scores.home,
            scores.away,
            effectiveStatus,
            tip.pick.includes('Subscriber pick'),
          );
          const displayStatus = historyDisplayStatus(tip);
          const color = verdictClassName(verdict);

          return (
            <tr key={String(tip.fixture_id)} className="border-t border-gray-100">
              <td className="px-4 py-3">{tip.time_eat}</td>
              <td className="px-4 py-3">{tip.league ?? '—'}</td>
              <td className="px-4 py-3">
                <strong>{tip.home_team}</strong> vs <strong>{tip.away_team}</strong>
              </td>
              <td className="px-4 py-3">
                {scores.home != null ? `${scores.home} : ${scores.away}` : '—'}
              </td>
              <td className="px-4 py-3">{tip.pick}</td>
              <td className="px-4 py-3">{displayStatus}</td>
              <td className={`px-4 py-3 ${color}`}>{verdict}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function HistoryPage() {
  const history = await loadHistory();
  const grouped = groupByDate(history);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-3xl font-bold">History</h1>

      {grouped.length === 0 ? (
        <p className="text-gray-500">No finished predictions yet.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(([date, tips]) => (
            <section key={date}>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold">{formatHistoryDateHeading(date)}</h2>
                <span className="text-xs uppercase tracking-wide text-gray-500">
                  {tips.length} {tips.length === 1 ? 'pick' : 'picks'}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <HistoryTable tips={tips} />
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
