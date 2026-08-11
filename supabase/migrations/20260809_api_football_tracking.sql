-- Safe additive migration for API-Football fixture tracking.
-- Run after the existing matches table has been created.

alter table matches add column if not exists external_match_id bigint;
alter table matches add column if not exists api_provider text;
alter table matches add column if not exists api_status text;
alter table matches add column if not exists competition_id integer;
alter table matches add column if not exists competition_country text;
alter table matches add column if not exists competition_logo_url text;
alter table matches add column if not exists venue text;
alter table matches add column if not exists home_team_id integer;
alter table matches add column if not exists away_team_id integer;
alter table matches add column if not exists current_minute integer;
alter table matches add column if not exists home_score integer;
alter table matches add column if not exists away_score integer;
alter table matches add column if not exists halftime_home_score integer;
alter table matches add column if not exists halftime_away_score integer;
alter table matches add column if not exists match_events jsonb;
alter table matches add column if not exists last_synced_at timestamptz;
alter table matches add column if not exists next_sync_at timestamptz;
alter table matches add column if not exists sync_error text;
alter table matches add column if not exists prediction_market text;
alter table matches add column if not exists prediction_selection text;
alter table matches add column if not exists goals_selection text;
alter table matches add column if not exists btts_selection text;
alter table matches add column if not exists prediction_result text;
alter table matches add column if not exists prediction_evaluated_at timestamptz;
alter table matches add column if not exists publication_status text not null default 'published';

update matches
set api_provider = 'manual'
where api_provider is null;

create unique index if not exists matches_external_match_id_uidx
  on matches (external_match_id)
  where external_match_id is not null;

create index if not exists matches_next_sync_at_idx
  on matches (next_sync_at)
  where external_match_id is not null and next_sync_at is not null;

create index if not exists matches_api_status_idx
  on matches (api_status)
  where external_match_id is not null;
