-- Link predictions.fixture_id → fixtures.fixture_id so PostgREST can embed joins.
-- Safe to re-run.

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
  case when p.fixture_id > 0 then 'api' else 'admin' end,
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

notify pgrst, 'reload schema';
