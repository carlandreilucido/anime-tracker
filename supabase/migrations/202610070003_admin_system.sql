-- Admin authorization helper. SECURITY DEFINER avoids recursive profile RLS checks.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create index if not exists profiles_created_at_idx on public.profiles (created_at desc);
create index if not exists anime_created_at_idx on public.anime (created_at desc);
create index if not exists anime_date_completed_idx on public.anime (date_completed) where date_completed is not null;

-- Admins may list profiles; non-admins remain limited to their own record.
drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles for select to authenticated
using (public.is_admin());

-- Reassert the limited frontend privileges even if profiles predated this migration.
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username, full_name, avatar_url) on public.profiles to authenticated;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit_logs (target_user_id, created_at desc);
alter table public.admin_audit_logs enable row level security;
drop policy if exists "Admins can read audit logs" on public.admin_audit_logs;
create policy "Admins can read audit logs"
on public.admin_audit_logs for select to authenticated
using (public.is_admin());
revoke all on public.admin_audit_logs from anon, authenticated;
revoke all on public.admin_audit_logs from public;
grant select on public.admin_audit_logs to authenticated;

-- Role changes are performed only through this RPC. It serializes changes so two
-- concurrent demotions cannot remove the final administrator, then writes its own audit row.
create or replace function public.admin_change_user_role(target_user_id uuid, requested_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := auth.uid();
  previous_role text;
  target_email text;
  admin_count integer;
begin
  if current_admin_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(746183920);
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if requested_role not in ('user', 'admin') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  select p.role, p.email into previous_role, target_email
  from public.profiles p where p.id = target_user_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if previous_role = requested_role then
    return jsonb_build_object('id', target_user_id, 'role', previous_role, 'changed', false);
  end if;

  if previous_role = 'admin' and requested_role = 'user' then
    select count(*)::integer into admin_count from public.profiles p where p.role = 'admin';
    if admin_count <= 1 then
      raise exception 'Cannot remove the last administrator' using errcode = '23514';
    end if;
  end if;

  update public.profiles set role = requested_role where id = target_user_id;
  insert into public.admin_audit_logs (admin_id, action, target_user_id, details)
  values (
    current_admin_id,
    'role_changed',
    target_user_id,
    jsonb_build_object('email', target_email, 'previous_role', previous_role, 'new_role', requested_role)
  );
  return jsonb_build_object('id', target_user_id, 'role', requested_role, 'changed', true);
end;
$$;
revoke all on function public.admin_change_user_role(uuid, text) from public, anon;
grant execute on function public.admin_change_user_role(uuid, text) to authenticated;

-- Read-only, aggregate analytics. Anime entries remain private under their existing
-- owner-only RLS policy; the function returns counts and grouped titles, never user rows.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_users integer;
  users_today integer;
  users_month integer;
  entries_total integer;
  unique_title_total integer;
  entries_today integer;
  watching_total integer;
  completed_total integer;
  plan_total integer;
  hold_total integer;
  dropped_total integer;
  monthly_registrations jsonb;
  watchlist_activity jsonb;
  popular jsonb;
  completed_popular jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select count(*)::integer,
         count(*) filter (where p.created_at >= current_date)::integer,
         count(*) filter (where p.created_at >= date_trunc('month', now()))::integer
  into total_users, users_today, users_month
  from public.profiles p;

  select count(*)::integer,
         count(distinct lower(a.title))::integer,
         count(*) filter (where a.created_at >= current_date)::integer,
         count(*) filter (where a.status = 'watching')::integer,
         count(*) filter (where a.status = 'completed')::integer,
         count(*) filter (where a.status = 'plan_to_watch')::integer,
         count(*) filter (where a.status = 'on_hold')::integer,
         count(*) filter (where a.status = 'dropped')::integer
  into entries_total, unique_title_total, entries_today, watching_total, completed_total, plan_total, hold_total, dropped_total
  from public.anime a;

  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(monthly.month_start, 'Mon YY'), 'count', monthly.user_count) order by monthly.month_start), '[]'::jsonb)
  into monthly_registrations
  from (
    select months.month_start, count(p.id)::integer as user_count
    from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') as months(month_start)
    left join public.profiles p on p.created_at >= months.month_start and p.created_at < months.month_start + interval '1 month'
    group by months.month_start
  ) monthly;

  with days as (
    select series.day_value::date as activity_date
    from generate_series((current_date - 13)::timestamp, current_date::timestamp, interval '1 day') as series(day_value)
  ), events as (
    select event.activity_date, sum(event.added)::integer as added, sum(event.completed)::integer as completed
    from (
      select a.created_at::date as activity_date, count(*)::integer as added, 0::integer as completed
      from public.anime a
      where a.created_at >= current_date - 13 and a.created_at < current_date + 1
      group by a.created_at::date
      union all
      select a.date_completed as activity_date, 0::integer as added, count(*)::integer as completed
      from public.anime a
      where a.date_completed between current_date - 13 and current_date
      group by a.date_completed
    ) event group by event.activity_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(days.activity_date, 'Mon DD'),
    'added', coalesce(events.added, 0),
    'completed', coalesce(events.completed, 0)
  ) order by days.activity_date), '[]'::jsonb)
  into watchlist_activity
  from days left join events on events.activity_date = days.activity_date;

  select coalesce(jsonb_agg(jsonb_build_object('title', grouped.title, 'entries', grouped.entries) order by grouped.entries desc), '[]'::jsonb)
  into popular
  from (
    select min(a.title) as title, count(*)::integer as entries
    from public.anime a group by lower(a.title) order by count(*) desc limit 8
  ) grouped;

  select coalesce(jsonb_agg(jsonb_build_object('title', grouped.title, 'entries', grouped.entries) order by grouped.entries desc), '[]'::jsonb)
  into completed_popular
  from (
    select min(a.title) as title, count(*)::integer as entries
    from public.anime a where a.status = 'completed'
    group by lower(a.title) order by count(*) desc limit 8
  ) grouped;

  return jsonb_build_object(
    'total_users', total_users,
    'new_users_today', users_today,
    'new_users_this_month', users_month,
    'total_anime_added', entries_total,
    'unique_anime_titles', unique_title_total,
    'total_watchlist_entries', entries_total,
    'anime_added_today', entries_today,
    'currently_watching', watching_total,
    'completed_anime', completed_total,
    'plan_to_watch', plan_total,
    'on_hold', hold_total,
    'dropped', dropped_total,
    'registrations_by_month', monthly_registrations,
    'watchlist_activity_by_day', watchlist_activity,
    'most_added_anime', popular,
    'most_completed_anime', completed_popular
  );
end;
$$;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- User detail exposes the selected profile and status counts to admins, not individual
-- private watchlist rows or notes.
create or replace function public.admin_get_user_detail(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile jsonb;
  anime_counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select to_jsonb(p) into target_profile from public.profiles p where p.id = target_user_id;
  if target_profile is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'total', count(*)::integer,
    'watching', count(*) filter (where a.status = 'watching')::integer,
    'completed', count(*) filter (where a.status = 'completed')::integer,
    'plan_to_watch', count(*) filter (where a.status = 'plan_to_watch')::integer,
    'on_hold', count(*) filter (where a.status = 'on_hold')::integer,
    'dropped', count(*) filter (where a.status = 'dropped')::integer
  ) into anime_counts
  from public.anime a where a.user_id = target_user_id;
  return jsonb_build_object('profile', target_profile, 'anime_counts', anime_counts);
end;
$$;
revoke all on function public.admin_get_user_detail(uuid) from public, anon;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;
