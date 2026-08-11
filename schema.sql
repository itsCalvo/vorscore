-- ============================================================
-- VorScore Tips — Database schema
-- Run this in Supabase: Project -> SQL Editor -> New query -> Run
-- ============================================================

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  kickoff_time text not null,          -- e.g. "18:30"
  status text not null default 'upcoming', -- upcoming | live | finished
  league text,
  home_team text not null,
  home_badge_url text,
  away_team text not null,
  away_badge_url text,
  score text,                          -- e.g. "1 : 2", null until finished
  odds_home numeric,
  odds_draw numeric,
  odds_away numeric,
  tip text,                            -- e.g. "2.3"
  tip_sub text,                        -- e.g. "2" (meaning of the tip)
  goals_tip text,
  goals_sub text,                      -- e.g. "U2.5"
  gg_tip text,
  gg_sub text,                         -- e.g. "NO"
  best_tip text,
  best_sub text,
  trust_score int check (trust_score between 1 and 10),
  category text not null default 'banker', -- banker | slip_of_day
  is_locked boolean not null default true, -- true = subscribers only
  result text,                         -- pending | win | loss (fill in after match ends)
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table matches enable row level security;

-- Anyone (including logged-out visitors) can READ matches.
-- Preserve an existing policy with the same name and avoid 42710 on reruns.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'matches' and policyname = 'Public can view matches') then
    create policy "Public can view matches" on public.matches for select using (true);
  end if;
end $$;

-- Only a logged-in user (you, the admin) can INSERT/UPDATE/DELETE.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'matches' and policyname = 'Authenticated users can insert matches') then
    create policy "Authenticated users can insert matches" on public.matches for insert to authenticated with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'matches' and policyname = 'Authenticated users can update matches') then
    create policy "Authenticated users can update matches" on public.matches for update to authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'matches' and policyname = 'Authenticated users can delete matches') then
    create policy "Authenticated users can delete matches" on public.matches for delete to authenticated using (true);
  end if;
end $$;

-- Blog content managed from admin.html
create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content text not null default '',
  category text not null default 'explainer', -- analysis | strategy | explainer
  cover_label text not null default 'GUIDE',
  cover_tone text not null default 'navy', -- navy | teal | gold
  reading_minutes int not null default 5 check (reading_minutes between 1 and 60),
  status text not null default 'draft', -- draft | published
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table blog_posts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blog_posts' and policyname = 'Public can view published blog posts') then
    create policy "Public can view published blog posts" on public.blog_posts for select using (status = 'published');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blog_posts' and policyname = 'Authenticated users can view all blog posts') then
    create policy "Authenticated users can view all blog posts" on public.blog_posts for select to authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blog_posts' and policyname = 'Authenticated users can insert blog posts') then
    create policy "Authenticated users can insert blog posts" on public.blog_posts for insert to authenticated with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blog_posts' and policyname = 'Authenticated users can update blog posts') then
    create policy "Authenticated users can update blog posts" on public.blog_posts for update to authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blog_posts' and policyname = 'Authenticated users can delete blog posts') then
    create policy "Authenticated users can delete blog posts" on public.blog_posts for delete to authenticated using (true);
  end if;
end $$;

-- ============================================================
-- Next step: create your admin login
-- Supabase Dashboard -> Authentication -> Users -> Add user
-- Enter your email + a password. That's the login for admin.html
-- ============================================================
