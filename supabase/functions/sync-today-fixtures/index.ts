import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const finishedStatuses = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const liveStatuses = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

function mapApiFixture(item: any) {
  const apiStatus = item.fixture?.status?.short || 'NS';
  const status = lifecycleStatus(apiStatus);
  const kickoff = item.fixture?.date || null;
  return {
    fixture_id: item.fixture?.id,
    fixture_date: isoToEatDate(kickoff),
    kickoff,
    league: item.league?.name || null,
    country: item.league?.country || null,
    home_team: item.teams?.home?.name || '',
    away_team: item.teams?.away?.name || '',
    home_logo: item.teams?.home?.logo || null,
    away_logo: item.teams?.away?.logo || null,
    venue: item.fixture?.venue?.name || null,
    status,
    api_status: apiStatus,
    home_score: item.goals?.home ?? null,
    away_score: item.goals?.away ?? null,
    current_minute: item.fixture?.status?.elapsed ?? null,
    source: 'api',
    next_sync_at: status === 'finished' || status === 'cancelled' || status === 'postponed'
      ? null
      : new Date(Date.now() + 120_000).toISOString(),
    last_synced_at: new Date().toISOString(),
    sync_error: null,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('API_FOOTBALL_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');

  if (!apiKey || !supabaseUrl || !serviceRoleKey || !anonKey || !authorization) {
    return json({ error: 'Sync is not configured.' }, 503);
  }

  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Admin login required.' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());

  const url = new URL('https://v3.football.api-sports.io/fixtures');
  url.searchParams.set('date', today);
  const apiResponse = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
  const payload = await apiResponse.json();

  if (!apiResponse.ok || (payload.errors && Object.keys(payload.errors).length)) {
    return json({ error: 'API-Football request failed.', details: payload.errors || null }, 502);
  }

  const rows = (payload.response || [])
    .map(mapApiFixture)
    .filter((row: any) => row.fixture_id && row.home_team && row.away_team);

  if (!rows.length) return json({ count: 0, fixtures: [] });

  const { error } = await admin.from('fixtures').upsert(rows, { onConflict: 'fixture_id' });
  if (error) return json({ error: error.message }, 500);

  return json({ count: rows.length, fixtures: payload.response || [] });
});
