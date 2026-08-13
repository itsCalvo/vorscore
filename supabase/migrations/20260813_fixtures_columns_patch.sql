-- Patch fixtures table when it was created without sync/tracking columns.
-- Safe to re-run: every statement is idempotent.

alter table public.fixtures add column if not exists fixture_date date;
alter table public.fixtures add column if not exists kickoff timestamptz;
alter table public.fixtures add column if not exists league text;
alter table public.fixtures add column if not exists country text;
alter table public.fixtures add column if not exists home_team text;
alter table public.fixtures add column if not exists away_team text;
alter table public.fixtures add column if not exists home_logo text;
alter table public.fixtures add column if not exists away_logo text;
alter table public.fixtures add column if not exists venue text;
alter table public.fixtures add column if not exists status text default 'upcoming';
alter table public.fixtures add column if not exists api_status text;
alter table public.fixtures add column if not exists home_score integer;
alter table public.fixtures add column if not exists away_score integer;
alter table public.fixtures add column if not exists current_minute integer;
alter table public.fixtures add column if not exists source text default 'api';
alter table public.fixtures add column if not exists next_sync_at timestamptz;
alter table public.fixtures add column if not exists last_synced_at timestamptz;
alter table public.fixtures add column if not exists sync_error text;
alter table public.fixtures add column if not exists created_at timestamptz default now();
alter table public.fixtures add column if not exists updated_at timestamptz default now();

-- Ensure admin fixture id helper exists
create sequence if not exists admin_fixture_id_seq as bigint start -1 increment -1;

create or replace function public.next_admin_fixture_id()
returns bigint
language sql
as $$ select nextval('admin_fixture_id_seq') $$;

-- Prediction columns used by admin + settlement
alter table public.predictions add column if not exists reason text;
alter table public.predictions add column if not exists verdict text;
alter table public.predictions add column if not exists final_status text;
alter table public.predictions add column if not exists publication_status text not null default 'published';

create index if not exists fixtures_next_sync_at_idx on public.fixtures (next_sync_at) where next_sync_at is not null;
create index if not exists fixtures_fixture_date_idx on public.fixtures (fixture_date);
create index if not exists predictions_publication_status_idx on public.predictions (publication_status);

-- Refresh PostgREST schema cache after column changes
notify pgrst, 'reload schema';
