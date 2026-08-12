// Simulate refreshAndRender homepage filter logic
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const configText = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
const url = configText.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)[1];
const key = configText.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];
const client = createClient(url, key);

const APP_TIMEZONE = 'Africa/Nairobi';
function todayEatDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date());
}
function normalizeMatchDate(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return '';
}
function mergeKey(match) {
  if (match.external_match_id) return `fixture:${match.external_match_id}`;
  return `teams:${normalizeMatchDate(match.match_date)}:${match.home_team}:${match.away_team}`;
}
function mapRow(row) {
  return {
    id: row.id,
    external_match_id: row.fixture_id,
    match_date: normalizeMatchDate(row.fixture_date),
    home_team: row.home_team,
    away_team: row.away_team,
    source: 'automatic',
  };
}
function mergeManualAndAutomatic(manual, auto) {
  const merged = new Map();
  auto.forEach(p => merged.set(mergeKey(p), p));
  manual.forEach(p => merged.set(mergeKey(p), { ...p, source: p.source || 'manual' }));
  return [...merged.values()];
}

(async () => {
  const today = todayEatDate();
  const { data: rows } = await client.from('predictions').select('*').eq('fixture_date', today);
  const automaticPicks = (rows || []).map(mapRow);
  const { data: manual } = await client.from('matches').select('*');
  const manualMatches = (manual || []).map(m => ({
    ...m,
    match_date: normalizeMatchDate(m.match_date),
    external_match_id: m.external_match_id || m.fixture_id,
    source: 'manual',
  }));
  const allMatches = mergeManualAndAutomatic(manualMatches, automaticPicks);
  const tipsDate = today;
  const homepagePicks = automaticPicks.length
    ? allMatches.filter(m => m.source === 'automatic' && normalizeMatchDate(m.match_date) === tipsDate)
    : [];
  console.log('today:', today);
  console.log('automaticPicks:', automaticPicks.length);
  console.log('allMatches:', allMatches.length);
  console.log('homepagePicks:', homepagePicks.length);
  if (homepagePicks.length === 0 && automaticPicks.length > 0) {
    console.log('BUG: auto picks exist but homepage filter returned 0');
    console.log('allMatches sources:', allMatches.map(m => m.source).slice(0, 15));
  }
})();
