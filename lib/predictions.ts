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
};

export type SplitPredictions = {
  betOfTheDay: Prediction | null;
  bankers: Prediction[];
  allPicks: Prediction[];
};

const EAT_TIMEZONE = 'Africa/Nairobi';

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

export async function getTodayPredictions(): Promise<Prediction[]> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return [];

  async function fetchByDate(date: string) {
    const { data, error } = await supabase
      .from('predictions')
      .select(`id, fixture_id, fixture_date, kickoff, league, home_team, away_team, pick, confidence, category, reason, result, home_score, away_score, final_status, verdict, fixtures ( status, api_status, home_score, away_score )`)
      .eq('fixture_date', date)
      .order('confidence', { ascending: false });

    if (error) {
      console.error('Failed to load predictions:', error.message);
      return null;
    }
    console.log('[VorScore] prediction row sample', data?.[0]);

    return (data ?? []) as Prediction[];
  }

  let rows: Prediction[] = [];
  for (const date of predictionQueryDates()) {
    const batch = await fetchByDate(date);
    if (batch === null) return [];
    if (batch.length) {
      // prefer fixture-joined values when present
      rows = (batch as any[]).map(r => ({
        ...r,
        fixture_status: (r.fixtures as any)?.status ?? r.status,
        api_status: (r.fixtures as any)?.api_status ?? r.api_status,
        home_score: (r.fixtures as any)?.home_score ?? r.home_score,
        away_score: (r.fixtures as any)?.away_score ?? r.away_score,
      }));
      break;
    }
  }

  if (!rows.length) {
    const { data: all, error } = await supabase
      .from('predictions')
      .select(`id, fixture_id, fixture_date, kickoff, league, home_team, away_team, pick, confidence, category, reason, result, home_score, away_score, final_status, verdict, fixtures ( status, api_status, home_score, away_score )`)
      .order('confidence', { ascending: false })
      .limit(100);

    if (!error && all?.length) {
      console.log('[VorScore] prediction row sample', all?.[0]);
      const eatToday = todayFixtureDate();
      rows = all.filter(row => normalizeFixtureDate(row.fixture_date) === eatToday) as Prediction[];
      if (!rows.length) {
        const latestDate = all.reduce((max, row) => {
          const d = normalizeFixtureDate(row.fixture_date);
          return d > max ? d : max;
        }, '');
        rows = all.filter(row => normalizeFixtureDate(row.fixture_date) === latestDate) as Prediction[];
      }
    }
  }

  return rows;
}

export function splitPredictions(predictions: Prediction[]): SplitPredictions {
  return {
    betOfTheDay: predictions[0] ?? null,
    bankers: predictions.filter(p => p.category === 'bankers'),
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
