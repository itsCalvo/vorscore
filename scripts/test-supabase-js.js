const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const configText = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
const url = configText.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)[1];
const key = configText.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];
const client = createClient(url, key);

(async () => {
  const date = '2026-08-13';
  const resp = await client.from('predictions').select('*').eq('fixture_date', date).order('kickoff', { ascending: true });
  console.log('error:', resp.error);
  console.log('rows:', resp.data?.length);
  if (resp.data?.[0]) console.log('sample:', resp.data[0].home_team, resp.data[0].kickoff, resp.data[0].pick);

  const { data: manual, error: mErr } = await client.from('matches').select('*').order('match_date').order('kickoff_time');
  console.log('manual error:', mErr?.message);
  console.log('manual rows:', manual?.length);
})();
