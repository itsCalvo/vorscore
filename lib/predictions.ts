import { createSupabaseServerClient } from '@/lib/supabase';

export type Prediction = {
  id?: string;
  fixture_id?: number | null;
  fixture_date: string;
  kickoff?: string | null;
  league?: string | null;
  home_team: string;
  away_team: string;
  pick: string;
  confidence: number;
  category?: string | null;
  reason?: string | null;
  result?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  final_status?: string | null;
  verdict?: string | null;
  publication_status?: string | null;
  is_locked?: boolean;
  kickoff_time?: string | null;
  market?: string | null;
  selection?: string | null;
  fixtures?: {
    status?: string | null;
    api_status?: string | null;
    home_score?: number | null;
    away_score?: number | null;
    kickoff?: string | null;
    league?: string | null;
    home_team?: string | null;
    away_team?: string | null;
  } | null;
};

export type SplitPredictions = {
  betOfTheDay: Prediction | null;
  bankers: Prediction[];
  allPicks: Prediction[];
};

const EAT_TIMEZONE = 'Africa/Nairobi';
const FIXTURE_SELECT_TIERS = [
  'fixture_id, fixture_date, kickoff, league, home_team, away_team, status, api_status, home_score, away_score, current_minute, source',
  'fixture_id, fixture_date, kickoff, league, home_team, away_team, status, api_status, home_score, away_score',
  'fixture_id, kickoff, league, home_team, away_team, home_score, away_score, status, api_status',
];

export function todayFixtureDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EAT_TIMEZONE }).format(new Date());
}

function kenyaIsoDate(): string {
  const kenyaNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return kenyaNow.toISOString().slice(0, 10);
}

function predictionQueryDates(): string[] {
  const eat = todayFixtureDate();
  const kenya = kenyaIsoDate();
  const utc = new Date().toISOString().slice(0, 10);
  return [...new Set([eat, kenya, utc])];
}

function normalizeFixtureDate(value: unknown): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function isPublishedRow(row: Record<string, unknown>): boolean {
  return row.publication_status !== 'draft';
}

type FixtureRow = NonNullable<Prediction['fixtures']> & { fixture_id?: number | null };

async function attachFixturesToPredictions(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return rows;
  const ids = [...new Set(rows.map(row => row.fixture_id).filter(id => id != null))] as number[];
  if (!ids.length) return rows;

  let fixtures: FixtureRow[] = [];
  for (const select of FIXTURE_SELECT_TIERS) {
    const { data, error } = await supabase.from('fixtures').select(select).in('fixture_id', ids);
    if (!error) {
      fixtures = (data ?? []) as FixtureRow[];
      break;
    }
    if (!/column|42703/i.test(error.message || '')) break;
  }

  const byId = Object.fromEntries(fixtures.map(fixture => [String(fixture.fixture_id), fixture]));

  return rows.map(row => {
    const fixture = row.fixture_id != null ? byId[String(row.fixture_id)] : null;
    return fixture ? { ...row, fixtures: fixture } : row;
  });
}

function mapPredictionRow(row: Record<string, unknown>): Prediction {
  const fixtureRaw = row.fixtures as Prediction['fixtures'] | Prediction['fixtures'][] | null | undefined;
  const fixture = Array.isArray(fixtureRaw) ? (fixtureRaw[0] ?? null) : (fixtureRaw ?? null);
  return {
    ...(row as Prediction),
    home_team: String(fixture?.home_team ?? row.home_team ?? ''),
    away_team: String(fixture?.away_team ?? row.away_team ?? ''),
    league: (fixture?.league ?? row.league) as string | null,
    home_score: (fixture?.home_score ?? row.home_score) as number | null,
    away_score: (fixture?.away_score ?? row.away_score) as number | null,
    final_status: (fixture?.api_status ?? fixture?.status ?? row.final_status ?? row.api_status) as string | null,
  };
}

export async function getTodayPredictions(): Promise<Prediction[]> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return [];

  async function fetchByDate(date: string) {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('fixture_date', date)
      .order('confidence', { ascending: false });

    if (error) {
      console.error('Failed to load predictions:', error.message);
      return null;
    }

    const published = (data ?? []).filter(isPublishedRow);
    const enriched = await attachFixturesToPredictions(supabase, published);
    return enriched.map(row => mapPredictionRow(row));
  }

  let rows: Prediction[] = [];
  for (const date of predictionQueryDates()) {
    const batch = await fetchByDate(date);
    if (batch === null) return [];
    if (batch.length) {
      rows = batch;
      break;
    }
  }

  if (!rows.length) {
    const { data: all, error } = await supabase
      .from('predictions')
      .select('*')
      .order('confidence', { ascending: false })
      .limit(100);

    if (!error && all?.length) {
      const enriched = await attachFixturesToPredictions(supabase, all.filter(isPublishedRow));
      const eatToday = todayFixtureDate();
      rows = enriched
        .map(row => mapPredictionRow(row))
        .filter(row => normalizeFixtureDate(row.fixture_date) === eatToday);
      if (!rows.length) {
        const latestDate = enriched.reduce((max, row) => {
          const d = normalizeFixtureDate((row as Prediction).fixture_date);
          return d > max ? d : max;
        }, '');
        rows = enriched
          .map(row => mapPredictionRow(row))
          .filter(row => normalizeFixtureDate(row.fixture_date) === latestDate);
      }
    }
  }

  return rows;
}

export async function getHistoryPredictions(): Promise<Prediction[]> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return [];

  const today = todayFixtureDate();
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .lt('fixture_date', today)
    .order('fixture_date', { ascending: false })
    .order('kickoff', { ascending: false })
    .limit(500);

  if (error || !data) return [];
  const enriched = await attachFixturesToPredictions(supabase, data.filter(isPublishedRow));
  return enriched.map(row => mapPredictionRow(row));
}

export function splitPredictions(predictions: Prediction[]): SplitPredictions {
  return {
    betOfTheDay: predictions[0] ?? null,
    bankers: predictions.filter(p => p.category === 'bankers' || p.category === 'banker'),
    allPicks: predictions.slice(1),
  };
}

export function formatCategory(category?: string | null): string {
  if (!category) return '—';
  if (category === 'bankers') return 'Banker';
  if (category === 'all-picks') return 'All Picks';
  return category.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function predictionKey(prediction: Prediction, index: number): string {
  return String(prediction.id ?? prediction.fixture_id ?? `${prediction.home_team}-${prediction.away_team}-${index}`);
}
