-- Public discovery uses narrowly scoped RPCs so profiles and anime rows remain private
-- under their existing table RLS policies. No public SELECT policy is added to either table.

alter table public.profiles
  add column if not exists is_library_public boolean not null default false;

grant update (is_library_public) on public.profiles to authenticated;

create index if not exists profiles_username_search_idx
  on public.profiles (lower(username) text_pattern_ops);
create index if not exists profiles_full_name_search_idx
  on public.profiles (lower(full_name) text_pattern_ops)
  where full_name <> '';
create index if not exists anime_user_title_public_page_idx
  on public.anime (user_id, lower(title), id);
create index if not exists anime_genres_search_idx
  on public.anime using gin (genres);

create or replace function public.search_public_profiles(
  p_query text,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (id uuid, username text, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.full_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> (select auth.uid())
    and pg_catalog.length(pg_catalog.btrim(coalesce(p_query, ''))) >= 2
    and (
      pg_catalog.lower(p.username) like pg_catalog.lower(pg_catalog.btrim(p_query)) || '%'
      or pg_catalog.lower(p.full_name) like pg_catalog.lower(pg_catalog.btrim(p_query)) || '%'
    )
  order by pg_catalog.lower(p.full_name), pg_catalog.lower(p.username), p.id
  limit greatest(1, least(coalesce(p_limit, 10), 20))
  offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

create or replace function public.get_public_profile(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'is_library_public', p.is_library_public,
    'stats', case when p.is_library_public then (
      select jsonb_build_object(
        'total', pg_catalog.count(*),
        'watching', pg_catalog.count(*) filter (where a.status = 'watching'),
        'completed', pg_catalog.count(*) filter (where a.status = 'completed'),
        'plan_to_watch', pg_catalog.count(*) filter (where a.status = 'plan_to_watch'),
        'on_hold', pg_catalog.count(*) filter (where a.status = 'on_hold'),
        'dropped', pg_catalog.count(*) filter (where a.status = 'dropped')
      )
      from public.anime a
      where a.user_id = p.id
    ) else null end
  )
  from public.profiles p
  where auth.uid() is not null
    and pg_catalog.lower(p.username) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_username, '')))
  limit 1;
$$;

create or replace function public.get_public_user_library(
  p_username text,
  p_limit integer default 24,
  p_offset integer default 0,
  p_search text default '',
  p_status text default '',
  p_genre text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  target_is_public boolean;
  page_size integer := greatest(1, least(coalesce(p_limit, 24), 24));
  page_offset integer := greatest(0, least(coalesce(p_offset, 0), 100000));
  search_term text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  status_filter text := nullif(pg_catalog.btrim(coalesce(p_status, '')), '');
  genre_filter text := nullif(pg_catalog.btrim(coalesce(p_genre, '')), '');
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if status_filter is not null and status_filter not in ('watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped') then
    raise exception 'Invalid library status' using errcode = '22023';
  end if;

  select p.id, p.is_library_public into target_id, target_is_public
  from public.profiles p
  where pg_catalog.lower(p.username) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_username, '')))
  limit 1;

  if target_id is null or (not target_is_public and target_id <> (select auth.uid())) then
    return jsonb_build_object('is_public', false, 'items', '[]'::jsonb, 'total', 0, 'has_more', false);
  end if;

  with filtered as (
    select a.*
    from public.anime a
    where a.user_id = target_id
      and (search_term is null or a.title ilike '%' || search_term || '%' or a.alternative_title ilike '%' || search_term || '%')
      and (status_filter is null or a.status = status_filter)
      and (genre_filter is null or genre_filter = any(a.genres))
  ), page as (
    select f.* from filtered f
    order by pg_catalog.lower(f.title), f.id
    limit page_size offset page_offset
  )
  select jsonb_build_object(
    'is_public', true,
    'total', (select pg_catalog.count(*) from filtered),
    'has_more', (select pg_catalog.count(*) from filtered) > page_offset + page_size,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'title', a.title,
          'alternative_title', a.alternative_title,
          'poster_url', a.poster_url,
          'genres', a.genres,
          'status', a.status,
          'total_episodes', a.total_episodes,
          'synopsis', a.synopsis,
          'release_date', a.release_date,
          'community_rating', a.community_rating,
          'external_provider', a.external_provider,
          'external_id', a.external_id,
          'external_url', a.external_url,
          'seasons', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'season_number', s.season_number,
                'season_title', s.season_title,
                'total_episodes', s.total_episodes,
                'status', s.status,
                'media_type', s.media_type,
                'external_provider', s.external_provider,
                'external_id', s.external_id,
                'external_show_id', s.external_show_id,
                'external_url', s.external_url
              ) order by s.season_number
            )
            from public.anime_seasons s
            where s.anime_id = a.id and s.user_id = a.user_id
          ), '[]'::jsonb)
        ) order by pg_catalog.lower(a.title), a.id
      )
      from page a
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- A caller can only check whether its own entries match these public-safe keys.
create or replace function public.get_my_anime_match_keys(p_title_keys text[], p_external_keys text[])
returns table (title_key text, external_key text)
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.btrim(a.title)),
    case when a.external_provider is not null and a.external_id is not null
      then a.external_provider || ':' || a.external_id::text else null end
  from public.anime a
  where a.user_id = (select auth.uid())
    and (
      pg_catalog.lower(pg_catalog.btrim(a.title)) = any(coalesce(p_title_keys, array[]::text[]))
      or (a.external_provider is not null and a.external_id is not null
        and a.external_provider || ':' || a.external_id::text = any(coalesce(p_external_keys, array[]::text[])))
    )
  union
  select null::text, s.external_provider || ':' || s.external_id::text
  from public.anime_seasons s
  where s.user_id = (select auth.uid())
    and s.external_provider is not null and s.external_id is not null
    and s.external_provider || ':' || s.external_id::text = any(coalesce(p_external_keys, array[]::text[]));
$$;

revoke all on function public.search_public_profiles(text, integer, integer) from public, anon;
revoke all on function public.get_public_profile(text) from public, anon;
revoke all on function public.get_public_user_library(text, integer, integer, text, text, text) from public, anon;
revoke all on function public.get_my_anime_match_keys(text[], text[]) from public, anon;
grant execute on function public.search_public_profiles(text, integer, integer) to authenticated;
grant execute on function public.get_public_profile(text) to authenticated;
grant execute on function public.get_public_user_library(text, integer, integer, text, text, text) to authenticated;
grant execute on function public.get_my_anime_match_keys(text[], text[]) to authenticated;

comment on function public.search_public_profiles(text, integer, integer) is
  'Searches public-safe profile fields only; never returns email, role, or auth metadata.';
comment on function public.get_public_user_library(text, integer, integer, text, text, text) is
  'Returns only public-safe anime metadata; excludes personal rating, notes, favorites, dates, and watched episode progress.';
