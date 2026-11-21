import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const API_ROOT = "https://footballcharts-backend.onrender.com/api/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function listFrom(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  const obj = asObject(value);
  for (const key of ["matches", "fixtures", "leagues", "data", "results"]) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return [];
}
function leaguePath(league: any): string | null {
  const raw = league?.slug ?? league?.path ?? league?.api_slug ?? league?.league_slug ?? league?.url_path;
  if (typeof raw === "string" && raw.trim()) return raw.replace(/^\/+|\/+$/g, "").replace(/^leagues\//, "");
  return null;
}
function modelInfo(predictions: any) {
  const all = asObject(predictions);
  const selectedName = all.dc_v2 ? "dc_v2" : all.dc_base ? "dc_base" : null;
  const selected = selectedName ? asObject(all[selectedName]) : {};
  const gates = asObject(selected.gates);
  const status = asObject(selected.data_status);
  const computed = selected.computed_at ?? null;
  return {
    selectedName,
    computed,
    dataThrough: selected.data_through ?? null,
    stale: typeof status.stale === "boolean" ? status.stale : null,
    behind: Number.isFinite(Number(status.matches_behind)) ? Number(status.matches_behind) : null,
    ready: Boolean(selectedName && gates.probabilities === true && status.stale !== true),
  };
}
function toRow(match: any, response: any) {
  const slug = typeof match?.slug === "string" ? match.slug : null;
  const date = typeof match?.match_date === "string" ? match.match_date.slice(0, 10) : null;
  if (!slug || !date || !match?.home_team || !match?.away_team) return null;
  const time = typeof match.time === "string" ? match.time : null;
  let kickoffAt: string | null = null;
  if (match.kickoff_utc && !Number.isNaN(Date.parse(match.kickoff_utc))) {
    kickoffAt = new Date(match.kickoff_utc).toISOString();
  } else if (time && /^\d{1,2}:\d{2}/.test(time)) {
    const hhmm = time.length === 4 ? "0" + time : time;
    const parsed = new Date(date + "T" + hhmm.slice(0, 5) + ":00Z");
    if (!Number.isNaN(parsed.getTime())) kickoffAt = parsed.toISOString();
  }
  const predictions = match.model_predictions ?? null;
  const model = modelInfo(predictions);
  const computedAt = model.computed && !Number.isNaN(Date.parse(model.computed)) ? new Date(model.computed).toISOString() : null;
  return {
    slug, match_date: date, kickoff_at: kickoffAt, kickoff_utc: time,
    status: String(match.status ?? "scheduled"),
    league_code: match.league ?? null, country: match.country ?? null,
    league_name: match.real_league_name ?? null,
    home_team: String(match.home_team), away_team: String(match.away_team),
    provider_url: match.url ?? null, model_predictions: predictions,
    selected_model: model.selectedName, model_computed_at: computedAt,
    model_data_through: model.dataThrough ?? null, model_stale: model.stale,
    matches_behind: model.behind, model_ready: model.ready,
    source_url: response.source_url ?? null,
    attribution: response.attribution ?? "Data by football-charts.com",
    raw_payload: match, fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const apiKey = Deno.env.get("FOOTBALL_CHARTS_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!apiKey || !supabaseUrl || !serviceKey || !anonKey) {
    return json({
      error: "Server configuration incomplete.",
      footballChartsKeyConfigured: Boolean(apiKey),
      databaseAdminConfigured: Boolean(serviceKey),
    }, 500);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign-in required." }, 401);
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "A valid signed-in user is required." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const leagueResponse = await fetch(API_ROOT + "/leagues/", {
      headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
    });
    if (!leagueResponse.ok) {
      return json({ error: "Football-Charts league request failed.", providerStatus: leagueResponse.status }, 502);
    }
    const leagueBody = await leagueResponse.json();
    const leagues = listFrom(leagueBody).map((entry) => ({ entry, path: leaguePath(entry) }))
      .filter((entry) => entry.path).slice(0, 98);
    if (!leagues.length) {
      return json({ error: "No usable league paths were returned by Football-Charts.", leaguePayloadKeys: Object.keys(asObject(leagueBody)) }, 502);
    }

    let fetched = 0, failed = 0, skipped = 0, upserted = 0;
    const failures: Array<{ league: string; status?: number; reason?: string }> = [];
    const concurrency = 4;
    for (let offset = 0; offset < leagues.length; offset += concurrency) {
      const batch = leagues.slice(offset, offset + concurrency);
      const results = await Promise.all(batch.map(async ({ path }) => {
        const safePath = path!.split("/").map((part: string) => encodeURIComponent(part)).join("/");
        try {
          const response = await fetch(API_ROOT + "/leagues/" + safePath + "/fixtures/", {
            headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
          });
          if (!response.ok) return { path: path!, status: response.status, reason: null as string | null, matches: [] as any[], body: {} as Record<string, any> };
          const body = await response.json();
          return { path: path!, status: response.status, reason: null as string | null, matches: listFrom(body), body: asObject(body) };
        } catch (error) {
          return { path: path!, status: 0, reason: String(error).slice(0, 160), matches: [] as any[], body: {} as Record<string, any> };
        }
      }));
      for (const result of results) {
        if (result.status !== 200) {
          failed++;
          failures.push({ league: result.path, status: result.status || undefined, reason: result.reason || undefined });
          continue;
        }
        fetched++;
        const rows = result.matches.map((match) => toRow(match, result.body)).filter((row): row is NonNullable<typeof row> => Boolean(row));
        skipped += result.matches.length - rows.length;
        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100);
          const { data, error } = await admin.from("football_charts_matches").upsert(chunk, { onConflict: "slug" }).select("slug");
          if (error) {
            failures.push({ league: result.path, reason: error.message.slice(0, 160) });
            failed++;
          } else {
            upserted += data?.length ?? chunk.length;
          }
        }
      }
    }
    return json({
      ok: failed === 0, leaguesDiscovered: leagues.length, leaguesFetched: fetched,
      leaguesFailed: failed, matchesUpserted: upserted, matchesSkipped: skipped,
      providerRequestsUsed: 1 + leagues.length,
      note: "One request per league plus the league directory. Provider times are stored as UTC.",
      failures: failures.slice(0, 12), finishedAt: new Date().toISOString(),
    }, failed ? 207 : 200);
  } catch (error) {
    console.error("football-charts-sync failed:", String(error).slice(0, 300));
    return json({ error: "Importer failed. Check function logs for details." }, 500);
  }
});
