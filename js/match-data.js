window.VorScore = window.VorScore || {};

const VOR_VERSION = 'match-data.v18';
(function(){
  // Single Supabase client from config.js — avoids duplicate GoTrueClient instances
  const client = (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
  console.log('[VorScore]', VOR_VERSION, 'client initialized', typeof client?.from ? 'ok' : 'missing');

  let allMatches = [];
  let automaticPicks = [];
  let historicalAutomaticPicks = [];
  let automaticPickRows = [];
  let activePredictionDate = null;

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }

  function pickLabel(market, selection){
    if(!selection) return '';
    const labels = {
      OVER_0_5:'OVER 0.5', OVER_1_5:'OVER 1.5', OVER_2_5:'OVER 2.5',
      UNDER_0_5:'UNDER 0.5', UNDER_1_5:'UNDER 1.5', UNDER_2_5:'UNDER 2.5',
      YES:'GG YES', NO:'GG NO',
      HOME:'HOME', DRAW:'DRAW', AWAY:'AWAY',
    };
    return labels[String(selection).toUpperCase()] || String(selection).replace(/_/g, ' ');
  }

  const FIXTURE_SELECT_TIERS = [
    'fixture_id,fixture_date,kickoff,league,home_team,away_team,status,api_status,home_score,away_score,current_minute,source',
    'fixture_id,fixture_date,kickoff,league,home_team,away_team,status,api_status,home_score,away_score',
    'fixture_id,kickoff,league,home_team,away_team,home_score,away_score,status,api_status',
  ];

  function supabaseRestHeaders(){
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    };
  }

  function attachFixturesToRows(rows, fixtures){
    if(!rows?.length) return rows || [];
    const byId = Object.fromEntries((fixtures || []).map(fixture => [String(fixture.fixture_id), fixture]));
    return rows.map(row => {
      const fixture = row.fixture_id != null ? byId[String(row.fixture_id)] : null;
      return fixture ? { ...row, fixtures: fixture } : row;
    });
  }

  async function fetchFixturesRestChunk(ids, tierIndex = 0){
    if(!ids.length || tierIndex >= FIXTURE_SELECT_TIERS.length) return [];
    const select = FIXTURE_SELECT_TIERS[tierIndex];
    const url = `${SUPABASE_URL}/rest/v1/fixtures?select=${select}&fixture_id=in.(${ids.join(',')})`;
    try {
      const response = await fetch(url, { headers: supabaseRestHeaders() });
      if(!response.ok){
        if(response.status === 400 && tierIndex + 1 < FIXTURE_SELECT_TIERS.length){
          return fetchFixturesRestChunk(ids, tierIndex + 1);
        }
        return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (_e) {
      return [];
    }
  }

  async function fetchFixturesRestByIds(ids){
    if(typeof SUPABASE_URL !== 'string' || !SUPABASE_URL.startsWith('http') || !ids?.length) return [];
    const unique = [...new Set(ids.filter(id => id != null))];
    const fixtures = [];
    for(let offset = 0; offset < unique.length; offset += 80){
      const chunk = unique.slice(offset, offset + 80);
      fixtures.push(...await fetchFixturesRestChunk(chunk));
    }
    return fixtures;
  }

  async function fetchFixturesByIds(ids){
    if(!ids?.length) return [];
    const unique = [...new Set(ids.filter(id => id != null))];
    if(client){
      for(const select of FIXTURE_SELECT_TIERS){
        try {
          const { data, error } = await client
            .from('fixtures')
            .select(select.replace(/,/g, ', '))
            .in('fixture_id', unique);
          if(!error && data?.length) return data;
          if(error && !/column|42703/i.test(error.message || '')) break;
        } catch (_e) { /* try next tier */ }
      }
    }
    return fetchFixturesRestByIds(unique);
  }

  async function enrichPredictionRowsWithFixtures(rows){
    if(!rows?.length) return rows;
    const ids = rows.map(row => row.fixture_id).filter(id => id != null);
    if(!ids.length) return rows;
    const fixtures = await fetchFixturesByIds(ids);
    return attachFixturesToRows(rows, fixtures);
  }

  async function fetchPredictionsRest(querySuffix){
    if(typeof SUPABASE_URL !== 'string' || !SUPABASE_URL.startsWith('http')) return [];
    const query = querySuffix || 'select=*&order=confidence.desc&limit=200';
    const url = `${SUPABASE_URL}/rest/v1/predictions?${query}`;
    try {
      const response = await fetch(url, { headers: supabaseRestHeaders() });
      if(!response.ok){
        const body = await response.text();
        console.error('[VorScore] REST predictions failed:', response.status, body);
        return [];
      }
      const data = await response.json();
      const rows = Array.isArray(data) ? data : [];
      const enriched = await enrichPredictionRowsWithFixtures(rows);
      console.log(`[VorScore] REST returned ${enriched.length} rows`);
      return enriched;
    } catch (e) {
      console.error('[VorScore] REST predictions error:', e);
      return [];
    }
  }

  function latestPredictionDate(rows){
    if(!rows?.length) return null;
    return rows.reduce((latest, row) => {
      const d = normalizeMatchDate(row.fixture_date);
      return !latest || d > latest ? d : latest;
    }, null);
  }

  function rowsForDate(rows, date){
    return rows.filter(row => normalizeMatchDate(row.fixture_date) === date);
  }

  function isPublishedPrediction(row){
    return row?.publication_status !== 'draft';
  }

  function filterPublishedRows(rows){
    return (rows || []).filter(isPublishedPrediction);
  }

  function selectedOdds(match){
    if(match.prediction_market !== '1X2') return '';
    const odds = { HOME: match.odds_home, DRAW: match.odds_draw, AWAY: match.odds_away }[match.prediction_selection];
    return odds == null || odds === '' ? '' : `<span class="odds-pill">${Number(odds).toFixed(2)}</span>`;
  }

  function renderStatus(match){
    const effective = String(match.final_status ?? match.fixture_status ?? match.api_status ?? match.status ?? '').toLowerCase();
    if(effective === 'live' || effective === '1h' || effective === '2h' || effective.includes('live')){
      return `<span class="live-pill">🔴 LIVE ${match.current_minute ?? ''}'</span>`;
    }
    if(effective === 'ht') return '<span class="halftime-pill">HT</span>';
    if(effective === 'ft' || effective === 'finished') return '<span class="finished-pill">FT</span>';
    return '<span class="upcoming-pill">UPCOMING</span>';
  }

  function renderResult(match){
    if(match.is_locked) return '🔒';
    const verdictVal = String(match.verdict ?? match.result ?? match.prediction_result ?? '').toLowerCase();
    if(verdictVal === 'win') return '✅ WIN';
    if(verdictVal === 'loss') return '❌ LOSS';
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
    const date = normalizeMatchDate(match.match_date);
    if(!date) return false;
    if(match.source === 'automatic' && date >= todayEatDate()) return true;
    if(isAutomaticPick(match)) return true;
    return date >= todayEatDate();
  }

  function getUpcomingMatches(){
    const today = todayEatDate();
    return allMatches.filter(match => {
      if(match.publication_status === 'draft') return false;
      const date = normalizeMatchDate(match.match_date);
      return date && date >= today;
    });
  }

  function resolveMatchVerdict(match){
    const pick = displayPick(match);
    if(pick.includes('Subscriber pick') || match.is_locked) return 'locked';
    const scores = matchScores(match);
    const effectiveStatus = isMatchFinished(match) ? 'finished' : match.status;
    return resolveResult(pick, scores.home, scores.away, effectiveStatus, false);
  }

  function getTrackRecordStats(){
    const history = getHistoryRows();
    let wins = 0;
    let losses = 0;
    let pending = 0;
    let locked = 0;
    history.forEach(match => {
      const verdict = resolveMatchVerdict(match);
      if(verdict.includes('WIN')) wins++;
      else if(verdict.includes('LOSS')) losses++;
      else if(verdict.includes('Locked')) locked++;
      else pending++;
    });
    const settled = wins + losses;
    return {
      wins,
      losses,
      pending,
      locked,
      settled,
      total: history.length,
      winRate: settled ? Math.round((wins / settled) * 1000) / 10 : null,
      days: Object.keys(getHistoryGroups()).length,
    };
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

  function getPredictionResult(match){
    const outcome = (match?.verdict || match?.result || 'PENDING')?.toString().toUpperCase();
    switch(outcome){
      case 'WIN':
        return { icon: '✅', label: 'WIN', className: 'result-win' };
      case 'LOSS':
        return { icon: '❌', label: 'LOSS', className: 'result-loss' };
      default:
        return { icon: '⏳', label: 'PENDING', className: 'result-pending' };
    }
  }

  function getMatchStatus(statusVal){
    const s = String(statusVal ?? '').toUpperCase();
    if(!s || s === 'NS') return { icon: '⏳', label: 'UPCOMING', className: 'status-upcoming' };
    // treat these as live statuses (including HT per canonical rules)
    if(['1H','2H','LIVE','HT','ET','BT'].includes(s)) return { icon: '🔴', label: 'LIVE', className: 'status-live' };
    // finished API statuses map to FINISHED
    if(['FT','AET','PEN','AWD','WO','FINISHED'].includes(s)) return { icon: '🏁', label: 'FINISHED', className: 'status-finished' };
    return { icon: '', label: s, className: 'status-upcoming' };
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
    // prefer fixture values when available; Supabase returns related rows as arrays
    const fixtureRaw = row.fixtures;
    const fixture = Array.isArray(fixtureRaw) ? (fixtureRaw[0] || null) : (fixtureRaw || null);
    const fixtureExists = !!fixture;
    const merged = normalizeLoadedMatch({
      id: row.id,
      external_match_id: row.fixture_id ?? row.external_match_id ?? null,
      match_date: normalizeMatchDate(fixture?.fixture_date ?? row.fixture_date) || kickoffParts.match_date,
      kickoff_time: row.kickoff_time ?? kickoffParts.kickoff_time ?? '',
      kickoff_iso: fixtureExists ? (fixture.kickoff ?? row.kickoff ?? null) : (row.kickoff ?? null),
      home_team: fixtureExists ? (fixture.home_team ?? row.home_team ?? row.homeTeam ?? '') : (row.home_team ?? row.homeTeam ?? ''),
      away_team: fixtureExists ? (fixture.away_team ?? row.away_team ?? row.awayTeam ?? '') : (row.away_team ?? row.awayTeam ?? ''),
      league: fixtureExists ? (fixture.league ?? row.league ?? null) : (row.league ?? null),
      prediction_market: market,
      prediction_selection: selection,
      pick_label: row.pick ?? null,
      confidence: row.confidence ?? null,
      category: normalizePredictionCategory(row.category),
      trust_score: row.confidence ?? row.trust_score ?? null,
      is_locked: row.is_locked ?? false,
      publication_status: row.publication_status ?? 'published',
      api_status: fixtureExists ? (fixture.api_status ?? null) : (row.api_status ?? null),
      final_status: fixtureExists ? (fixture.api_status ?? fixture.status ?? null) : (row.final_status ?? row.api_status ?? row.status ?? null),
      fixture_status: fixtureExists ? (fixture.status ?? null) : (row.fixture_status ?? row.status ?? null),
      home_score: fixtureExists ? (fixture.home_score != null ? fixture.home_score : null) : (row.home_score ?? null),
      away_score: fixtureExists ? (fixture.away_score != null ? fixture.away_score : null) : (row.away_score ?? null),
      score: (fixtureExists && fixture.home_score != null && fixture.away_score != null)
        ? `${fixture.home_score} : ${fixture.away_score}`
        : (row.home_score != null && row.away_score != null ? `${row.home_score} : ${row.away_score}` : (row.score ?? null)),
      prediction_result: row.result ?? row.verdict ?? null,
      reason: row.reason ?? null,
      source: fixture?.source === 'admin' ? 'admin' : 'automatic',
    });

    // determine authoritative verdict from fixture when finished
    const scores = matchScores(merged);
    const finished = isMatchFinished(merged);
    if(fixtureExists && finished && scores.home != null && scores.away != null){
      // authoritative verdict from fixture
      const pickText = displayPick(merged);
      const resolved = resolveResult(pickText, scores.home, scores.away, 'finished', merged.is_locked);
      if(String(resolved).includes('WIN')) merged.verdict = 'WIN';
      else if(String(resolved).includes('LOSS')) merged.verdict = 'LOSS';
      else merged.verdict = null;
    } else if(!fixtureExists && finished && scores.home != null && scores.away != null){
      // no fixture row — fall back to prediction verdict if available or compute
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

  async function fetchPredictionRowsBeforeDate(beforeDate){
    const restRows = filterPublishedRows(await fetchPredictionsRest(
      `select=*&fixture_date=lt.${beforeDate}&order=fixture_date.desc&order=kickoff.asc&limit=500`
    ));
    if(restRows.length) return restRows;

    if(!client) return [];
    try {
      const resp = await client
        .from('predictions')
        .select('*')
        .lt('fixture_date', beforeDate)
        .order('fixture_date', { ascending: false })
        .order('kickoff', { ascending: true })
        .limit(500);
      if(resp.error){
        console.warn('[VorScore] historical predictions query failed:', resp.error.message);
        return [];
      }
      return filterPublishedRows(await enrichPredictionRowsWithFixtures(resp.data || []));
    } catch (e) {
      console.warn('[VorScore] historical predictions error:', e);
      return [];
    }
  }

  async function loadHistoricalPredictions(){
    const today = todayEatDate();
    const rows = await fetchPredictionRowsBeforeDate(today);
    historicalAutomaticPicks = rows
      .map(mapPredictionToMatch)
      .filter(pick => pick.home_team && pick.away_team);
    console.log(`[VorScore] ${historicalAutomaticPicks.length} historical auto picks loaded before ${today}`);
    return historicalAutomaticPicks;
  }

  async function loadTodayPredictions(){
    activePredictionDate = null;
    automaticPicks = [];

    async function fetchByDate(date){
      console.log('[VorScore] querying predictions for', date);

      // REST first — most reliable on static GitHub Pages / Live Server
      const restRows = filterPublishedRows(await fetchPredictionsRest(`select=*&fixture_date=eq.${date}&order=kickoff.asc&limit=200`));
      if(restRows.length){
        console.log(`[VorScore] REST ${restRows.length} rows for ${date}`);
        return restRows;
      }

      if(!client){
        console.warn('[VorScore] Supabase client unavailable for', date);
        return [];
      }

      let data = null;
      let error = null;
      try {
        const resp = await client
          .from('predictions')
          .select('*')
          .eq('fixture_date', date)
          .order('kickoff', { ascending: true });
        data = resp.data; error = resp.error;
      } catch (e) {
        error = e;
      }
      if(error){
        console.warn('[VorScore] Supabase JS query failed:', date, error.message || error);
        return [];
      }
      const matches = filterPublishedRows(await enrichPredictionRowsWithFixtures(data || []));
      console.log('[VorScore] prediction row sample', matches?.[0]);
      console.log(`[VorScore] ${matches.length} rows returned for ${date}`);
      return matches;
    }

    // Try multiple date variants (EAT, Kenya ISO offset, UTC) to handle differing DB date formats
    let rows = [];
    for(const date of predictionQueryDates()){
      const batch = await fetchByDate(date);
      if(batch && batch.length){
        rows = batch;
        activePredictionDate = normalizeMatchDate(batch[0].fixture_date) || date;
        break;
      }
    }
    if(!rows.length){
      console.log('[VorScore] dated queries empty — fetching all predictions via REST');
      const all = filterPublishedRows(await fetchPredictionsRest('select=*&order=confidence.desc&limit=200'));
      if(all.length){
        const today = todayEatDate();
        rows = rowsForDate(all, today);
        if(rows.length){
          activePredictionDate = today;
        } else {
          const latest = latestPredictionDate(all);
          if(latest){
            rows = rowsForDate(all, latest);
            activePredictionDate = latest;
            console.log('[VorScore] using latest prediction date:', latest);
          }
        }
      }
    }
    if(!rows.length){
      const today = todayEatDate();
      console.warn('[VorScore] no predictions found for any date variant, tried:', predictionQueryDates(), 'primary today:', today);
      automaticPickRows = [];
      automaticPicks = [];
      return [];
    }

    automaticPickRows = rows || [];
    console.log('[VorScore] today prediction rows fetched:', (rows || []).length);
    automaticPicks = (rows || []).map(mapPredictionToMatch).filter(pick => pick.home_team && pick.away_team);
    console.log('[VorScore] automatic picks mapped (pre-enrichment):', automaticPicks.length);
    if(rows.length && !automaticPicks.length){
      console.warn('[VorScore] rows fetched but filtered out — sample:', rows[0]);
    }
    if(!automaticPicks.length){
      console.warn('[VorScore] No predictions visible. If the table has data in Supabase, run supabase/migrations/20260812_predictions.sql to enable public read (RLS).');
    }
    const fixtureDate = activePredictionDate || todayEatDate();
    console.log(`[VorScore] ${automaticPicks.length} auto picks mapped for ${fixtureDate}`);
    // defer realtime so it can never block the initial render path
    setTimeout(() => subscribeToPredictionChanges(), 0);
    return automaticPicks;
  }

  function upsertRowIntoPickRows(newRow){
    const key = (r) => (r.fixture_id ?? r.id ?? '') + '::' + (normalizeMatchDate(r.fixture_date ?? '') || '') + '::' + (r.home_team ?? '') + '::' + (r.away_team ?? '');
    const newKey = key(newRow);
    const idx = automaticPickRows.findIndex(r => key(r) === newKey);
    if(idx >= 0) automaticPickRows[idx] = newRow;
    else automaticPickRows.push(newRow);
  }

  function subscribeToPredictionChanges(){
    if(!client) return;
    if(subscribeToPredictionChanges._subscribed) return;
    subscribeToPredictionChanges._subscribed = true;
    const refresh = () => {
      (async () => {
        try { await refreshAndRender(); } catch(e){ console.warn('[VorScore] realtime refresh failed:', e); }
      })();
    };
    // support both supabase-js v2 channel API and v1 .from().on()
    try {
      if(typeof client.channel === 'function'){
        const chan = client.channel('public:predictions-fixtures');
        chan.on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, payload => {
          const row = payload.record || payload.new || payload;
          console.log('[VorScore] Live prediction update', row?.fixture_id, row?.home_score, row?.away_score, row?.final_status);
          upsertRowIntoPickRows(row);
          refresh();
        });
        chan.on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, payload => {
          const row = payload.record || payload.new || payload;
          console.log('[VorScore] Live fixture update', row?.fixture_id, row?.home_score, row?.away_score, row?.api_status);
          refresh();
        });
        chan.subscribe();
        return;
      }
    } catch (e) {
      console.warn('Realtime channel subscribe failed:', e);
    }
    try {
      if(typeof client.from === 'function' && typeof client.from('predictions').on === 'function'){
        client.from('predictions').on('*', payload => {
          const row = payload.new || payload.record || payload;
            console.log('[VorScore] Live fixture update', row?.fixture_id, row?.home_score, row?.away_score, row?.final_status);
            upsertRowIntoPickRows(row);
            (async () => {
              try { await refreshAndRender(); } catch(e){ console.warn('[VorScore] realtime refresh failed:', e); }
            })();
          }).subscribe();
      }
    } catch (e) {
      console.warn('Realtime fallback subscribe failed:', e);
    }
  }

  function formatKickoffToEAT(kickoff){
    if(!kickoff) return '—';
    return formatKickoffEat(kickoff);
  }

  function populateVorScoreDataFromMatches(matches){
    const sorted = [...(matches || [])].sort((a, b) => {
      const conf = (b.confidence ?? b.trust_score ?? 0) - (a.confidence ?? a.trust_score ?? 0);
      if(conf !== 0) return conf;
      return String(a.kickoff_time || '').localeCompare(String(b.kickoff_time || ''));
    });

    const normalizedPicks = sorted.map(match => {
      const time = formatMatchKickoff(match);
      const league = match.league ?? '—';
      const home = match.home_team ?? '';
      const away = match.away_team ?? '';
      const hasScore = match.home_score != null && match.away_score != null;
      const pick = displayPick(match);
      const statusVal = match.final_status ?? match.api_status ?? match.fixture_status ?? match.status;
      const matchStatus = getMatchStatus(statusVal);
      const predResult = getPredictionResult(match);
      return {
        time,
        league,
        match: `${home} vs ${away}`,
        home_score: hasScore ? match.home_score : null,
        away_score: hasScore ? match.away_score : null,
        final_status: statusVal ?? null,
        status: matchStatus.label,
        status_text: `${matchStatus.icon} ${matchStatus.label}`,
        pick,
        result: match.verdict ?? null,
        result_text: `${predResult.icon} ${predResult.label}`,
        confidence: match.confidence ?? match.trust_score,
        category: normalizePredictionCategory(match.category),
      };
    });

    window.vorScoreData = {
      allPicks: normalizedPicks,
      bankers: normalizedPicks.filter(p => p.category === 'bankers' || p.category === 'banker'),
      slipOfTheDay: normalizedPicks.length ? [normalizedPicks[0]] : [],
    };

    console.log('[VorScore] rendering tabs with', normalizedPicks.length, 'picks');

    window.dispatchEvent(new CustomEvent('vorscore:data-ready', {
      detail: { count: normalizedPicks.length, date: activePredictionDate },
    }));
  }

  async function refreshAndRender(){
    await loadTodayPredictions();
    await loadHistoricalPredictions();

    const allAutomatic = [...historicalAutomaticPicks, ...automaticPicks];

    if(allAutomatic.length && typeof enrichMatchesFromFixtures === 'function'){
      try {
        await enrichMatchesFromFixtures(allAutomatic);
      } catch (e) {
        console.warn('[VorScore] fixture enrichment failed:', e);
      }
    }

    allMatches = allAutomatic;

    const tipsDate = activePredictionDate || todayEatDate();
    const homepagePicks = automaticPicks.length
      ? automaticPicks.filter(match => normalizeMatchDate(match.match_date) === tipsDate)
      : allMatches.filter(isTipsMatch);

    if(automaticPicks.length){
      console.log('[VorScore] homepage using', homepagePicks.length, 'auto picks for', tipsDate);
    } else {
      console.log('[VorScore] no auto picks — homepage using', homepagePicks.length, 'merged matches');
    }

    populateVorScoreDataFromMatches(homepagePicks);
    return allMatches;
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

  async function loadMatches(){
    const canLoadRemote = client || (typeof SUPABASE_URL === 'string' && SUPABASE_URL.startsWith('http'));
    if(canLoadRemote){
      try {
        return await refreshAndRender();
      } catch (loadError) {
        console.error('Public matches load failed:', loadError);
        allMatches = automaticPicks.length ? automaticPicks : [];
        populateVorScoreDataFromMatches(allMatches);
        return allMatches;
      }
    }
    // If remote loading is not available, return an empty list (no cached/static fallbacks)
    allMatches = [];
    populateVorScoreDataFromMatches([]);
    return allMatches;
  }

  function matchRowCells(m){
    const effective = m.fixture_status ?? m.final_status ?? m.status;
    const stateClass = effective === 'live' ? 'live' : (effective === 'finished' || effective === 'ft' ? 'finished' : '');
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
      .filter(match => {
        const date = normalizeMatchDate(match.match_date);
        if(!date) return false;
        // Past dates: show every prediction row for that fixture_date
        if(date < today) return true;
        // Today: only include settled/live rows in history
        return isMatchFinished(match);
      })
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
    get historicalAutomaticPicks(){ return historicalAutomaticPicks; },
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
    getUpcomingMatches,
    getTrackRecordStats,
  });
})();
