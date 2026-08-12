(function initMatchesPage(){
  let activeDate = null;

  function syncActiveDate(dates){
    const todayStr = todayEatDate();
    if(!dates.length){
      activeDate = todayStr;
      return;
    }
    if(!activeDate || !dates.includes(activeDate)){
      activeDate = dates.includes(todayStr)
        ? todayStr
        : (dates.find(date => date >= todayStr) || dates[dates.length - 1] || todayStr);
    }
  }

  function renderDateTabs(){
    const allMatches = VorScore.allMatches;
    const dates = [...new Set(
      allMatches
        .filter(match => VorScore.isTipsMatch(match))
        .map(m => VorScore.normalizeMatchDate(m.match_date))
        .filter(Boolean)
    )].sort();
    syncActiveDate(dates);
    const wrap = document.getElementById('dateTabs');
    if(!wrap) return;
    wrap.innerHTML = '';
    if(!dates.length){
      wrap.innerHTML = `<div class="date-pill active">${VorScore.formatDateLabel(activeDate)}</div>`;
      return;
    }
    dates.forEach(d => {
      const pill = document.createElement('div');
      pill.className = 'date-pill' + (d === activeDate ? ' active' : '');
      pill.textContent = VorScore.formatDateLabel(d);
      pill.onclick = () => { activeDate = d; renderDateTabs(); renderTable(); };
      wrap.appendChild(pill);
    });
  }

  function renderTable(){
    const tbody = document.getElementById('tableBody');
    if(!tbody) return;
    const rows = VorScore.allMatches
      .filter(m => VorScore.isTipsMatch(m) && VorScore.normalizeMatchDate(m.match_date) === activeDate)
      .sort((a, b) => String(a.kickoff_time || '').localeCompare(String(b.kickoff_time || '')));
    if(rows.length === 0){
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No upcoming matches for this date.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(m => {
      const cells = VorScore.matchRowCells(m);
      return `<tr>${cells.time}${cells.league}${cells.match}${cells.pick}${cells.status}${cells.result}</tr>`;
    }).join('');
  }

  async function refresh(){
    await VorScore.loadMatches();
    renderDateTabs();
    renderTable();
  }

  refresh();
  setInterval(refresh, 60000);
})();
