-- Personal watchlist records. RLS ensures each authenticated user can only access their rows.
create extension if not exists pgcrypto;

create table if not exists public.anime (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  alternative_title text check (alternative_title is null or length(alternative_title) <= 200),
  poster_url text check (poster_url is null or length(poster_url) <= 2048),
  genres text[] not null default '{}',
  total_episodes integer check (total_episodes is null or total_episodes >= 0),
  current_episode integer not null default 0 check (current_episode >= 0),
  status text not null default 'plan_to_watch' check (status in ('watching','plan_to_watch','completed','on_hold','dropped')),
  rating numeric(3,1) check (rating is null or rating between 1 and 10),
  notes text,
  is_favorite boolean not null default false,
  season_number integer check (season_number is null or season_number > 0),
  date_started date,
  date_completed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anime_episode_within_total check (total_episodes is null or current_episode <= total_episodes)
);

create index if not exists anime_user_created_idx on public.anime (user_id, created_at desc);
create index if not exists anime_user_status_updated_idx on public.anime (user_id, status, updated_at desc);
create index if not exists anime_user_favorite_idx on public.anime (user_id, is_favorite) where is_favorite = true;

create or replace function public.set_anime_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists anime_updated_at on public.anime;
create trigger anime_updated_at before update on public.anime
for each row execute function public.set_anime_updated_at();

alter table public.anime enable row level security;
drop policy if exists "Users can read their own anime" on public.anime;
create policy "Users can read their own anime" on public.anime for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can add their own anime" on public.anime;
create policy "Users can add their own anime" on public.anime for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own anime" on public.anime;
create policy "Users can update their own anime" on public.anime for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own anime" on public.anime;
create policy "Users can delete their own anime" on public.anime for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.anime from anon;
grant select, insert, update, delete on public.anime to authenticated;
