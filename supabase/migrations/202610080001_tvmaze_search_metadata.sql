-- Add optional TVmaze provenance/metadata without changing any existing library data.
alter table public.anime
  add column if not exists synopsis text,
  add column if not exists release_date date,
  add column if not exists community_rating numeric(3,1)
    check (community_rating is null or community_rating between 0 and 10),
  add column if not exists external_provider text
    check (external_provider is null or external_provider = 'tvmaze'),
  add column if not exists external_id bigint
    check (external_id is null or external_id > 0),
  add column if not exists external_url text,
  add column if not exists metadata_updated_at timestamptz;

alter table public.anime_seasons
  add column if not exists media_type text
    check (media_type is null or media_type in ('tv','movie','ova','ona','special','recap','spin_off','remake','other')),
  add column if not exists external_provider text
    check (external_provider is null or external_provider = 'tvmaze'),
  add column if not exists external_id bigint
    check (external_id is null or external_id > 0),
  add column if not exists external_show_id bigint
    check (external_show_id is null or external_show_id > 0),
  add column if not exists external_url text;

create unique index if not exists anime_user_external_id_unique
  on public.anime (user_id, external_provider, external_id)
  where external_provider is not null and external_id is not null;

create unique index if not exists anime_season_user_external_id_unique
  on public.anime_seasons (user_id, external_provider, external_id)
  where external_provider is not null and external_id is not null;

-- Preserve the existing per-user RLS model and column-level write grants.
grant insert (title, alternative_title, poster_url, genres, rating, notes, is_favorite,
  synopsis, release_date, community_rating, external_provider, external_id, external_url,
  metadata_updated_at) on public.anime to authenticated;
grant update (title, alternative_title, poster_url, genres, rating, notes, is_favorite,
  synopsis, release_date, community_rating, external_provider, external_id, external_url,
  metadata_updated_at) on public.anime to authenticated;
grant insert (anime_id, user_id, season_number, season_title, total_episodes, current_episode,
  status, date_started, date_completed, media_type, external_provider, external_id,
  external_show_id, external_url) on public.anime_seasons to authenticated;
grant update (season_number, season_title, total_episodes, current_episode, status,
  date_started, date_completed, media_type, external_provider, external_id,
  external_show_id, external_url) on public.anime_seasons to authenticated;

-- Create the anime parent and all selected season rows as one database transaction.
create or replace function public.create_anime_with_seasons(p_anime jsonb, p_seasons jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_anime_id uuid;
  season jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_anime) <> 'object' or jsonb_typeof(p_seasons) <> 'array'
     or jsonb_array_length(p_seasons) = 0 then
    raise exception 'Anime details and at least one season are required' using errcode = '22023';
  end if;

  insert into public.anime (
    title, alternative_title, poster_url, genres, rating, notes, is_favorite,
    synopsis, release_date, community_rating, external_provider, external_id,
    external_url, metadata_updated_at
  ) values (
    p_anime->>'title', nullif(p_anime->>'alternative_title', ''),
    nullif(p_anime->>'poster_url', ''),
    array(select jsonb_array_elements_text(coalesce(p_anime->'genres', '[]'::jsonb))),
    nullif(p_anime->>'rating', '')::numeric, nullif(p_anime->>'notes', ''),
    coalesce((p_anime->>'is_favorite')::boolean, false),
    nullif(p_anime->>'synopsis', ''), nullif(p_anime->>'release_date', '')::date,
    nullif(p_anime->>'community_rating', '')::numeric,
    nullif(p_anime->>'external_provider', ''),
    nullif(p_anime->>'external_id', '')::bigint,
    nullif(p_anime->>'external_url', ''),
    nullif(p_anime->>'metadata_updated_at', '')::timestamptz
  ) returning id into new_anime_id;

  for season in select value from jsonb_array_elements(p_seasons)
  loop
    insert into public.anime_seasons (
      anime_id, season_number, season_title, total_episodes, current_episode,
      status, date_started, date_completed, media_type, external_provider,
      external_id, external_show_id, external_url
    ) values (
      new_anime_id, (season->>'season_number')::integer,
      nullif(season->>'season_title', ''), nullif(season->>'total_episodes', '')::integer,
      coalesce(nullif(season->>'current_episode', '')::integer, 0),
      coalesce(nullif(season->>'status', ''), 'plan_to_watch'),
      nullif(season->>'date_started', '')::date,
      nullif(season->>'date_completed', '')::date,
      nullif(season->>'media_type', ''), nullif(season->>'external_provider', ''),
      nullif(season->>'external_id', '')::bigint,
      nullif(season->>'external_show_id', '')::bigint,
      nullif(season->>'external_url', '')
    );
  end loop;

  return new_anime_id;
end;
$$;

revoke all on function public.create_anime_with_seasons(jsonb, jsonb) from public, anon;
grant execute on function public.create_anime_with_seasons(jsonb, jsonb) to authenticated;
