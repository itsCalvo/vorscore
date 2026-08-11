-- Consolidated additive migration for the existing public.matches table.
-- Safe to run against the original schema or a partially upgraded database.
-- Does not recreate tables, policies, functions, or triggers.

alter table public.matches add column if not exists external_match_id bigint;
alter table public.matches add column if not exists api_provider text;
alter table public.matches add column if not exists api_status text;
alter table public.matches add column if not exists competition_id integer;
alter table public.matches add column if not exists competition_country text;
alter table public.matches add column if not exists competition_logo_url text;
alter table public.matches add column if not exists venue text;
alter table public.matches add column if not exists home_team_id integer;
alter table public.matches add column if not exists away_team_id integer;
alter table public.matches add column if not exists current_minute integer;
alter table public.matches add column if not exists home_score integer;
alter table public.matches add column if not exists away_score integer;
alter table public.matches add column if not exists halftime_home_score integer;
alter table public.matches add column if not exists halftime_away_score integer;
alter table public.matches add column if not exists match_events jsonb;
alter table public.matches add column if not exists last_synced_at timestamptz;
alter table public.matches add column if not exists next_sync_at timestamptz;
alter table public.matches add column if not exists sync_error text;
alter table public.matches add column if not exists prediction_market text;
alter table public.matches add column if not exists prediction_selection text;
alter table public.matches add column if not exists goals_selection text;
alter table public.matches add column if not exists btts_selection text;
alter table public.matches add column if not exists prediction_result text;
alter table public.matches add column if not exists prediction_evaluated_at timestamptz;
alter table public.matches add column if not exists publication_status text not null default 'published';
alter table public.matches add column if not exists started_at timestamptz;
alter table public.matches add column if not exists finished_at timestamptz;
alter table public.matches add column if not exists goals_result text not null default 'pending';
alter table public.matches add column if not exists btts_result text not null default 'pending';

update public.matches
set api_provider = 'manual'
where api_provider is null;

update public.matches
set goals_result = 'pending'
where goals_selection is not null and goals_result is null;

update public.matches
set btts_result = 'pending'
where btts_selection is not null and btts_result is null;

create unique index if not exists matches_external_match_id_uidx
  on public.matches (external_match_id)
  where external_match_id is not null;

create index if not exists matches_next_sync_at_idx
  on public.matches (next_sync_at)
  where external_match_id is not null and next_sync_at is not null;

create index if not exists matches_api_status_idx
  on public.matches (api_status)
  where external_match_id is not null;

create index if not exists matches_tracking_due_idx
  on public.matches (next_sync_at)
  where external_match_id is not null and next_sync_at is not null;
