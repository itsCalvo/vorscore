import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsTeam(team: string, query: string) {
  const teamName = normalize(team);
  const search = normalize(query);
  return !search || teamName.includes(search);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('API_FOOTBALL_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');
  if (!apiKey || !supabaseUrl || !anonKey || !authorization) {
    return json({ error: 'Fixture search is not configured.' }, 503);
  }

  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Admin login required.' }, 401);
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Admin login required.' }, 401);

  let input: { date?: string; home?: string; away?: string; teamQuery?: string };
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  if (input.teamQuery) {
    if (input.teamQuery.trim().length < 3) return json({ teams: [] });
    const teamUrl = new URL('https://v3.football.api-sports.io/teams');
    teamUrl.searchParams.set('search', input.teamQuery.trim());
    const teamResponse = await fetch(teamUrl, { headers: { 'x-apisports-key': apiKey } });
    const teamPayload = await teamResponse.json();
    if (!teamResponse.ok || teamPayload.errors && Object.keys(teamPayload.errors).length) {
      return json({ error: 'API-Football team search failed.' }, 502);
    }
    const teams = (teamPayload.response || []).map((item: any) => ({
      id: item.team?.id || null,
      name: item.team?.name || '',
      country: item.team?.country || null,
      logo: item.team?.logo || null,
    })).filter((team: any) => team.name);
    return json({ teams });
  }
  if (!input.date || (!input.home && !input.away)) {
    return json({ error: 'Date and at least one team search are required.' }, 400);
  }

  const url = new URL('https://v3.football.api-sports.io/fixtures');
  url.searchParams.set('date', input.date);
  const apiResponse = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
  const payload = await apiResponse.json();
  if (!apiResponse.ok || payload.errors && Object.keys(payload.errors).length) {
    return json({ error: 'API-Football search failed.', details: payload.errors || null }, 502);
  }

  const fixtures = (payload.response || []).filter((item: any) =>
    containsTeam(item.teams?.home?.name || '', input.home || '') &&
    containsTeam(item.teams?.away?.name || '', input.away || '')
  ).map((item: any) => ({
    fixture_id: item.fixture?.id,
    kickoff: item.fixture?.date,
    api_status: item.fixture?.status?.short || null,
    league: {
      id: item.league?.id || null,
      name: item.league?.name || null,
      country: item.league?.country || null,
      logo: item.league?.logo || null,
    },
    venue: item.fixture?.venue?.name || null,
    home: { id: item.teams?.home?.id || null, name: item.teams?.home?.name || null, logo: item.teams?.home?.logo || null },
    away: { id: item.teams?.away?.id || null, name: item.teams?.away?.name || null, logo: item.teams?.away?.logo || null },
  }));

  return json({ fixtures, count: fixtures.length });
});
