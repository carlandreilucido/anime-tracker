-- Read email verification metadata only through administrator-checked RPCs.
-- auth.users remains private; no Auth schema grants or public views are added.

create or replace function public.admin_auth_account_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'registered_accounts', count(*),
    'verified_accounts', count(*) filter (where account_status = 'verified'),
    'pending_verification_accounts', count(*) filter (where account_status = 'pending_verification'),
    'disabled_accounts', count(*) filter (where account_status = 'disabled')
  )
  into result
  from (
    select case
      when u.deleted_at is not null or u.banned_until > pg_catalog.now() then 'disabled'
      when u.email_confirmed_at is not null then 'verified'
      else 'pending_verification'
    end as account_status
    from auth.users as u
  ) as accounts;

  return result;
end;
$$;

revoke all on function public.admin_auth_account_counts() from public, anon;
grant execute on function public.admin_auth_account_counts() to authenticated;

create or replace function public.admin_user_directory(
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_role text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_verification_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset integer;
  v_search text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, ''))), '');
  v_role text := nullif(pg_catalog.btrim(coalesce(p_role, '')), '');
  v_status text := nullif(pg_catalog.btrim(coalesce(p_verification_status, '')), '');
  v_filtered_count bigint;
  v_totals jsonb;
  v_rows jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if v_status is not null and v_status not in ('verified', 'pending_verification', 'disabled') then
    raise exception 'Invalid verification status' using errcode = '22023';
  end if;
  if v_role is not null and v_role not in ('user', 'admin') then
    raise exception 'Invalid account role' using errcode = '22023';
  end if;

  v_offset := least(v_page, 1000000) * v_page_size;

  select jsonb_build_object(
    'total_registered', count(*),
    'verified_count', count(*) filter (where account_status = 'verified'),
    'pending_count', count(*) filter (where account_status = 'pending_verification'),
    'disabled_count', count(*) filter (where account_status = 'disabled')
  )
  into v_totals
  from (
    select case
      when u.deleted_at is not null or u.banned_until > pg_catalog.now() then 'disabled'
      when u.email_confirmed_at is not null then 'verified'
      else 'pending_verification'
    end as account_status
    from auth.users as u
  ) as accounts;

  with accounts as (
    select u.id,
           u.email,
           u.email_confirmed_at,
           u.created_at,
           p.username,
           p.full_name,
           p.avatar_url,
           coalesce(p.role, 'user') as role,
           case
             when u.deleted_at is not null or u.banned_until > pg_catalog.now() then 'disabled'
             when u.email_confirmed_at is not null then 'verified'
             else 'pending_verification'
           end as verification_status
    from auth.users as u
    left join public.profiles as p on p.id = u.id
  )
  select count(*)
  into v_filtered_count
  from accounts as a
  where (v_role is null or a.role = v_role)
    and (p_from_date is null or a.created_at >= p_from_date::timestamptz)
    and (p_to_date is null or a.created_at < (p_to_date + 1)::timestamptz)
    and (v_status is null or a.verification_status = v_status)
    and (v_search is null or pg_catalog.strpos(
      pg_catalog.lower(pg_catalog.concat_ws(' ', a.email, a.username, a.full_name)), v_search
    ) > 0);

  with accounts as (
    select u.id,
           u.email,
           u.email_confirmed_at,
           u.created_at,
           p.username,
           p.full_name,
           p.avatar_url,
           coalesce(p.role, 'user') as role,
           case
             when u.deleted_at is not null or u.banned_until > pg_catalog.now() then 'disabled'
             when u.email_confirmed_at is not null then 'verified'
             else 'pending_verification'
           end as verification_status
    from auth.users as u
    left join public.profiles as p on p.id = u.id
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows) order by page_rows.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select a.id,
           a.email,
           a.username,
           a.full_name,
           a.avatar_url,
           a.role,
           a.created_at,
           a.email_confirmed_at,
           a.verification_status
    from accounts as a
    where (v_role is null or a.role = v_role)
      and (p_from_date is null or a.created_at >= p_from_date::timestamptz)
      and (p_to_date is null or a.created_at < (p_to_date + 1)::timestamptz)
      and (v_status is null or a.verification_status = v_status)
      and (v_search is null or pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.concat_ws(' ', a.email, a.username, a.full_name)), v_search
      ) > 0)
    order by a.created_at desc
    limit v_page_size offset v_offset
  ) as page_rows;

  return v_totals || jsonb_build_object(
    'data', v_rows,
    'count', v_filtered_count,
    'hasMore', v_offset + v_page_size < v_filtered_count
  );
end;
$$;

revoke all on function public.admin_user_directory(integer, integer, text, text, date, date, text) from public, anon;
grant execute on function public.admin_user_directory(integer, integer, text, text, date, date, text) to authenticated;
