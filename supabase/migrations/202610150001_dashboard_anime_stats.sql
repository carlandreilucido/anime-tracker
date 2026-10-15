-- Replace five per-status count requests with one caller-scoped aggregate RPC.
-- SECURITY INVOKER keeps the caller's existing RLS policies in force.
create or replace function public.get_my_anime_stats()
returns table (status text, anime_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select anime.status, count(*)::bigint
  from public.anime as anime
  where anime.user_id = (select auth.uid())
  group by anime.status;
$$;

revoke all on function public.get_my_anime_stats() from public, anon;
grant execute on function public.get_my_anime_stats() to authenticated;
