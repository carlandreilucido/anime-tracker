-- Normalize an optional leading @ and safely search partial profile names/usernames.
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
  with trimmed_term as (
    select pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, ''))) as value
  ), escaped_term as (
    select value,
      replace(replace(replace(value, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') as pattern
    from trimmed_term
  ), search_patterns as (
    select value,
      '%' || pattern || '%' as partial_pattern,
      pattern || '%' as prefix_pattern
    from escaped_term
  )
  select p.id, p.username, p.full_name, p.avatar_url
  from public.profiles p
  cross join search_patterns q
  where auth.uid() is not null
    and p.id <> (select auth.uid())
    and pg_catalog.length(q.value) >= 2
    and (
      p.username ilike q.partial_pattern escape E'\\'
      or p.full_name ilike q.partial_pattern escape E'\\'
    )
  order by
    case when p.username ilike q.prefix_pattern escape E'\\'
      or p.full_name ilike q.prefix_pattern escape E'\\' then 0 else 1 end,
    pg_catalog.lower(p.full_name),
    pg_catalog.lower(p.username),
    p.id
  limit greatest(1, least(coalesce(p_limit, 10), 20))
  offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

comment on function public.search_public_profiles(text, integer, integer) is
  'Searches public-safe profile names and usernames by literal substring; callers normalize an optional leading @. Never returns email, role, or auth metadata.';
