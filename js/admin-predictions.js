(function initAdminPredictions(global){
  const PICK_LABELS = {
    OVER_2_5:'OVER 2.5', UNDER_2_5:'UNDER 2.5', OVER_1_5:'OVER 1.5', UNDER_1_5:'UNDER 1.5',
    YES:'GG YES', NO:'GG NO', HOME:'HOME', DRAW:'DRAW', AWAY:'AWAY',
  };

  const FIXTURE_SELECT_TIERS = [
    'fixture_id, fixture_date, kickoff, league, home_team, away_team, status, api_status, home_score, away_score, current_minute, source',
    'fixture_id, fixture_date, kickoff, league, home_team, away_team, status, api_status, home_score, away_score',
    'fixture_id, kickoff, league, home_team, away_team, home_score, away_score, status, api_status',
  ];

  function attachFixturesToRows(rows, fixtures){
    const byId = Object.fromEntries((fixtures || []).map(fixture => [String(fixture.fixture_id), fixture]));
    return (rows || []).map(row => {
      const fixture = row.fixture_id != null ? byId[String(row.fixture_id)] : null;
      return fixture ? { ...row, fixtures: fixture } : row;
    });
  }

  async function fetchFixturesForRows(rows){
    const ids = [...new Set((rows || []).map(row => row.fixture_id).filter(id => id != null))];
    if(!ids.length) return [];
    for(const select of FIXTURE_SELECT_TIERS){
      const { data, error } = await supabaseClient.from('fixtures').select(select).in('fixture_id', ids);
      if(!error) return data || [];
      if(!/column|42703/i.test(error.message || '')) throw error;
    }
    return [];
  }

  function pickDisplayText(market, selection){
    if(!selection) return '';
    return PICK_LABELS[selection] || String(selection).replace(/_/g, ' ');
  }

  function parseOptionalInt(value){
    if(value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function collectFixturePayload(source){
    const fixtureDate = document.getElementById('fixtureDate').value || todayEatDate();
    const kickoffRaw = document.getElementById('f_kickoff').value || document.getElementById('kickoff-time').value || '';
    const kickoff = kickoffRaw.includes('T') ? kickoffRaw : (kickoffRaw ? `${fixtureDate}T${kickoffRaw}:00+03:00` : null);
    const fixtureIdRaw = document.getElementById('fixture-id').value;
    return {
      fixture_id: fixtureIdRaw ? Number(fixtureIdRaw) : null,
      fixture_date: fixtureDate,
      kickoff,
      league: document.getElementById('f_league').value.trim(),
      home_team: document.getElementById('f_home_team').value.trim(),
      away_team: document.getElementById('f_away_team').value.trim(),
      status: document.getElementById('f_fixture_status').value || 'upcoming',
      api_status: document.getElementById('f_api_status').value.trim() || null,
      home_score: parseOptionalInt(document.getElementById('f_home_score').value),
      away_score: parseOptionalInt(document.getElementById('f_away_score').value),
      source: source || (fixtureIdRaw && Number(fixtureIdRaw) > 0 ? 'api' : 'admin'),
    };
  }

  function collectPredictionPayload(fixtureId, fixturePayload){
    const [market = '', selection = ''] = document.getElementById('f_prediction_pick').value.split(':');
    const trust = parseInt(document.getElementById('f_trust').value, 10);
    const confidence = Number.isFinite(trust) ? Math.min(100, Math.max(0, trust * 10)) : null;
    const kickoffParts = fixturePayload.kickoff ? isoToEatParts(fixturePayload.kickoff) : { match_date: fixturePayload.fixture_date, kickoff_time: '' };
    const verdictChoice = document.getElementById('f_verdict').value;
    const payload = {
      fixture_id: fixtureId,
      fixture_date: fixturePayload.fixture_date,
      kickoff: fixturePayload.kickoff,
      kickoff_time: kickoffParts.kickoff_time || null,
      league: fixturePayload.league || null,
      home_team: fixturePayload.home_team,
      away_team: fixturePayload.away_team,
      market: market || null,
      selection: selection || null,
      pick: pickDisplayText(market, selection),
      confidence,
      category: document.getElementById('f_category').value,
      reason: document.getElementById('f_reason').value.trim() || null,
      is_locked: document.getElementById('f_locked').value === 'true',
      publication_status: document.getElementById('f_publication_status').value,
      home_score: fixturePayload.home_score,
      away_score: fixturePayload.away_score,
      final_status: fixturePayload.api_status || fixturePayload.status || null,
      status: fixturePayload.status || null,
      api_status: fixturePayload.api_status || null,
      updated_at: new Date().toISOString(),
    };
    if(verdictChoice && verdictChoice !== 'pending'){
      payload.verdict = verdictChoice;
      payload.result = verdictChoice.toLowerCase();
    } else if(verdictChoice === 'pending'){
      payload.verdict = null;
      payload.result = null;
    }
    return payload;
  }

  async function resolveFixtureId(existingId){
    if(existingId) return existingId;
    const fromForm = document.getElementById('fixture-id').value;
    if(fromForm) return Number(fromForm);
    const { data, error } = await supabaseClient.rpc('next_admin_fixture_id');
    if(error) throw error;
    return data;
  }

  async function upsertFixture(payload){
    const row = {
      fixture_id: payload.fixture_id,
      fixture_date: payload.fixture_date,
      kickoff: payload.kickoff,
      league: payload.league,
      home_team: payload.home_team,
      away_team: payload.away_team,
      status: payload.status,
      api_status: payload.api_status,
      home_score: payload.home_score,
      away_score: payload.away_score,
      source: payload.source,
      updated_at: new Date().toISOString(),
    };
    if(payload.fixture_id > 0){
      row.next_sync_at = new Date().toISOString();
    }

    let { error } = await supabaseClient.from('fixtures').upsert(row, { onConflict: 'fixture_id' });
    if(error && /next_sync_at/i.test(error.message || '')){
      delete row.next_sync_at;
      ({ error } = await supabaseClient.from('fixtures').upsert(row, { onConflict: 'fixture_id' }));
    }
    if(error) throw error;
    return row.fixture_id;
  }

  async function savePredictionPick({ editingId, existingFixtureId }){
    const fixturePayload = collectFixturePayload();
    if(!fixturePayload.home_team || !fixturePayload.away_team){
      throw new Error('Home team and away team are required.');
    }
    if(!fixturePayload.league){
      throw new Error('League is required.');
    }
    if(!document.getElementById('f_prediction_pick').value){
      throw new Error('Choose at least one prediction pick.');
    }

    const fixtureId = await resolveFixtureId(existingFixtureId || fixturePayload.fixture_id);
    fixturePayload.fixture_id = fixtureId;
    await upsertFixture(fixturePayload);

    const predictionPayload = collectPredictionPayload(fixtureId, fixturePayload);
    if(editingId){
      const { error } = await supabaseClient.from('predictions').update(predictionPayload).eq('id', editingId);
      if(error) throw error;
    } else {
      const { error } = await supabaseClient.from('predictions').insert(predictionPayload);
      if(error) throw error;
    }
  }

  async function loadPredictions({ date, draftsOnly = false, publishedOnly = false } = {}){
    let request = supabaseClient
      .from('predictions')
      .select('*')
      .order('confidence', { ascending: false })
      .order('kickoff', { ascending: true });

    if(date) request = request.eq('fixture_date', date);

    const { data, error } = await request;
    if(error) throw error;
    let rows = data || [];
    if(draftsOnly) rows = rows.filter(row => row.publication_status === 'draft');
    if(publishedOnly) rows = rows.filter(row => row.publication_status !== 'draft');
    if(!rows.length) return rows;
    try {
      const fixtures = await fetchFixturesForRows(rows);
      return attachFixturesToRows(rows, fixtures);
    } catch (_fixtureError) {
      return rows;
    }
  }

  async function loadDraftPredictions(){
    return loadPredictions({ draftsOnly: true });
  }

  async function loadPublishedPredictions(date){
    return loadPredictions({ date: date || todayEatDate(), publishedOnly: true });
  }

  async function publishPrediction(id){
    const { error } = await supabaseClient
      .from('predictions')
      .update({ publication_status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id);
    if(error) throw error;
  }

  async function deletePrediction(id){
    const { error } = await supabaseClient.from('predictions').delete().eq('id', id);
    if(error) throw error;
  }

  function fixtureFromRow(row){
    const fixtureRaw = row.fixtures;
    return Array.isArray(fixtureRaw) ? (fixtureRaw[0] || null) : (fixtureRaw || null);
  }

  global.AdminPredictions = {
    FIXTURE_SELECT_TIERS,
    pickDisplayText,
    collectFixturePayload,
    collectPredictionPayload,
    savePredictionPick,
    loadDraftPredictions,
    loadPublishedPredictions,
    loadPredictions,
    publishPrediction,
    deletePrediction,
    fixtureFromRow,
  };
})(window);
