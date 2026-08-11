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

// Leave as-is — used by both pages
const supabaseClient = (SUPABASE_URL.startsWith("http"))
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

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
