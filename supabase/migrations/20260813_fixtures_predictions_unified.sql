-- Unified tracking: fixtures = single source of truth, predictions reference fixtures.

create sequence if not exists admin_fixture_id_seq as bigint start -1 increment -1;

create or replace function public.next_admin_fixture_id()
returns bigint
language sql
as $$ select nextval('admin_fixture_id_seq') $$;

create table if not exists public.fixtures (
  fixture_id bigint primary key,
  fixture_date date not null,
  kickoff timestamptz,
  league text,
  country text,
  home_team text not null,
  away_team text not null,
  home_logo text,
  away_logo text,
  venue text,
  status text not null default 'upcoming',
  api_status text,
  home_score integer,
  away_score integer,
  current_minute integer,
  source text not null default 'api' check (source in ('api', 'admin')),
  next_sync_at timestamptz,
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fixtures_fixture_date_idx on public.fixtures (fixture_date);
create index if not exists fixtures_next_sync_at_idx on public.fixtures (next_sync_at) where next_sync_at is not null;
create index if not exists fixtures_source_idx on public.fixtures (source);

alter table public.fixtures enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'fixtures' and policyname = 'Public can view fixtures'
  ) then
    create policy "Public can view fixtures" on public.fixtures for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'fixtures' and policyname = 'Authenticated manage fixtures'
  ) then
    create policy "Authenticated manage fixtures" on public.fixtures for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Extend predictions for unified pipeline
alter table public.predictions add column if not exists reason text;
alter table public.predictions add column if not exists verdict text;
alter table public.predictions add column if not exists final_status text;
alter table public.predictions add column if not exists publication_status text not null default 'published';

create index if not exists predictions_publication_status_idx on public.predictions (publication_status);
create index if not exists predictions_fixture_id_idx on public.predictions (fixture_id);

-- Backfill fixture rows from existing predictions (best-effort)
insert into public.fixtures (
  fixture_id, fixture_date, kickoff, league, home_team, away_team,
  status, api_status, home_score, away_score, source, updated_at
)
select distinct on (p.fixture_id)
  p.fixture_id,
  p.fixture_date,
  p.kickoff,
  p.league,
  p.home_team,
  p.away_team,
  coalesce(p.status, 'upcoming'),
  p.api_status,
  p.home_score,
  p.away_score,
  'api',
  now()
from public.predictions p
where p.fixture_id is not null
  and not exists (select 1 from public.fixtures f where f.fixture_id = p.fixture_id)
order by p.fixture_id, p.updated_at desc nulls last
on conflict (fixture_id) do nothing;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'predictions_fixture_id_fkey'
  ) then
    alter table public.predictions
      add constraint predictions_fixture_id_fkey
      foreign key (fixture_id) references public.fixtures (fixture_id)
      on update cascade on delete restrict;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'predictions' and policyname = 'Authenticated manage predictions'
  ) then
    create policy "Authenticated manage predictions" on public.predictions for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Ensure columns exist when fixtures table predates this migration
alter table public.fixtures add column if not exists next_sync_at timestamptz;
alter table public.fixtures add column if not exists last_synced_at timestamptz;
alter table public.fixtures add column if not exists sync_error text;
alter table public.fixtures add column if not exists source text default 'api';
alter table public.fixtures add column if not exists current_minute integer;

notify pgrst, 'reload schema';
