const FINISHED_API_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

export function isMatchFinished(match: {
  status?: string | null;
  api_status?: string | null;
  match_date?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  score?: string | null;
}): boolean {
  if (match.status === 'finished' || FINISHED_API_STATUSES.has(match.api_status ?? '')) {
    return true;
  }
  const scores = matchScores(match);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  return scores.home != null && Boolean(match.match_date && match.match_date < today);
}

export function matchScores(match: {
  home_score?: number | null;
  away_score?: number | null;
  score?: string | null;
}): { home: number | null; away: number | null } {
  if (match.home_score != null && match.away_score != null) {
    return { home: Number(match.home_score), away: Number(match.away_score) };
  }
  if (match.score) {
    const parts = String(match.score).match(/(\d+)\s*[:-\u2013]\s*(\d+)/);
    if (parts) return { home: Number(parts[1]), away: Number(parts[2]) };
  }
  return { home: null, away: null };
}

export function historyDisplayStatus(match: {
  status?: string | null;
  api_status?: string | null;
}): string {
  return isMatchFinished(match) ? 'FT' : match.api_status ?? '—';
}

export async function enrichMatchesFromFixtures<T extends Record<string, unknown>>(
  supabase: { from: (table: string) => any },
  matches: T[],
): Promise<T[]> {
  if (!matches.length) return matches;

  const ids = [...new Set(matches.map(match => match.external_match_id ?? match.fixture_id).filter(Boolean))];
  if (!ids.length) return matches;

  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select('fixture_id, home_score, away_score, status, api_status')
    .in('fixture_id', ids);

  if (error || !fixtures?.length) return matches;

  const byId = Object.fromEntries(fixtures.map((fixture: any) => [String(fixture.fixture_id), fixture]));
  return matches.map(match => {
    const fixture = byId[String(match.external_match_id ?? match.fixture_id)];
    if (!fixture) return match;

    return {
      ...match,
      home_score: fixture.home_score ?? match.home_score,
      away_score: fixture.away_score ?? match.away_score,
      status: fixture.status ?? match.status,
      api_status: fixture.api_status ?? match.api_status,
      score:
        fixture.home_score != null && fixture.away_score != null
          ? `${fixture.home_score} : ${fixture.away_score}`
          : match.score,
    };
  });
}
