-- Additive fields for selected-match tracking and independent prediction results.
-- Run after 20260809_api_football_tracking.sql.

alter table matches add column if not exists started_at timestamptz;
alter table matches add column if not exists finished_at timestamptz;
alter table matches add column if not exists goals_result text not null default 'pending';
alter table matches add column if not exists btts_result text not null default 'pending';

update matches
set prediction_result = coalesce(prediction_result, 'pending'),
    goals_result = coalesce(goals_result, 'pending'),
    btts_result = coalesce(btts_result, 'pending');

create index if not exists matches_tracking_due_idx
  on matches (next_sync_at)
  where external_match_id is not null and next_sync_at is not null;