# Supabase Edge Functions

Set these secrets in Supabase Dashboard → Edge Functions → Secrets:

```text
API_FOOTBALL_KEY = already configured; do not recreate it
SYNC_SECRET = a private random value for cron-triggered sync/settlement
TRACKING_INTERVAL_SECONDS = 120 (optional; minimum 60)
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase Edge Functions. The service role key is used only by sync/settlement functions and is never sent to the browser.

Deploy from Supabase Dashboard → Edge Functions:

| Function | Purpose |
|----------|---------|
| `search-fixtures` | Admin live API-Football search (auth required) |
| `sync-today-fixtures` | Bulk import today's API fixtures into `fixtures` (admin auth) |
| `sync-fixtures` | Poll due API fixtures, update `fixtures`, settle linked `predictions` |
| `settle-predictions` | Same pipeline as `sync-fixtures` (for existing cron jobs) |

## Cron

Schedule **`settle-predictions`** or **`sync-fixtures`** every 15 minutes with header:

```text
x-sync-secret: <SYNC_SECRET>
```

Both functions update the **`fixtures`** table (single source of truth for scores/status) and settle **`predictions`** rows linked by `fixture_id`.

## Database

Run migrations through `supabase/migrations/20260813_fixtures_predictions_unified.sql`, then if you see **`next_sync_at` schema cache errors**, also run `20260813_fixtures_columns_patch.sql` in the Supabase SQL editor.
