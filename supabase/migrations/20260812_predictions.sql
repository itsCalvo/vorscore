-- Automatic daily predictions (generated picks for Today's Tips)
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint,
  fixture_date date not null,
  kickoff timestamptz,
  kickoff_time text,
  league text,
  home_team text not null,
  away_team text not null,
  pick text,
  market text,
  selection text,
  confidence numeric check (confidence between 0 and 100),
  category text not null default 'banker',
  is_locked boolean not null default false,
  status text not null default 'upcoming',
  api_status text,
  home_score integer,
  away_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists predictions_fixture_date_idx
  on public.predictions (fixture_date);

create index if not exists predictions_fixture_date_confidence_idx
  on public.predictions (fixture_date, confidence desc);

alter table public.predictions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'predictions' and policyname = 'Public can view predictions'
  ) then
    create policy "Public can view predictions" on public.predictions for select using (true);
  end if;
end $$;
