import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const finishedStatuses = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const liveStatuses = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function lifecycleStatus(apiStatus: string) {
  if (finishedStatuses.has(apiStatus)) return 'finished';
  if (apiStatus === 'PST') return 'postponed';
  if (apiStatus === 'CANC') return 'cancelled';
  if (apiStatus === 'SUSP') return 'suspended';
  if (apiStatus === 'ABD') return 'cancelled';
  if (liveStatuses.has(apiStatus)) return 'live';
  return 'upcoming';
}

function isoToEatParts(iso: string) {
  if (!iso) return { match_date: '', kickoff_time: '' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { match_date: '', kickoff_time: '' };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );
  return {
    match_date: `${parts.year}-${parts.month}-${parts.day}`,
    kickoff_time: `${parts.hour}:${parts.minute}`,
  };
}

function nextSync(status: string, kickoff: string, intervalSeconds: number) {
  if (status === 'finished' || status === 'cancelled' || status === 'postponed') return null;
  if (status === 'suspended') return new Date(Date.now() + 15 * 60000).toISOString();
  if (status === 'postponed') return new Date(Date.now() + 6 * 3600000).toISOString();
  const now = Date.now();
  const kickoffAt = new Date(kickoff).getTime();
  const hours = (kickoffAt - now) / 3600000;
  const adaptiveSeconds = status === 'live' ? intervalSeconds : hours <= 2 ? Math.min(intervalSeconds * 2, 300) : Math.min(intervalSeconds * 5, 900);
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
  } else if (market === 'BTTS') {
    const bothScored = homeScore > 0 && awayScore > 0;
    if (selection === 'YES') win = bothScored;
    if (selection === 'NO') win = !bothScored;
  }
  return win === null ? null : win ? 'win' : 'loss';
}

function evaluatePredictions(match: any, homeScore: number | null, awayScore: number | null) {
  if (homeScore === null || awayScore === null) return {};
  const update: Record<string, unknown> = {};
  if (match.prediction_result !== 'win' && match.prediction_result !== 'loss' && match.prediction_market && match.prediction_selection) {
    update.prediction_result = evaluateSelection(match.prediction_market, match.prediction_selection, homeScore, awayScore);
  }
  if (match.goals_selection && match.goals_result !== 'win' && match.goals_result !== 'loss') {
    update.goals_result = evaluateSelection('GOALS', match.goals_selection, homeScore, awayScore);
  }
  if (match.btts_selection && match.btts_result !== 'win' && match.btts_result !== 'loss') {
    update.btts_result = evaluateSelection('BTTS', match.btts_selection, homeScore, awayScore);
  }
  return update;
}

Deno.serve(async request => {
  const expectedSecret = Deno.env.get('SYNC_SECRET');
  if (!expectedSecret || request.headers.get('x-sync-secret') !== expectedSecret) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('API_FOOTBALL_KEY');
  const configuredInterval = Number(Deno.env.get('TRACKING_INTERVAL_SECONDS') || 120);
  const trackingIntervalSeconds = Number.isFinite(configuredInterval) ? Math.max(60, configuredInterval) : 120;
  if (!supabaseUrl || !serviceRoleKey || !apiKey) return json({ error: 'Sync is not configured.' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: matches, error: selectError } = await admin.from('matches')
    .select('*')
    .not('external_match_id', 'is', null)
    .not('next_sync_at', 'is', null)
    .lte('next_sync_at', new Date().toISOString())
    .limit(10);
  if (selectError) return json({ error: selectError.message }, 500);
  if (!matches?.length) return json({ synced: 0, api_requests: 0 });

  const ids = matches.map(match => match.external_match_id).join(',');
  const apiUrl = new URL('https://v3.football.api-sports.io/fixtures');
  apiUrl.searchParams.set('ids', ids);
  const apiResponse = await fetch(apiUrl, { headers: { 'x-apisports-key': apiKey } });
  const payload = await apiResponse.json();
  if (!apiResponse.ok || payload.errors && Object.keys(payload.errors).length) {
    await Promise.all(matches.map(match => admin.from('matches').update({ sync_error: 'API-Football request failed', last_synced_at: new Date().toISOString() }).eq('id', match.id)));
    return json({ error: 'API-Football request failed.', details: payload.errors || null }, 502);
  }

  const byId = new Map((payload.response || []).map((item: any) => [item.fixture?.id, item]));
  let synced = 0;
  for (const match of matches) {
    const item: any = byId.get(match.external_match_id);
    if (!item) {
      await admin.from('matches').update({ sync_error: 'Fixture not found in API response', last_synced_at: new Date().toISOString() }).eq('id', match.id);
      continue;
    }
    const apiStatus = item.fixture?.status?.short || 'TBD';
    const status = lifecycleStatus(apiStatus);
    const homeScore = item.goals?.home ?? null;
    const awayScore = item.goals?.away ?? null;
    const predictionUpdates = status === 'finished' ? evaluatePredictions(match, homeScore, awayScore) : {};
    const syncedAt = new Date().toISOString();
    const eat = isoToEatParts(item.fixture?.date || '');
    const update: Record<string, unknown> = {
      match_date: eat.match_date || match.match_date,
      kickoff_time: eat.kickoff_time || match.kickoff_time,
      status,
      api_provider: 'api-football',
      api_status: apiStatus,
      competition_id: item.league?.id || null,
      competition_country: item.league?.country || null,
      league: item.league?.name || match.league,
      competition_logo_url: item.league?.logo || null,
      venue: item.fixture?.venue?.name || match.venue || null,
      home_team: item.teams?.home?.name || match.home_team,
      home_team_id: item.teams?.home?.id || null,
      home_badge_url: item.teams?.home?.logo || null,
      away_team: item.teams?.away?.name || match.away_team,
      away_team_id: item.teams?.away?.id || null,
      away_badge_url: item.teams?.away?.logo || null,
      current_minute: item.fixture?.status?.elapsed ?? null,
      home_score: homeScore,
      away_score: awayScore,
      halftime_home_score: item.score?.halftime?.home ?? null,
      halftime_away_score: item.score?.halftime?.away ?? null,
      score: homeScore !== null && awayScore !== null ? `${homeScore} : ${awayScore}` : null,
      match_events: item.events || [],
      last_synced_at: syncedAt,
      next_sync_at: nextSync(status, item.fixture?.date, trackingIntervalSeconds),
      sync_error: null,
      ...predictionUpdates,
    };
    if (status === 'live' && !match.started_at) update.started_at = item.fixture?.date || syncedAt;
    if (status === 'finished' && !match.finished_at) update.finished_at = syncedAt;
    if (predictionUpdates.prediction_result) {
      update.result = predictionUpdates.prediction_result;
      update.prediction_evaluated_at = new Date().toISOString();
    }
    const { error } = await admin.from('matches').update(update).eq('id', match.id);
    if (!error) synced++;
  }
  return json({ synced, api_requests: 1 });
});
