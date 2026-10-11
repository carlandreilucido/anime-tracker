-- Let signed-in users find profiles by any part of a display name or username.
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
  with search_term as (
    select pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, ''))) as value
  )
  select p.id, p.username, p.full_name, p.avatar_url
  from public.profiles p
  cross join search_term q
  where auth.uid() is not null
    and p.id <> (select auth.uid())
    and pg_catalog.length(q.value) >= 2
    and (
      pg_catalog.strpos(pg_catalog.lower(p.username), q.value) > 0
      or pg_catalog.strpos(pg_catalog.lower(p.full_name), q.value) > 0
    )
  order by
    case when pg_catalog.lower(p.username) like q.value || '%'
      or pg_catalog.lower(p.full_name) like q.value || '%' then 0 else 1 end,
    pg_catalog.lower(p.full_name),
    pg_catalog.lower(p.username),
    p.id
  limit greatest(1, least(coalesce(p_limit, 10), 20))
  offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

comment on function public.search_public_profiles(text, integer, integer) is
  'Searches public-safe profile names and usernames by substring; never returns email, role, or auth metadata.';
