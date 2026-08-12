(function initTipsPage(){
  let activeDate = null;
  let activeCategory = 'all';

  function renderPickRows(picks){
    const tbody = document.getElementById('tableBody');
    if(!tbody) return;
    if(!picks || picks.length === 0){
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No tips posted for this date yet — check back soon.</td></tr>';
      return;
    }
    tbody.innerHTML = picks.map(p => {
      const [home = '', away = ''] = String(p.match || '').split(' vs ');
      const matchHtml = home && away
        ? `<strong>${VorScore.escapeHtml(home)}</strong> <span class="team-name">vs</span> <strong>${VorScore.escapeHtml(away)}</strong>`
        : VorScore.escapeHtml(p.match || '—');
      const scoreHtml = (p.home_score != null && p.away_score != null)
        ? `<div class="score-pill">${VorScore.escapeHtml(p.home_score)} : ${VorScore.escapeHtml(p.away_score)}</div>`
        : '';
        return `<tr>
          <td class="date-cell" data-label="Time (EAT)"><div class="date-time">${VorScore.escapeHtml(p.time ?? '—')}</div></td>
          <td data-label="League">${VorScore.escapeHtml(p.league ?? '—')}</td>
          <td data-label="Match">${matchHtml}${scoreHtml}</td>
          <td class="table-pick" data-label="Pick">${VorScore.escapeHtml(p.pick ?? '—')}</td>
        <td class="table-status" data-label="Status"><span class="status-pill">${VorScore.escapeHtml(p.status_text ?? p.status ?? '⏳ UPCOMING')}</span></td>
        <td class="table-result pending" data-label="Result">${VorScore.escapeHtml(p.result_text ?? (p.result === 'win' ? '✅ WIN' : p.result === 'loss' ? '❌ LOSS' : '⏳ PENDING'))}</td>
      </tr>`;
    }).join('');
  }

  function renderAllPicks(picks){
    renderPickRows(picks ?? window.vorScoreData?.allPicks ?? []);
  }

  function renderBankers(picks){
    renderPickRows(picks ?? window.vorScoreData?.bankers ?? []);
  }

  function renderSlipOfTheDay(picks){
    const rows = picks ?? window.vorScoreData?.slipOfTheDay ?? [];
    renderPickRows(rows.map(p => ({
      ...p,
      pick: p.confidence != null ? `${p.pick ?? '—'} — ${Math.round(Number(p.confidence))}%` : (p.pick ?? '—'),
    })));
  }

  window.renderAllPicks = renderAllPicks;
  window.renderBankers = renderBankers;
  window.renderSlipOfTheDay = renderSlipOfTheDay;
  window.renderTipsTabs = renderActiveTab;

  function renderActiveTab(){
    if(activeCategory === 'banker') renderBankers();
    else if(activeCategory === 'slip_of_day') renderSlipOfTheDay();
    else renderAllPicks();
  }

  function syncActiveDate(dates){
    const todayStr = todayEatDate();
    const predictionDate = VorScore.activePredictionDate;

    if(predictionDate && window.vorScoreData?.allPicks?.length && !dates.includes(predictionDate)){
      dates.push(predictionDate);
      dates.sort();
    }

    if(predictionDate && window.vorScoreData?.allPicks?.length){
      activeDate = predictionDate;
      return;
    }

    if(!dates.length){
      activeDate = predictionDate || todayStr;
      return;
    }

    if(!activeDate || !dates.includes(activeDate)){
      activeDate = dates.includes(todayStr)
        ? todayStr
        : (dates.find(date => date >= todayStr) || dates[dates.length - 1] || todayStr);
    }
  }

  function renderDateTabs(){
    const predictionDate = VorScore.activePredictionDate;
    const dates = predictionDate && window.vorScoreData?.allPicks?.length
      ? [predictionDate]
      : [];
    syncActiveDate(dates);
    const wrap = document.getElementById('dateTabs');
    if(!wrap) return;
    wrap.innerHTML = '';
    const label = VorScore.formatDateLabel(activeDate);
    wrap.innerHTML = `<div class="date-pill active">${label}</div>`;
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeCategory = tab.dataset.cat;
      renderActiveTab();
    });
  });

  const bannerClose = document.getElementById('bannerClose');
  bannerClose?.addEventListener('click', () => {
    document.getElementById('banner').style.display = 'none';
  });

  async function refresh(){
    try {
      await VorScore.loadMatches();
      renderDateTabs();
      renderActiveTab();
      const count = window.vorScoreData?.allPicks?.length ?? 0;
      console.log('[VorScore] tips refresh complete, picks:', count);
      if(!count){
        const tbody = document.getElementById('tableBody');
        if(tbody){
          tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No tips loaded — open DevTools (F12) and check for blocked requests to supabase.co.</td></tr>';
        }
      }
    } catch (error) {
      console.error('Tips refresh failed:', error);
      const tbody = document.getElementById('tableBody');
      if(tbody){
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Could not load tips. Check your connection and refresh.</td></tr>';
      }
    }
  }

  window.addEventListener('vorscore:data-ready', () => {
    renderDateTabs();
    renderActiveTab();
  });

  refresh();
  setInterval(refresh, 60000);
})();
