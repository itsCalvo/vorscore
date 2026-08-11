# VorScore Tips — setup guide

You have three files that work together:

- `index.html` — the public site your visitors see
- `admin.html` — your private dashboard for adding/editing tips
- `config.js` — the one file that connects both to your database
- `schema.sql` — run once to create your database table

## 1. Create your database (5 minutes)

1. Go to [supabase.com](https://supabase.com) and create a free account + new project.
2. Once it's ready, open **SQL Editor** in the left sidebar → **New query**.
3. Paste in everything from `schema.sql` and click **Run**.
4. Go to **Project Settings → API**. Copy your **Project URL** and **anon public** key.
5. Open `config.js` and paste them in place of `YOUR_SUPABASE_PROJECT_URL` and `YOUR_SUPABASE_ANON_KEY`.

### Enable automatic fixture tracking

Run `supabase/migrations/20260809_api_football_tracking.sql` in Supabase SQL Editor. It only adds columns and indexes to the existing `matches` table; it does not recreate the table or policies.

Then run `supabase/migrations/20260810_selected_match_tracking.sql` to add tracking timestamps and independent goals/BTTS result fields. Set the optional `TRACKING_INTERVAL_SECONDS` Edge Function secret to `120` (minimum 60) and redeploy `sync-fixtures`.

The API-Football secret is already configured in Supabase Dashboard and must remain there. Do not add it to frontend files.

Deploy or update the functions from **Supabase Dashboard → Edge Functions** using the code in:

- `supabase/functions/search-fixtures/index.ts`
- `supabase/functions/sync-fixtures/index.ts`

The synchronization endpoint also uses `SYNC_SECRET` because a scheduled endpoint that accepts requests without authentication could be called by anyone and consume your API quota. Add it only in **Supabase Dashboard → Edge Functions → Secrets**, using a private random value that you generate yourself:

```text
SYNC_SECRET = [your private random value]
```

Create a Supabase Cron job from the Dashboard to call `sync-fixtures` every 15 minutes with the header `x-sync-secret` set to that same private value. The function batches due fixture IDs into one API request and skips calls when nothing is due, keeping normal usage well below the free 100-request daily limit.

The admin fixture search calls `search-fixtures` after login. API-Football is queried by date and filtered locally, so matches from any country or competition are supported and ambiguous results are never selected automatically.

## 2. Create your admin login

1. In Supabase, go to **Authentication → Users → Add user**.
2. Enter the email and password you'll use to log into `admin.html`. Untick "auto confirm" only if you want an email verification step — for a single admin account, tick "Auto Confirm User" to skip that.
3. That's your login — no separate signup page needed since you're the only admin.

## 3. Put it online

Any static host works since there's no server to run:

- **Netlify** — drag the folder onto app.netlify.com/drop. Done in under a minute.
- **Vercel** — `vercel deploy` from the folder, or connect a GitHub repo.
- **GitHub Pages** — push the folder to a repo, enable Pages in settings.

Keep `admin.html` un-linked from your public navigation (don't put it in a menu) — it's still protected by login, but there's no reason to advertise the URL. Bookmark it yourself.

## 4. Your daily workflow

1. Go to `yoursite.com/admin.html`, log in.
2. Fill in the match form — teams, odds, your tip, trust score, lock status.
3. Hit **Save match** — it appears on the live site instantly, no redeploy needed.
4. After the match finishes: edit that row, add the score, set Status to "Finished", and mark Result as Win or Loss. This feeds your Success Rate stat automatically — the single biggest trust signal on a tips site, so keep it honest and current.

## Phase 2 ideas (once the basics are running)

- **Auto-pull fixtures**: connect API-Football (free tier, 1,200+ leagues, ~100 requests/day) so you can pick a match from a dropdown instead of typing team names — badges and kickoff times fill in automatically. This needs a small serverless function to keep your API key off the public site.
- **Payments/subscriptions**: Paystack or IntaSend both support M-Pesa and card payments and work well for an East Africa audience. Gate `is_locked` tips behind a paid Supabase user role.
- **Responsible gambling notice**: add an 18+ / "for entertainment purposes" disclaimer in the footer — standard practice for any tips or predictions site and worth having from day one, both for user trust and for ad/payment-provider compliance.
