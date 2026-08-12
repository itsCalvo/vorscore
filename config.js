// ============================================================
// VorScore Tips — Supabase connection config
// ============================================================
// 1. Create a free project at https://supabase.com
// 2. Go to Project Settings -> API
// 3. Copy your "Project URL" and "anon public" key below
// 4. Save this file — both index.html and admin.html use it
// ============================================================

const SUPABASE_URL = "https://slwghupgnpmvcsuunftt.supabase.co"; // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2dodXBnbnBtdmNzdXVuZnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMzAwNDQsImV4cCI6MjEwMTcwNjA0NH0.-x0JQQyBFkctfIsNb7EQnbcWHVVRx49FAT2sJt6CxdA";

const { createClient } = window.supabase || {};
const supabaseClient = (typeof createClient === 'function' && SUPABASE_URL.startsWith("http"))
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
console.log('[VorScore] config Supabase client', typeof supabaseClient?.from);

// ============================================================
// Timezone — all match times use East Africa Time (Kenya)
// ============================================================
const APP_TIMEZONE = "Africa/Nairobi";
const APP_TIMEZONE_LABEL = "EAT";

function isoToEatParts(iso){
  if(!iso) return { match_date:"", kickoff_time:"" };
  const date = new Date(iso);
  if(Number.isNaN(date.getTime())) return { match_date:"", kickoff_time:"" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return {
    match_date: `${parts.year}-${parts.month}-${parts.day}`,
    kickoff_time: `${parts.hour}:${parts.minute}`,
  };
}

function todayEatDate(){
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
}

/** Calendar date in Kenya using UTC+3 offset (matches auto-picker storage). */
function kenyaIsoDate(){
  const kenyaNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return kenyaNow.toISOString().slice(0, 10);
}

function predictionQueryDates(){
  const eat = todayEatDate();
  const kenya = kenyaIsoDate();
  const utc = new Date().toISOString().slice(0, 10);
  return [...new Set([eat, kenya, utc])];
}

function normalizeMatchDate(value){
  if(!value) return "";
  const text = String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if(Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(date);
}

function formatKickoffEat(value, includeDate = false){
  if(!value) return "Kickoff unavailable";
  if(/^\d{2}:\d{2}$/.test(String(value).trim())){
    return includeDate ? String(value) : `${String(value).trim()} ${APP_TIMEZONE_LABEL}`;
  }
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return "Kickoff unavailable";
  const options = {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if(includeDate){
    return `${date.toLocaleString("en-KE", {
      ...options,
      day: "numeric",
      month: "short",
      year: "numeric",
    })} ${APP_TIMEZONE_LABEL}`;
  }
  return `${date.toLocaleTimeString("en-KE", options)} ${APP_TIMEZONE_LABEL}`;
}

function formatStoredKickoffEat(kickoffTime){
  if(!kickoffTime) return "—";
  const time = String(kickoffTime).trim();
  if(!time) return "—";
  return time.includes(APP_TIMEZONE_LABEL) ? time : `${time} ${APP_TIMEZONE_LABEL}`;
}

function eatDayDiff(dateStr){
  const today = todayEatDate();
  const target = new Date(`${dateStr}T12:00:00`);
  const base = new Date(`${today}T12:00:00`);
  return Math.round((target - base) / 86400000);
}

function eatKickoffIso(matchDate, kickoffTime){
  if(!matchDate || !kickoffTime) return "";
  return `${matchDate}T${kickoffTime}:00+03:00`;
}

function formatHistoryDateHeading(dateStr){
  const d = new Date(`${dateStr}T12:00:00`);
  const label = d.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    timeZone: APP_TIMEZONE,
  });
  return `${label} · ${dateStr}`;
}

const FINISHED_API_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

function isMatchFinished(match){
  if(match.status === "finished" || FINISHED_API_STATUSES.has(match.api_status)) return true;
  const scores = matchScores(match);
  return scores.home != null && match.match_date < todayEatDate();
}

function matchScores(match){
  if(match.home_score != null && match.away_score != null){
    return { home: Number(match.home_score), away: Number(match.away_score) };
  }
  if(match.score){
    const parts = String(match.score).match(/(\d+)\s*[:-\u2013]\s*(\d+)/);
    if(parts) return { home: Number(parts[1]), away: Number(parts[2]) };
  }
  return { home: null, away: null };
}

function historyDisplayStatus(match){
  return isMatchFinished(match) ? "FT" : (match.api_status || "—");
}

async function enrichMatchesFromFixtures(matches){
  if(!supabaseClient || !matches?.length) return matches;
  const ids = [...new Set(matches.map(match => match.external_match_id || match.fixture_id).filter(Boolean))];
  if(!ids.length) return matches;

  const { data: fixtures, error } = await supabaseClient
    .from("fixtures")
    .select("fixture_id, home_score, away_score, status, api_status")
    .in("fixture_id", ids);

  if(error || !fixtures?.length) return matches;

  const byId = Object.fromEntries(fixtures.map(fixture => [String(fixture.fixture_id), fixture]));
  matches.forEach(match => {
    const fixture = byId[String(match.external_match_id || match.fixture_id)];
    if(!fixture) return;
    if(fixture.home_score != null) match.home_score = fixture.home_score;
    if(fixture.away_score != null) match.away_score = fixture.away_score;
    // authoritative fixture status fields
    if(fixture.status) match.status = fixture.status;
    if(fixture.api_status) match.api_status = fixture.api_status;
    // keep a canonical final_status that other code uses for rendering
    match.final_status = fixture.api_status ?? fixture.status ?? match.final_status ?? null;
    match.fixture_status = fixture.status ?? match.fixture_status ?? null;
    if(fixture.home_score != null && fixture.away_score != null){
      match.score = `${fixture.home_score} : ${fixture.away_score}`;
    }
    // recompute verdict deterministically if fixture indicates finished and scores present
    try {
      const scores = matchScores(match);
      const finished = isMatchFinished(match);
      if(finished && scores.home != null && scores.away != null){
        const pickText = (typeof displayPick === 'function') ? displayPick(match) : (match.pick_label || match.prediction_selection || null);
        const resolved = (typeof resolveResult === 'function') ? resolveResult(pickText, scores.home, scores.away, 'finished', match.is_locked) : null;
        if(resolved && String(resolved).includes('WIN')) match.verdict = 'WIN';
        else if(resolved && String(resolved).includes('LOSS')) match.verdict = 'LOSS';
        else match.verdict = match.verdict ?? null;
      }
    } catch (e) {
      // if resolver not available in this runtime, skip recompute
    }
  });
  return matches;
}
