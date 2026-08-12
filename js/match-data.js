window.VorScore = window.VorScore || {};

(function(){
  const { createClient } = window.supabase || {};
  const supabaseClient = (typeof createClient === 'function' && typeof SUPABASE_URL === 'string' && SUPABASE_URL.startsWith('http'))
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
  console.log('[VorScore] Supabase client initialized', typeof supabaseClient?.from);

  async function fetchPredictionsRest(params = ''){
    const query = params || 'select=*&order=confidence.desc&limit=100';
    const url = `${SUPABASE_URL}/rest/v1/predictions?${query}`;
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if(!response.ok){
      const body = await response.text();
      console.error('[VorScore] REST predictions failed:', response.status, body);
      return [];
    }
    const data = await response.json();
    console.log(`[VorScore] REST returned ${Array.isArray(data) ? data.length : 0} rows`);
    return Array.isArray(data) ? data : [];
  }

  let allMatches = [];
  let automaticPicks = [];
  let activePredictionDate = null;

  const sampleMatches = [
    { match_date: "2026-08-09", kickoff_time:"16:00", status:"finished", api_status:"FT", league:"Premier League", home_team:"Arsenal", away_team:"Chelsea", home_score:2, away_score:0, score:"2 : 0", prediction_market:"1X2", prediction_selection:"DRAW", odds_home:2.1, odds_draw:3.4, odds_away:3.2, trust_score:8, category:"banker", is_locked:false },
    { match_date: "2026-08-09", kickoff_time:"18:30", status:"finished", api_status:"FT", league:"La Liga", home_team:"Barcelona", away_team:"Sevilla", home_score:1, away_score:2, score:"1 : 2", prediction_market:"GOALS", prediction_selection:"OVER_2_5", odds_home:1.5, odds_draw:4.2, odds_away:5.5, trust_score:9, category:"banker", is_locked:false },
    { match_date: "2026-08-09", kickoff_time:"21:00", status:"finished", api_status:"FT", league:"Serie A", home_team:"Inter", away_team:"Milan", home_score:1, away_score:1, score:"1 : 1", prediction_market:"BTTS", prediction_selection:"YES", odds_home:2.0, odds_draw:3.3, odds_away:3.6, trust_score:7, category:"slip_of_day", is_locked:false },
    { match_date: todayEatDate(), kickoff_time:"03:30", status:"finished", api_status:"FT", home_team:"Sacachspas", away_team:"Deportivo", home_score:1, away_score:2, score:"1 : 2", prediction_market:"GOALS", prediction_selection:"UNDER_2_5", odds_home:1.3, odds_draw:5, odds_away:2.3, tip:"2.3", tip_sub:"2", goals_tip:"1.37", goals_sub:"U2.5", gg_tip:"1.56", gg_sub:"NO", best_tip:"1.37", best_sub:"U2.5", trust_score:10, category:"banker", is_locked:false },
    { match_date: todayEatDate(), kickoff_time:"04:15", status:"finished", api_status:"FT", home_team:"Vikingur", away_team:"KR Reyljavik", home_score:3, away_score:2, score:"3 : 2", prediction_market:"GOALS", prediction_selection:"OVER_2_5", odds_home:1.62, odds_draw:4.55, odds_away:4, tip:"1.62", tip_sub:"1", goals_tip:"1.2", goals_sub:"O2.5", gg_tip:"1.25", gg_sub:"Yes", best_tip:"1.2", best_sub:"O2.5", trust_score:9, category:"banker", is_locked:false },
    { match_date: todayEatDate(), kickoff_time:"22:00", status:"upcoming", api_status:"NS", home_team:"Arsenal", away_team:"Chelsea", home_score:null, away_score:null, score:null, prediction_market:"BTTS", prediction_selection:"YES", odds_home:2.1, odds_draw:3.4, odds_away:3.2, tip:"1.9", tip_sub:"1", goals_tip:"1.4", goals_sub:"O2.5", gg_tip:"1.5", gg_sub:"Yes", best_tip:"1.4", best_sub:"O2.5", trust_score:8, category:"banker", is_locked:true },
  ];

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
  }

  function pickLabel(market, selection){
    if(!selection) return '';
    const labels = { OVER_0_5:'OVER 0.5', OVER_1_5:'OVER 1.5', OVER_2_5:'OVER 2.5', UNDER_0_5:'UNDER 0.5', UNDER_1_5:'UNDER 1.5', UNDER_2_5:'UNDER 2.5', YES:'GG YES', NO:'GG NO', HOME:'HOME', DRAW:'DRAW', AWAY:'AWAY' };
    return labels[selection] || selection.replaceAll('_', ' ');
  }

  function selectedOdds(match){
    if(match.prediction_market !== '1X2') return '';
    const odds = { HOME: match.odds_home, DRAW: match.odds_draw, AWAY: match.odds_away }[match.prediction_selection];
    return odds == null || odds === '' ? '' : `<span class="odds-pill">${Number(odds).toFixed(2)}</span>`;
  }

  function renderStatus(match){
    if(match.status === 'live'){
      return `<span class="live-pill">🔴 LIVE ${match.current_minute ?? ''}'</span>`;
    }
    if(match.status === 'finished') return '<span class="finished-pill">FT</span>';
    return '<span class="upcoming-pill">UPCOMING</span>';
  }

  function renderResult(match){
    if(match.is_locked) return '🔒';
    if(match.prediction_result === 'win') return '✅ WIN';
    if(match.prediction_result === 'loss') return '❌ LOSS';
    const pick = displayPick(match);
    if(!pick || pick === '—') return '⏳';
    const scores = matchScores(match);
    const effectiveStatus = isMatchFinished(match) ? 'finished' : match.status;
    const verdict = resolveResult(pick, scores.home, scores.away, effectiveStatus, false);
    if(verdict.includes('WIN')) return '✅ WIN';
    if(verdict.includes('LOSS')) return '❌ LOSS';
    return '⏳';
  }

  function displayPick(match){
    if(match.is_locked) return '🔒 Subscriber pick';
    if(match.pick_label) return match.pick_label;
    return match.prediction_selection ? pickLabel(match.prediction_market, match.prediction_selection) : '—';
  }

  function matchesCategory(match, category){
    if(category === 'all') return true;
    if(category === 'banker') return match.category === 'banker' || match.category === 'bankers';
    return match.category === category;
  }

  function formatDateLabel(dateStr){
    const diff = eatDayDiff(dateStr);
    if(diff === 0) return "Today";
    if(diff === -1) return "Yesterday";
    if(diff === 1) return "Tomorrow";
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-KE", { day:"numeric", month:"long", timeZone: APP_TIMEZONE });
  }

  function isHistorical(match){
    return isMatchFinished(match) || match.match_date < todayEatDate();
  }

  function isAutomaticPick(match){
    if(!automaticPicks.length) return false;
    return automaticPicks.some(pick =>
      (pick.id && pick.id === match.id)
      || (pick.external_match_id && pick.external_match_id === match.external_match_id)
      || (pick.home_team === match.home_team
        && pick.away_team === match.away_team
        && normalizeMatchDate(pick.match_date) === normalizeMatchDate(match.match_date))
    );
  }

  function isTipsMatch(match){
    if(match.publication_status === 'draft') return false;
    if(isAutomaticPick(match)) return true;
    const date = normalizeMatchDate(match.match_date);
    if(!date) return false;
    return date >= todayEatDate();
  }

  function normalizeLoadedMatch(match){
    return { ...match, match_date: normalizeMatchDate(match.match_date) };
  }

  function parsePredictionPick(row){
    if(row.prediction_market && row.prediction_selection){
      return { market: row.prediction_market, selection: row.prediction_selection };
    }
    if(row.market && row.selection){
      return { market: row.market, selection: row.selection };
    }
    const raw = String(row.pick || '').trim();
    if(!raw) return { market: null, selection: null };
    if(raw.includes(':')){
      const [market, selection] = raw.split(':');
      return { market, selection };
    }
    const upper = raw.toUpperCase();
    if(['HOME', 'DRAW', 'AWAY'].includes(upper)) return { market: '1X2', selection: upper };
    if(upper.includes('OVER') || upper.includes('UNDER')){
      return { market: 'GOALS', selection: upper.replace(/\s+/g, '_') };
    }
    if(upper === 'GG YES' || upper === 'YES') return { market: 'BTTS', selection: 'YES' };
    if(upper === 'GG NO' || upper === 'NO') return { market: 'BTTS', selection: 'NO' };
    return { market: row.market || null, selection: raw };
  }

  function normalizePredictionCategory(category){
    if(category === 'bankers') return 'bankers';
    if(category === 'banker') return 'banker';
    if(category === 'slip_of_day') return 'slip_of_day';
    return category ?? 'all-picks';
  }

  function mapPredictionToMatch(row){
    const { market, selection } = parsePredictionPick(row);
    const kickoffParts = row.kickoff ? isoToEatParts(row.kickoff) : { match_date: '', kickoff_time: '' };
    return normalizeLoadedMatch({
      id: row.id,
      external_match_id: row.fixture_id ?? row.external_match_id ?? null,
      match_date: row.fixture_date ?? kickoffParts.match_date,
      kickoff_time: row.kickoff_time ?? kickoffParts.kickoff_time ?? '',
      kickoff_iso: row.kickoff ?? null,
      home_team: row.home_team ?? row.homeTeam ?? '',
      away_team: row.away_team ?? row.awayTeam ?? '',
      league: row.league ?? null,
      prediction_market: market,
      prediction_selection: selection,
      pick_label: row.pick ?? null,
      confidence: row.confidence ?? null,
      category: normalizePredictionCategory(row.category),
      trust_score: row.confidence ?? row.trust_score ?? null,
      is_locked: row.is_locked ?? false,
      publication_status: 'published',
      status: row.status ?? 'upcoming',
      api_status: row.api_status ?? null,
      home_score: row.home_score ?? null,
      away_score: row.away_score ?? null,
      score: row.score ?? null,
      source: 'automatic',
    });
  }

  function mergeKey(match){
    if(match.external_match_id) return `fixture:${match.external_match_id}`;
    return `teams:${normalizeMatchDate(match.match_date)}:${match.home_team}:${match.away_team}`;
  }

  function mergeManualAndAutomaticPicks(manualMatches, automaticPicks){
    const merged = new Map();
    automaticPicks.forEach(pick => merged.set(mergeKey(pick), pick));
    manualMatches.forEach(pick => merged.set(mergeKey(pick), { ...pick, source: pick.source || 'manual' }));
    return [...merged.values()].sort((a, b) => {
      const dateCompare = String(a.match_date || '').localeCompare(String(b.match_date || ''));
      if(dateCompare !== 0) return dateCompare;
      return String(a.kickoff_time || '').localeCompare(String(b.kickoff_time || ''));
    });
  }

  async function loadTodayPredictions(){
    activePredictionDate = null;
    automaticPicks = [];

    async function fetchByDate(date){
      console.log('[VorScore] querying predictions for', date);
      if(!supabaseClient){
        return fetchPredictionsRest(`select=*&fixture_date=eq.${encodeURIComponent(date)}&order=confidence.desc`);
      }
      const { data, error } = await supabaseClient
        .from('predictions')
        .select('*')
        .eq('fixture_date', date)
        .order('confidence', { ascending: false });
      if(error){
        console.error('[VorScore] predictions query failed:', date, error.code, error.message);
        if(error.code === 'PGRST205') return null;
        return [];
      }
      console.log(`[VorScore] ${(data || []).length} rows returned for ${date}`);
      return data || [];
    }

    let rows = [];
    for(const date of predictionQueryDates()){
      const batch = await fetchByDate(date);
      if(batch === null) return [];
      if(batch.length){
        rows = batch;
        activePredictionDate = normalizeMatchDate(batch[0].fixture_date) || date;
        break;
      }
    }

    if(!rows.length){
      console.log('[VorScore] dated queries empty — fetching latest predictions batch');
      if(supabaseClient){
        const { data: all, error } = await supabaseClient
          .from('predictions')
          .select('*')
          .order('confidence', { ascending: false })
          .limit(100);
        if(error){
          console.error('[VorScore] predictions fallback failed:', error.message);
        } else if(all?.length){
          console.log(`[VorScore] ${all.length} total rows in predictions table`);
          rows = all;
        }
      }
      if(!rows.length){
        rows = await fetchPredictionsRest();
      }
      if(rows.length){
        const eatToday = todayEatDate();
        const todayRows = rows.filter(row => normalizeMatchDate(row.fixture_date) === eatToday);
        if(todayRows.length){
          rows = todayRows;
          activePredictionDate = eatToday;
        } else {
          const latestDate = rows.reduce((max, row) => {
            const d = normalizeMatchDate(row.fixture_date);
            return d > max ? d : max;
          }, '');
          rows = rows.filter(row => normalizeMatchDate(row.fixture_date) === latestDate);
          activePredictionDate = latestDate;
        }
      }
    }

    automaticPicks = rows.map(mapPredictionToMatch).filter(pick => pick.home_team && pick.away_team);
    if(rows.length && !automaticPicks.length){
      console.warn('[VorScore] rows fetched but filtered out — sample:', rows[0]);
    }
    if(!automaticPicks.length){
      console.warn('[VorScore] No predictions visible. If the table has data in Supabase, run supabase/migrations/20260812_predictions.sql to enable public read (RLS).');
    }
    const fixtureDate = activePredictionDate || todayEatDate();
    console.log(`[VorScore] ${automaticPicks.length} auto picks loaded for ${fixtureDate}`);
    populateVorScoreData(rows);
    return automaticPicks;
  }

  function formatKickoffToEAT(kickoff){
    if(!kickoff) return '—';
    return formatKickoffEat(kickoff);
  }

  function populateVorScoreData(picks){
    const normalizedPicks = (picks || []).map(p => ({
      time: formatKickoffToEAT(p.kickoff),
      league: p.league ?? '—',
      match: `${p.home_team} vs ${p.away_team}`,
      pick: p.pick ?? '—',
      status: 'UPCOMING',
      result: '⏳',
      confidence: p.confidence,
      category: p.category,
    }));

    window.vorScoreData = {
      allPicks: normalizedPicks,
      bankers: normalizedPicks.filter(p => p.category === 'bankers'),
      slipOfTheDay: normalizedPicks.length ? [normalizedPicks[0]] : [],
    };

    console.log('[VorScore] rendering tabs with', normalizedPicks.length, 'picks');

    if(typeof window.renderTipsTabs === 'function'){
      window.renderTipsTabs();
    }
  }

  function splitAutomaticPicks(){
    const auto = [...automaticPicks].sort((a, b) => (b.confidence ?? b.trust_score ?? 0) - (a.confidence ?? a.trust_score ?? 0));
    return {
      betOfTheDay: auto[0] ?? null,
      bankers: auto.filter(match => match.category === 'bankers' || match.category === 'banker'),
      allPicks: auto.slice(1),
    };
  }

  function formatMatchKickoff(match){
    if(match.kickoff_iso) return formatKickoffEat(match.kickoff_iso);
    return formatStoredKickoffEat(match.kickoff_time);
  }

  async function loadManualMatches(){
    const { data, error } = await supabaseClient
      .from('matches')
      .select('*')
      .order('match_date')
      .order('kickoff_time');
    if(error) throw error;
    return (data || [])
      .map(normalizeLoadedMatch)
      .filter(match => match.publication_status !== 'draft');
  }

  async function loadMatches(){
    const canLoadRemote = supabaseClient || (typeof SUPABASE_URL === 'string' && SUPABASE_URL.startsWith('http'));
    if(canLoadRemote){
      try {
        const [manualMatches] = await Promise.all([
          loadManualMatches().catch(loadError => {
            console.error('Manual matches load failed:', loadError);
            return [];
          }),
        ]);
        await loadTodayPredictions();
        allMatches = mergeManualAndAutomaticPicks(manualMatches, automaticPicks);
        try {
          await enrichMatchesFromFixtures(allMatches);
        } catch (enrichError) {
          console.warn('Fixture enrichment skipped:', enrichError);
        }
        return allMatches;
      } catch (loadError) {
        console.error('Public matches load failed:', loadError);
        allMatches = automaticPicks.length ? automaticPicks : [];
        return allMatches;
      }
    }
    allMatches = sampleMatches
      .map(normalizeLoadedMatch)
      .filter(match => match.publication_status !== 'draft');
    return allMatches;
  }

  function matchRowCells(m){
    const stateClass = m.status === 'live' ? 'live' : m.status === 'finished' ? 'finished' : '';
    const score = m.score || (m.home_score != null && m.away_score != null ? `${m.home_score} - ${m.away_score}` : '');
    const pickText = displayPick(m);
    const pickValues = [pickText === '—' ? '—' : `${escapeHtml(pickText)}${selectedOdds(m)}`];
    const result = renderResult(m);
    const resultClass = result.includes('WIN') ? 'win' : result.includes('LOSS') ? 'loss' : 'pending';
    const matchHtml = `<strong>${escapeHtml(m.home_team)}</strong> <span class="team-name">vs</span> <strong>${escapeHtml(m.away_team)}</strong>${score ? `<div class="score-pill">${escapeHtml(score)}</div>` : ''}`;
    const metaHtml = `<div class="date-time">${escapeHtml(formatMatchKickoff(m))}</div>${m.league ? `<div class="match-meta">${escapeHtml(m.league)}</div>` : ''}`;
    return {
      time: `<td class="date-cell" data-label="Time">${metaHtml}</td>`,
      league: `<td data-label="League">${escapeHtml(m.league || '—')}</td>`,
      match: `<td data-label="Match">${matchHtml}</td>`,
      pick: `<td class="table-pick" data-label="Pick">${pickValues.join('<br>')}</td>`,
      status: `<td class="table-status ${stateClass}" data-label="Status">${renderStatus(m)}</td>`,
      result: `<td class="table-result ${resultClass}" data-label="Result">${result}</td>`,
    };
  }

  function verdictClassName(verdict){
    if(verdict.includes('WIN')) return 'win';
    if(verdict.includes('LOSS')) return 'loss';
    if(verdict.includes('Locked')) return 'locked';
    return 'pending';
  }

  function historyDayStats(matches){
    const stats = { wins:0, losses:0, pending:0, locked:0 };
    matches.forEach(m => {
      const pick = displayPick(m);
      const scores = matchScores(m);
      const effectiveStatus = isMatchFinished(m) ? 'finished' : m.status;
      const verdict = resolveResult(pick, scores.home, scores.away, effectiveStatus, pick.includes('Subscriber pick') || m.is_locked);
      if(verdict.includes('WIN')) stats.wins++;
      else if(verdict.includes('LOSS')) stats.losses++;
      else if(verdict.includes('Locked')) stats.locked++;
      else stats.pending++;
    });
    return stats;
  }

  function historyRowCells(m){
    const pick = displayPick(m);
    const scores = matchScores(m);
    const effectiveStatus = isMatchFinished(m) ? 'finished' : m.status;
    const verdict = resolveResult(pick, scores.home, scores.away, effectiveStatus, pick.includes('Subscriber pick') || m.is_locked);
    const resultClass = verdictClassName(verdict);
    const displayStatus = historyDisplayStatus(m);
    const statusClass = displayStatus === 'FT' ? 'ft' : (['1H','2H','HT','LIVE','ET','P'].includes(displayStatus) ? 'live' : '');
    const pickClass = pick.includes('Subscriber pick') ? 'locked' : '';
    const scoreHtml = scores.home != null
      ? `<span class="history-score">${scores.home} : ${scores.away}</span>`
      : `<span class="history-score empty">—</span>`;
    const matchHtml = `<div class="history-match"><div class="history-match-teams"><span>${escapeHtml(m.home_team)}</span><span class="vs-divider">vs</span><span>${escapeHtml(m.away_team)}</span></div></div>`;
    return `<tr class="history-row">
      <td class="col-time" data-label="Time (EAT)">
        <span class="history-time">${escapeHtml(formatStoredKickoffEat(m.kickoff_time))}</span>
        ${m.league ? `<span class="history-league history-league-inline" title="${escapeHtml(m.league)}">${escapeHtml(m.league)}</span>` : ''}
      </td>
      <td class="col-league" data-label="League"><span class="history-league" title="${escapeHtml(m.league || '')}">${escapeHtml(m.league || '—')}</span></td>
      <td class="col-match" data-label="Match">${matchHtml}</td>
      <td class="col-score" data-label="Score">${scoreHtml}</td>
      <td class="col-pick" data-label="Pick"><span class="history-pick ${pickClass}">${escapeHtml(pick)}</span></td>
      <td class="col-status" data-label="Status"><span class="history-status ${statusClass}">${escapeHtml(displayStatus)}</span></td>
      <td class="col-result" data-label="Result"><span class="history-verdict ${resultClass}">${verdict}</span></td>
    </tr>`;
  }

  function renderHistoryDaySection(date, matches){
    const stats = historyDayStats(matches);
    const statHtml = [
      stats.wins ? `<span class="history-stat win">${stats.wins}W</span>` : '',
      stats.losses ? `<span class="history-stat loss">${stats.losses}L</span>` : '',
      stats.pending ? `<span class="history-stat pending">${stats.pending} pending</span>` : '',
      stats.locked ? `<span class="history-stat pending">${stats.locked} locked</span>` : '',
    ].filter(Boolean).join('');
    return `<section class="history-day">
      <div class="history-day-head">
        <div class="history-day-label">
          <span class="history-day-chip" aria-hidden="true">📅</span>
          <h2 class="history-day-title">${escapeHtml(formatHistoryDateHeading(date))}</h2>
        </div>
        <div class="history-day-meta">${statHtml}<span class="history-day-count">${matches.length} ${matches.length === 1 ? 'pick' : 'picks'}</span></div>
      </div>
      <div class="history-wrap">
        <table class="history-table responsive-table" aria-label="Predictions from ${escapeHtml(date)}">
          <thead>
            <tr>
              <th class="col-time">Time (EAT)</th>
              <th class="col-league">League</th>
              <th class="col-match">Match</th>
              <th class="col-score">Score</th>
              <th class="col-pick">Pick</th>
              <th class="col-status">Status</th>
              <th class="col-result">Result</th>
            </tr>
          </thead>
          <tbody>${matches.map(m => historyRowCells(m)).join('')}</tbody>
        </table>
      </div>
    </section>`;
  }

  function getHistoryRows(){
    const today = todayEatDate();
    return allMatches
      .filter(match => isMatchFinished(match) || match.match_date < today)
      .sort((first, second) => `${second.match_date}${second.kickoff_time || ''}`.localeCompare(`${first.match_date}${first.kickoff_time || ''}`));
  }

  function getHistoryGroups(){
    const groups = {};
    getHistoryRows().forEach(match => { (groups[match.match_date] ||= []).push(match); });
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => (b.kickoff_time || '').localeCompare(a.kickoff_time || ''));
    });
    return groups;
  }

  Object.assign(window.VorScore, {
    get allMatches(){ return allMatches; },
    get automaticPicks(){ return automaticPicks; },
    get activePredictionDate(){ return activePredictionDate; },
    loadMatches,
    escapeHtml,
    pickLabel,
    formatDateLabel,
    formatMatchKickoff,
    isHistorical,
    normalizeMatchDate,
    isTipsMatch,
    matchesCategory,
    displayPick,
    splitAutomaticPicks,
    matchRowCells,
    renderHistoryDaySection,
    getHistoryRows,
    getHistoryGroups,
  });
})();
