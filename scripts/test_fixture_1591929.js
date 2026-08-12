const fs = require('fs');

// load resolveResult from lib/resolve-result.js by evaluating the file
const rr = fs.readFileSync('./lib/resolve-result.js', 'utf8');
eval(rr);
// resolveResult is now defined in this context

// minimal helpers from config.js
function todayEatDate(){
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
}
const FINISHED_API_STATUSES = new Set(['FT','AET','PEN','AWD','WO']);
function matchScores(match){
  if(match.home_score != null && match.away_score != null){
    return { home: Number(match.home_score), away: Number(match.away_score) };
  }
  if(match.score){
    const parts = String(match.score).match(/(\d+)\s*[:\-\u2013]\s*(\d+)/);
    if(parts) return { home: Number(parts[1]), away: Number(parts[2]) };
  }
  return { home: null, away: null };
}
function isMatchFinished(match){
  if(match.status === 'finished' || FINISHED_API_STATUSES.has(match.api_status)) return true;
  const scores = matchScores(match);
  return scores.home != null && match.match_date < todayEatDate();
}

function normalizeLoadedMatch(match){
  // replicate minimal normalize
  match.match_date = (match.match_date||'').toString().slice(0,10);
  return match;
}

function displayPick(match){
  if(match.is_locked) return '🔒 Subscriber pick';
  if(match.pick_label) return match.pick_label;
  return match.prediction_selection ? match.prediction_selection : '—';
}

// replicate the mapPredictionToMatch logic (authoritative merge)
function mapPredictionToMatch(row){
  const fixtureRaw = row.fixtures;
  const fixture = Array.isArray(fixtureRaw) ? (fixtureRaw[0] || null) : (fixtureRaw || null);
  const fixtureExists = !!fixture;
  const merged = normalizeLoadedMatch({
    id: row.id,
    external_match_id: row.fixture_id ?? row.external_match_id ?? null,
    match_date: row.fixture_date ?? (row.kickoff ? row.kickoff.slice(0,10) : ''),
    kickoff_iso: row.kickoff ?? null,
    home_team: row.home_team ?? row.homeTeam ?? '',
    away_team: row.away_team ?? row.awayTeam ?? '',
    league: row.league ?? null,
    prediction_market: row.prediction_market ?? null,
    prediction_selection: row.prediction_selection ?? null,
    pick_label: row.pick ?? null,
    confidence: row.confidence ?? null,
    category: row.category ?? null,
    trust_score: row.confidence ?? row.trust_score ?? null,
    is_locked: row.is_locked ?? false,
    publication_status: 'published',
    api_status: fixtureExists ? (fixture.api_status ?? null) : (row.api_status ?? null),
    final_status: fixtureExists ? (fixture.api_status ?? fixture.status ?? null) : (row.final_status ?? row.api_status ?? row.status ?? null),
    fixture_status: fixtureExists ? (fixture.status ?? null) : (row.fixture_status ?? row.status ?? null),
    home_score: fixtureExists ? (fixture.home_score != null ? fixture.home_score : null) : (row.home_score ?? null),
    away_score: fixtureExists ? (fixture.away_score != null ? fixture.away_score : null) : (row.away_score ?? null),
    score: (fixture && fixture.home_score != null && fixture.away_score != null) ? `${fixture.home_score} : ${fixture.away_score}` : (row.home_score != null && row.away_score != null ? `${row.home_score} : ${row.away_score}` : (row.score ?? null)),
    prediction_result: row.result ?? row.verdict ?? null,
    source: 'automatic',
  });

  const scores = matchScores(merged);
  const finished = isMatchFinished(merged);
  if(fixtureExists && finished && scores.home != null && scores.away != null){
    const pickText = displayPick(merged);
    const resolved = resolveResult(pickText, scores.home, scores.away, 'finished', merged.is_locked);
    if(String(resolved).includes('WIN')) merged.verdict = 'WIN';
    else if(String(resolved).includes('LOSS')) merged.verdict = 'LOSS';
    else merged.verdict = null;
  } else if(!fixtureExists && finished && scores.home != null && scores.away != null){
    const pickText = displayPick(merged);
    const resolved = resolveResult(pickText, scores.home, scores.away, 'finished', merged.is_locked);
    if(String(resolved).includes('WIN')) merged.verdict = 'WIN';
    else if(String(resolved).includes('LOSS')) merged.verdict = 'LOSS';
    else merged.verdict = null;
  } else {
    merged.verdict = row.verdict ?? row.result ?? null;
  }

  return merged;
}

// Example prediction + fixture
const prediction = {
  id: 1,
  fixture_id: 1591929,
  fixture_date: '2026-08-13',
  kickoff: '2026-08-13T18:00:00+03:00',
  league: 'Example League',
  home_team: 'Arsenal',
  away_team: 'Como',
  pick: 'HOME',
  confidence: 90,
  category: 'banker',
  home_score: null,
  away_score: null,
  final_status: 'UPCOMING',
  verdict: null,
  result: null,
  fixtures: [
    { fixture_id: 1591929, status: 'finished', api_status: 'PEN', home_score: 1, away_score: 1 }
  ]
};

const mapped = mapPredictionToMatch(prediction);
console.log('Mapped match:');
console.log(JSON.stringify(mapped, null, 2));
console.log('\nRendered fields:');
console.log('Match:', `${mapped.home_team} vs ${mapped.away_team}`);
console.log('Score:', mapped.score);
console.log('final_status:', mapped.final_status);
console.log('api_status:', mapped.api_status);
console.log('verdict:', mapped.verdict);

// Derive human readable result using resolveResult
const scores = matchScores(mapped);
const pick = displayPick(mapped);
console.log('resolveResult ->', resolveResult(pick, scores.home, scores.away, 'finished', mapped.is_locked));
