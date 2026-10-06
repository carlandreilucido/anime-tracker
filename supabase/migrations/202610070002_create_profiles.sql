-- User profile extension for Supabase Auth. Auth remains the only authentication source.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null unique,
  full_name text not null default '',
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,32}$')
);

create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

-- Generate an initially unique, editable username from auth metadata/email and user id.
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
  generated_username text;
begin
  base_username := pg_catalog.lower(
    pg_catalog.regexp_replace(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'username', ''),
        nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
        'user'
      ),
      '[^a-zA-Z0-9_]+', '_', 'g'
    )
  );
  base_username := trim(both '_' from base_username);
  if pg_catalog.length(base_username) < 3 then
    base_username := 'user';
  end if;
  generated_username := pg_catalog.left(base_username, 23) || '_' ||
    pg_catalog.left(pg_catalog.replace(new.id::text, '-', ''), 8);

  insert into public.profiles (id, email, username, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    generated_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'name', ''),
    'user'
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();

-- Backfill existing Auth users that do not yet have a profile.
insert into public.profiles (id, email, username, full_name, role)
select
  u.id,
  coalesce(u.email, ''),
  pg_catalog.left(
    coalesce(
      nullif(trim(both '_' from pg_catalog.lower(pg_catalog.regexp_replace(
        coalesce(nullif(u.raw_user_meta_data ->> 'username', ''), pg_catalog.split_part(coalesce(u.email, ''), '@', 1), 'user'),
        '[^a-zA-Z0-9_]+', '_', 'g'
      ))), ''),
      'user'
    ),
    23
  ) || '_' || pg_catalog.left(pg_catalog.replace(u.id::text, '-', ''), 8),
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.raw_user_meta_data ->> 'name', ''),
  'user'
from auth.users as u
on conflict (id) do nothing;

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Column-level grants make id/email/role/timestamps immutable to browser clients.
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username, full_name, avatar_url) on public.profiles to authenticated;
revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;

-- Public avatar reads are suitable for profile images. Writes are restricted to each
-- authenticated user's own top-level folder (avatars/<auth.uid()>/<file>). Files are
-- validated by the bucket MIME/size restrictions and by the client before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own avatars" on storage.objects;
create policy "Users can upload their own avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
);

drop policy if exists "Users can update their own avatars" on storage.objects;
create policy "Users can update their own avatars"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
);

drop policy if exists "Users can delete their own avatars" on storage.objects;
create policy "Users can delete their own avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
);
