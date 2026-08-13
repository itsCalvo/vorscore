(function initHistoryPage(){
  let activeHistoryDate = null;
  let historyDateList = [];

  function formatHistoryTabLabel(dateStr){
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('en-KE', { day:'numeric', month:'short', timeZone: APP_TIMEZONE });
  }

  function renderTrackRecordStats(){
    const wrap = document.getElementById('trackRecordStats');
    if(!wrap || typeof VorScore.getTrackRecordStats !== 'function') return;
    const stats = VorScore.getTrackRecordStats();
    const winRateLabel = stats.winRate != null ? `${stats.winRate}%` : '—';
    wrap.innerHTML = `
      <div class="stat-card stat-card--highlight">
        <span class="stat-label">Win rate</span>
        <strong class="stat-value">${VorScore.escapeHtml(String(winRateLabel))}</strong>
        <span class="stat-sub">${stats.settled} settled picks</span>
      </div>
      <div class="stat-card stat-card--win">
        <span class="stat-label">Wins</span>
        <strong class="stat-value">${stats.wins}</strong>
        <span class="stat-sub">correct calls</span>
      </div>
      <div class="stat-card stat-card--loss">
        <span class="stat-label">Losses</span>
        <strong class="stat-value">${stats.losses}</strong>
        <span class="stat-sub">missed picks</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Archive</span>
        <strong class="stat-value">${stats.days}</strong>
        <span class="stat-sub">${stats.total} total picks · ${stats.locked} locked</span>
      </div>`;
  }

  function updateHistoryNav(groups){
    const index = historyDateList.indexOf(activeHistoryDate);
    const prevBtn = document.getElementById('historyPrev');
    const nextBtn = document.getElementById('historyNext');
    const label = document.getElementById('historyNavLabel');
    if(index < 0) return;

    prevBtn.disabled = index >= historyDateList.length - 1;
    nextBtn.disabled = index <= 0;
    label.textContent = formatHistoryDateHeading(activeHistoryDate);

    prevBtn.onclick = () => {
      if(index >= historyDateList.length - 1) return;
      activeHistoryDate = historyDateList[index + 1];
      renderHistory();
    };
    nextBtn.onclick = () => {
      if(index <= 0) return;
      activeHistoryDate = historyDateList[index - 1];
      renderHistory();
    };
  }

  function renderHistoryDateTabs(){
    const groups = VorScore.getHistoryGroups();
    historyDateList = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    const wrap = document.getElementById('historyDateTabs');
    const nav = document.getElementById('historyNav');

    if(!historyDateList.length){
      wrap.innerHTML = '';
      nav.hidden = true;
      activeHistoryDate = null;
      return;
    }

    if(!activeHistoryDate || !historyDateList.includes(activeHistoryDate)){
      activeHistoryDate = historyDateList[0];
    }

    wrap.innerHTML = historyDateList.map(date => {
      const count = groups[date].length;
      const active = date === activeHistoryDate ? ' active' : '';
      return `<button type="button" class="date-pill${active}" data-history-date="${date}">${formatHistoryTabLabel(date)} · ${count}</button>`;
    }).join('');

    wrap.querySelectorAll('[data-history-date]').forEach(pill => {
      pill.addEventListener('click', () => {
        activeHistoryDate = pill.dataset.historyDate;
        renderHistory();
      });
    });

    wrap.querySelector('.date-pill.active')?.scrollIntoView({ inline:'center', block:'nearest', behavior:'smooth' });
    nav.hidden = historyDateList.length <= 1;
    updateHistoryNav(groups);
  }

  function renderHistory(){
    renderTrackRecordStats();
    renderHistoryDateTabs();
    const archive = document.getElementById('historyArchive');
    const groups = VorScore.getHistoryGroups();

    if(!historyDateList.length){
      archive.innerHTML = '<div class="history-empty">No finished predictions yet.</div>';
      return;
    }

    const matches = groups[activeHistoryDate] || [];
    archive.innerHTML = matches.length
      ? VorScore.renderHistoryDaySection(activeHistoryDate, matches)
      : '<div class="history-empty">No picks for this date.</div>';
  }

  async function refresh(){
    await VorScore.loadMatches();
    renderHistory();
  }

  refresh();
  setInterval(refresh, 60000);
})();
