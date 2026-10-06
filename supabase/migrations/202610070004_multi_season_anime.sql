-- Convert each user's anime entry into one series with related season progress rows.
alter table public.anime
  add constraint anime_user_id_id_unique unique (user_id, id);

create table public.anime_seasons (
  id uuid primary key default gen_random_uuid(),
  anime_id uuid not null,
  user_id uuid not null default auth.uid(),
  season_number integer not null check (season_number > 0),
  season_title text,
  total_episodes integer check (total_episodes is null or total_episodes >= 0),
  current_episode integer not null default 0 check (current_episode >= 0),
  status text not null default 'plan_to_watch' check (status in ('watching','plan_to_watch','completed','on_hold','dropped')),
  date_started date,
  date_completed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anime_seasons_episode_within_total check (total_episodes is null or current_episode <= total_episodes),
  constraint anime_seasons_series_number_unique unique (anime_id, season_number),
  constraint anime_seasons_owner_series_fk foreign key (user_id, anime_id)
    references public.anime(user_id, id) on delete cascade
);

create index anime_seasons_series_idx on public.anime_seasons (anime_id, season_number);
create index anime_seasons_user_status_idx on public.anime_seasons (user_id, status);

-- Map all old season rows to their earliest series row. Keep real season numbers when
-- unique; assign new numbers to duplicate or unnumbered legacy rows so nothing is lost.
create temporary table anime_season_migration_rows as
with series_season_counts as (
  select user_id, lower(btrim(title)) as normalized_title,
         count(*) filter (where season_number is not null)::integer as numbered_season_count,
         count(distinct season_number)::integer as distinct_season_count
  from public.anime
  group by user_id, lower(btrim(title))
), ranked as (
  select a.id as legacy_id,
         first_value(a.id) over series_rows as parent_id,
         a.user_id,
         a.title,
         a.alternative_title,
         a.poster_url,
         a.genres,
         a.total_episodes,
         a.current_episode,
         a.status,
         a.rating,
         a.notes,
         a.is_favorite,
         a.season_number as legacy_season_number,
         a.date_started,
         a.date_completed,
         a.created_at,
         a.updated_at,
         row_number() over series_rows as series_ordinal,
         count(*) over (partition by a.user_id, lower(btrim(a.title))) as series_count,
         max(coalesce(a.season_number, 0)) over (partition by a.user_id, lower(btrim(a.title))) as max_season_number,
         count(*) over (partition by a.user_id, lower(btrim(a.title)), a.season_number) as season_number_count,
         row_number() over (partition by a.user_id, lower(btrim(a.title)), a.season_number order by a.created_at, a.id) as duplicate_ordinal,
         season_counts.numbered_season_count,
         season_counts.distinct_season_count
  from public.anime a
  join series_season_counts season_counts on season_counts.user_id = a.user_id and season_counts.normalized_title = lower(btrim(a.title))
  window series_rows as (partition by a.user_id, lower(btrim(a.title)) order by a.created_at, a.id rows between unbounded preceding and unbounded following)
)
select ranked.*,
       case
         when legacy_season_number is not null and (season_number_count = 1 or duplicate_ordinal = 1) then legacy_season_number
         when legacy_season_number is not null then max_season_number + duplicate_ordinal - 1
         when max_season_number = 0 then series_ordinal
         else max_season_number + numbered_season_count - distinct_season_count + duplicate_ordinal
       end as migrated_season_number
from ranked;

insert into public.anime_seasons (
  anime_id, user_id, season_number, season_title, total_episodes, current_episode,
  status, date_started, date_completed, created_at, updated_at
)
select parent_id, user_id, migrated_season_number,
       coalesce(nullif('Season ' || migrated_season_number, ''), 'Season'),
       total_episodes, current_episode, status, date_started, date_completed, created_at, updated_at
from anime_season_migration_rows
order by parent_id, migrated_season_number;

-- Preserve series-wide metadata from any duplicate rows before removing duplicates.
with series_metadata as (
  select parent_id,
         (array_agg(alternative_title order by created_at) filter (where alternative_title is not null))[1] as alternative_title,
         (array_agg(poster_url order by created_at) filter (where poster_url is not null))[1] as poster_url,
         (select coalesce(array_agg(distinct genre.value order by genre.value), '{}'::text[])
          from anime_season_migration_rows nested
          cross join lateral unnest(nested.genres) as genre(value)
          where nested.parent_id = migration.parent_id) as genres,
         max(rating) as rating,
         string_agg('Season ' || migrated_season_number || E'\n' || notes, E'\n\n' order by migrated_season_number) filter (where notes is not null and btrim(notes) <> '') as notes,
         bool_or(is_favorite) as is_favorite,
         min(date_started) as date_started,
         min(created_at) as created_at,
         max(updated_at) as updated_at
  from anime_season_migration_rows migration
  group by parent_id
)
update public.anime parent set
  alternative_title = coalesce(meta.alternative_title, parent.alternative_title),
  poster_url = coalesce(meta.poster_url, parent.poster_url),
  genres = coalesce(meta.genres, parent.genres),
  rating = meta.rating,
  notes = meta.notes,
  is_favorite = meta.is_favorite,
  date_started = meta.date_started,
  created_at = meta.created_at,
  updated_at = meta.updated_at
