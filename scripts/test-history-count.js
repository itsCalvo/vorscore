const fs = require('fs');
const path = require('path');

const configText = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
const url = configText.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)[1];
const key = configText.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const res = await fetch(`${url}/rest/v1/predictions?select=id,fixture_date,home_team,away_team,is_locked&fixture_date=eq.2026-08-12&limit=100`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const rows = await res.json();
  console.log('2026-08-12 prediction count:', rows.length);
  console.log('locked:', rows.filter(r => r.is_locked).length);
})();
