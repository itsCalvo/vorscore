# Supabase Edge Functions

Set these secrets in Supabase Dashboard → Edge Functions → Secrets:

```text
API_FOOTBALL_KEY = already configured; do not recreate it
SYNC_SECRET = a private random value, only if scheduled sync is enabled
TRACKING_INTERVAL_SECONDS = 120 (optional; minimum 60)
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase Edge Functions. The service role key is used only by `sync-fixtures` and is never sent to the browser.

Deploy or update the functions from Supabase Dashboard → Edge Functions using the files in this folder:

`search-fixtures/index.ts` and `sync-fixtures/index.ts`.

Schedule `sync-fixtures` from Supabase Cron every 15 minutes, sending `x-sync-secret` with the private `SYNC_SECRET` value. The function only makes one grouped API request when at least one linked match is due.
