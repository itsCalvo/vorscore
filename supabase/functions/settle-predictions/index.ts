import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// settle-predictions: sync due API fixtures and settle linked predictions (same pipeline as sync-fixtures).
const finishedStatuses = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const liveStatuses = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function lifecycleStatus(apiStatus: string) {
  if (finishedStatuses.has(apiStatus)) return 'finished';
  if (apiStatus === 'PST') return 'postponed';
  if (['CANC', 'ABD'].includes(apiStatus)) return 'cancelled';
  if (apiStatus === 'SUSP') return 'suspended';
  if (liveStatuses.has(apiStatus)) return 'live';
  return 'upcoming';
}

function isoToEatDate(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(date);
}

function nextSync(status: string, kickoff: string, intervalSeconds: number) {
  if (['finished', 'cancelled', 'postponed', 'suspended'].includes(status)) return null;
  const now = Date.now();
  const kickoffAt = new Date(kickoff).getTime();
  const hours = (kickoffAt - now) / 3600000;
  const adaptiveSeconds = status === 'live'
    ? intervalSeconds
    : hours <= 2
      ? Math.min(intervalSeconds * 2, 300)
      : Math.min(intervalSeconds * 5, 900);
  return new Date(now + adaptiveSeconds * 1000).toISOString();
}

function evaluateSelection(market: string | null, selection: string | null, homeScore: number, awayScore: number) {
  if (!market || !selection) return null;
  let win: boolean | null = null;
  if (market === '1X2') {
    const actual = homeScore > awayScore ? 'HOME' : homeScore < awayScore ? 'AWAY' : 'DRAW';
    win = actual === selection;
  } else if (market === 'GOALS') {
    const total = homeScore + awayScore;
    if (selection === 'OVER_2_5') win = total > 2.5;
    if (selection === 'UNDER_2_5') win = total < 2.5;
    if (selection === 'OVER_1_5') win = total > 1.5;
    if (selection === 'UNDER_1_5') win = total < 1.5;
    if (selection === 'OVER_0_5') win = total > 0.5;
    if (selection === 'UNDER_0_5') win = total < 0.5;
  } else if (market === 'BTTS') {
    const bothScored = homeScore > 0 && awayScore > 0;
    if (selection === 'YES') win = bothScored;
    if (selection === 'NO') win = !bothScored;
  }
  return win === null ? null : win ? 'WIN' : 'LOSS';
}

function parsePick(row: any) {
  if (row.market && row.selection) return { market: row.market, selection: row.selection };
  const raw = String(row.pick || '').trim();
  if (!raw) return { market: null, selection: null };
  if (raw.includes(':')) {
    const [market, selection] = raw.split(':');
    return { market, selection };
  }
  const upper = raw.toUpperCase();
  if (['HOME', 'DRAW', 'AWAY'].includes(upper)) return { market: '1X2', selection: upper };
  if (upper.includes('OVER') || upper.includes('UNDER')) {
    return { market: 'GOALS', selection: upper.replace(/\s+/g, '_') };
  }
  if (upper === 'GG YES' || upper === 'YES') return { market: 'BTTS', selection: 'YES' };
  if (upper === 'GG NO' || upper === 'NO') return { market: 'BTTS', selection: 'NO' };
  return { market: row.market || null, selection: raw };
}

Deno.serve(async request => {
  const expectedSecret = Deno.env.get('SYNC_SECRET');
  if (!expectedSecret || request.headers.get('x-sync-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('API_FOOTBALL_KEY');
  const configuredInterval = Number(Deno.env.get('TRACKING_INTERVAL_SECONDS') || 120);
  const trackingIntervalSeconds = Number.isFinite(configuredInterval) ? Math.max(60, configuredInterval) : 120;

  if (!supabaseUrl || !serviceRoleKey || !apiKey) return json({ error: 'Settlement is not configured.' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const nowIso = new Date().toISOString();

  const { data: fixtures, error: selectError } = await admin
    .from('fixtures')
    .select('*')
    .gt('fixture_id', 0)
    .not('next_sync_at', 'is', null)
    .lte('next_sync_at', nowIso)
    .limit(20);

  if (selectError) return json({ error: selectError.message }, 500);
  if (!fixtures?.length) return json({ synced: 0, settled: 0, api_requests: 0 });

  const ids = fixtures.map(row => row.fixture_id).join(',');
  const apiUrl = new URL('https://v3.football.api-sports.io/fixtures');
  apiUrl.searchParams.set('ids', ids);
  const apiResponse = await fetch(apiUrl, { headers: { 'x-apisports-key': apiKey } });
  const payload = await apiResponse.json();

  if (!apiResponse.ok || (payload.errors && Object.keys(payload.errors).length)) {
    return json({ error: 'API-Football request failed.', details: payload.errors || null }, 502);
  }

  const byId = new Map((payload.response || []).map((item: any) => [item.fixture?.id, item]));
  let synced = 0;
  let settled = 0;

  for (const fixture of fixtures) {
    const item: any = byId.get(fixture.fixture_id);
    if (!item) continue;

    const apiStatus = item.fixture?.status?.short || 'TBD';
    const status = lifecycleStatus(apiStatus);
    const homeScore = item.goals?.home ?? null;
    const awayScore = item.goals?.away ?? null;
    const kickoff = item.fixture?.date || fixture.kickoff;
    const syncedAt = new Date().toISOString();

    await admin.from('fixtures').update({
      fixture_date: isoToEatDate(kickoff) || fixture.fixture_date,
      kickoff,
      league: item.league?.name || fixture.league,
      country: item.league?.country || fixture.country,
      home_team: item.teams?.home?.name || fixture.home_team,
      away_team: item.teams?.away?.name || fixture.away_team,
      status,
      api_status: apiStatus,
      home_score: homeScore,
      away_score: awayScore,
      current_minute: item.fixture?.status?.elapsed ?? null,
      last_synced_at: syncedAt,
      next_sync_at: nextSync(status, kickoff, trackingIntervalSeconds),
      sync_error: null,
      updated_at: syncedAt,
    }).eq('fixture_id', fixture.fixture_id);
    synced++;

    const { data: predictions } = await admin
      .from('predictions')
      .select('id, market, selection, pick, verdict')
      .eq('fixture_id', fixture.fixture_id);

    if (status === 'finished' && homeScore != null && awayScore != null && predictions?.length) {
      for (const prediction of predictions) {
        const { market, selection } = parsePick(prediction);
        const verdict = evaluateSelection(market, selection, homeScore, awayScore);
        if (!verdict || prediction.verdict === 'WIN' || prediction.verdict === 'LOSS') continue;
        const { error } = await admin.from('predictions').update({
          verdict,
          result: verdict.toLowerCase(),
          final_status: apiStatus,
          home_score: homeScore,
          away_score: awayScore,
          status: 'finished',
          api_status: apiStatus,
          updated_at: syncedAt,
        }).eq('id', prediction.id);
        if (!error) settled++;
      }
    }
  }

  return json({ synced, settled, api_requests: 1 });
});
