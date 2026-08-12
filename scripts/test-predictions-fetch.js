// Quick diagnostic: can anon key read predictions?
const fs = require('fs');
const path = require('path');

const configText = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
const urlMatch = configText.match(/SUPABASE_URL\s*=\s*"([^"]+)"/);
const keyMatch = configText.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/);
const SUPABASE_URL = urlMatch?.[1];
const SUPABASE_ANON_KEY = keyMatch?.[1];

async function test(label, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/predictions?${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`\n=== ${label} ===`);
  console.log('status:', res.status);
  if (Array.isArray(data)) {
    console.log('rows:', data.length);
    if (data[0]) console.log('sample:', data[0].home_team, 'vs', data[0].away_team, data[0].fixture_date);
  } else {
    console.log('body:', data);
  }
}

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  console.log('EAT today:', today);
  await test('all predictions', 'select=*&order=confidence.desc&limit=20');
  await test('today eq filter', `select=*&fixture_date=eq.${today}&limit=20`);
  await test('2026-08-13 filter', 'select=*&fixture_date=eq.2026-08-13&limit=20');
})();