from series_metadata meta
where parent.id = meta.parent_id;

delete from public.anime parent
using anime_season_migration_rows legacy
where parent.id = legacy.legacy_id and legacy.legacy_id <> legacy.parent_id;

create unique index anime_user_normalized_title_unique
  on public.anime (user_id, lower(btrim(title)));

create or replace function public.set_anime_season_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger anime_seasons_updated_at
before update on public.anime_seasons
for each row execute function public.set_anime_season_updated_at();

create or replace function public.normalize_anime_season_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if new.total_episodes is not null then new.current_episode = new.total_episodes; end if;
    new.date_completed = coalesce(new.date_completed, current_date);
  else
    new.date_completed = null;
  end if;
  return new;
end;
$$;

create trigger anime_seasons_normalize_completion
before insert or update on public.anime_seasons
for each row execute function public.normalize_anime_season_completion();

create or replace function public.prevent_anime_season_reparenting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anime_id <> old.anime_id or new.user_id <> old.user_id then
    raise exception 'A season cannot be moved to a different series or account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger anime_seasons_owner_immutable
before update on public.anime_seasons
for each row execute function public.prevent_anime_season_reparenting();

-- Keep legacy series summary fields current for existing dashboard/stat queries.
create or replace function public.sync_anime_season_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_anime_id uuid;
  season_count integer;
  current_total integer;
  known_episode_totals integer;
  episode_total integer;
  watching_count integer;
  planning_count integer;
  on_hold_count integer;
  completed_count integer;
  dropped_count integer;
  summary_status text;
  active_season integer;
  first_started date;
  last_completed date;
begin
  if tg_op = 'DELETE' then target_anime_id := old.anime_id; else target_anime_id := new.anime_id; end if;
  if not exists (select 1 from public.anime where id = target_anime_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select count(*)::integer,
         coalesce(sum(s.current_episode), 0)::integer,
         count(s.total_episodes)::integer,
         coalesce(sum(s.total_episodes), 0)::integer,
         count(*) filter (where s.status = 'watching')::integer,
         count(*) filter (where s.status = 'plan_to_watch')::integer,
         count(*) filter (where s.status = 'on_hold')::integer,
         count(*) filter (where s.status = 'completed')::integer,
         count(*) filter (where s.status = 'dropped')::integer,
         min(s.date_started),
         max(coalesce(s.date_completed, current_date)) filter (where s.status = 'completed')
  into season_count, current_total, known_episode_totals, episode_total,
       watching_count, planning_count, on_hold_count, completed_count, dropped_count,
       first_started, last_completed
  from public.anime_seasons s where s.anime_id = target_anime_id;

  if season_count = 0 then
    summary_status := 'plan_to_watch';
    active_season := null;
  else
    summary_status := case
      when completed_count = season_count then 'completed'
      when watching_count > 0 then 'watching'
      when planning_count > 0 then 'plan_to_watch'
      when on_hold_count > 0 then 'on_hold'
      else 'dropped'
    end;
    select s.season_number into active_season
    from public.anime_seasons s where s.anime_id = target_anime_id
    order by case s.status when 'watching' then 0 when 'plan_to_watch' then 1 when 'on_hold' then 2 when 'dropped' then 3 else 4 end,
             s.season_number desc
    limit 1;
  end if;

  update public.anime set
    status = summary_status,
    current_episode = current_total,
    total_episodes = case when known_episode_totals = season_count then episode_total else null end,
    season_number = active_season,
    date_started = first_started,
    date_completed = case when summary_status = 'completed' then last_completed else null end
  where id = target_anime_id;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger anime_seasons_sync_series
after insert or update or delete on public.anime_seasons
for each row execute function public.sync_anime_season_summary();
revoke all on function public.sync_anime_season_summary() from public, anon, authenticated;
revoke all on function public.normalize_anime_season_completion() from public, anon, authenticated;

-- Refresh each existing series once now that the summary trigger is installed.
update public.anime_seasons season set status = season.status
where season.id in (
  select distinct on (anime_id) id
  from public.anime_seasons
  order by anime_id, season_number
);

alter table public.anime_seasons enable row level security;
create policy "Users can read their own anime seasons"
on public.anime_seasons for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own anime seasons"
on public.anime_seasons for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own anime seasons"
on public.anime_seasons for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own anime seasons"
on public.anime_seasons for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.anime_seasons from public, anon, authenticated;
grant select, insert, delete on public.anime_seasons to authenticated;
grant update (season_number, season_title, total_episodes, current_episode, status, date_started, date_completed) on public.anime_seasons to authenticated;

-- Series summary fields are maintained by the database trigger, not user-supplied updates.
revoke insert, update on public.anime from public, anon, authenticated;
grant insert (title, alternative_title, poster_url, genres, rating, notes, is_favorite) on public.anime to authenticated;
grant update (title, alternative_title, poster_url, genres, rating, notes, is_favorite) on public.anime to authenticated;

drop table anime_season_migration_rows;
