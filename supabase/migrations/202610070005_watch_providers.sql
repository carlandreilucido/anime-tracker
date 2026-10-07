-- Optional provider metadata fields allow API-backed adapters to use IDs and titles
-- supplied by an anime metadata service when those values are available.
alter table public.anime add column if not exists english_title text;
alter table public.anime add column if not exists romaji_title text;
alter table public.anime add column if not exists japanese_title text;
alter table public.anime add column if not exists alternative_titles text[] not null default '{}';
alter table public.anime add column if not exists mal_id bigint;
alter table public.anime add column if not exists anilist_id bigint;
alter table public.anime add column if not exists provider_ids jsonb not null default '{}'::jsonb;

update public.anime
set alternative_titles = array_remove(array[alternative_title], null)
where alternative_title is not null and cardinality(alternative_titles) = 0;

grant insert (english_title, romaji_title, japanese_title, alternative_titles, mal_id, anilist_id, provider_ids)
  on public.anime to authenticated;
grant update (english_title, romaji_title, japanese_title, alternative_titles, mal_id, anilist_id, provider_ids)
  on public.anime to authenticated;

create table public.streaming_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique check (provider_key ~ '^[a-z0-9_-]+$'),
  name text not null,
  logo_url text,
  website_url text not null,
  search_url_template text not null check (position('{query}' in search_url_template) > 0),
  allowed_hostnames text[] not null,
  adapter_key text not null default 'search',
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_enabled boolean not null default true,
  priority integer not null default 100 check (priority >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.streaming_providers
  (provider_key, name, website_url, search_url_template, allowed_hostnames, adapter_key, brand_color, priority)
values
  ('bilibili', 'Bilibili', 'https://www.bilibili.tv', 'https://www.bilibili.tv/en/search?keyword={query}', array['www.bilibili.tv','bilibili.tv','www.bilibili.com','bilibili.com'], 'bilibili', '#00A1D6', 1),
  ('crunchyroll', 'Crunchyroll', 'https://www.crunchyroll.com', 'https://www.crunchyroll.com/search?q={query}', array['www.crunchyroll.com','crunchyroll.com'], 'crunchyroll', '#F47521', 2),
  ('netflix', 'Netflix', 'https://www.netflix.com', 'https://www.netflix.com/search?q={query}', array['www.netflix.com','netflix.com'], 'netflix', '#E50914', 3),
  ('disney_plus', 'Disney+', 'https://www.disneyplus.com', 'https://www.disneyplus.com/search?q={query}', array['www.disneyplus.com','disneyplus.com'], 'disney_plus', '#113CCF', 4),
  ('prime_video', 'Prime Video', 'https://www.primevideo.com', 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}', array['www.primevideo.com','primevideo.com'], 'prime_video', '#00A8E1', 5),
  ('youtube', 'YouTube', 'https://www.youtube.com', 'https://www.youtube.com/results?search_query={query}', array['www.youtube.com','youtube.com','youtu.be'], 'youtube', '#FF0000', 6),
  ('animekai', 'AnimeKai', 'https://animekai.to', 'https://animekai.to/search?keyword={query}', array['animekai.to'], 'animekai', '#E04C5A', 20),
  ('loklok', 'LokLok', 'https://www.loklok.com', 'https://www.loklok.com/search?keyword={query}', array['www.loklok.com','loklok.com'], 'loklok', '#F1A43C', 21)
on conflict (provider_key) do update set
  name = excluded.name,
  website_url = excluded.website_url,
  search_url_template = excluded.search_url_template,
  allowed_hostnames = excluded.allowed_hostnames,
  adapter_key = excluded.adapter_key,
  brand_color = excluded.brand_color,
  priority = excluded.priority;

create index streaming_providers_enabled_priority_idx
  on public.streaming_providers (priority, name) where is_enabled = true;

create table public.watch_providers (
  id uuid primary key default gen_random_uuid(),
  anime_id uuid not null references public.anime(id) on delete cascade,
  provider_key text not null references public.streaming_providers(provider_key) on delete cascade,
  provider_name text not null,
  url text not null check (url ~ '^https://' and url !~ '[[:space:]]'),
  link_type text not null check (link_type in ('direct','search')),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  is_available boolean not null default false,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watch_providers_anime_provider_unique unique (anime_id, provider_key)
);

create index watch_providers_anime_checked_idx
  on public.watch_providers (anime_id, last_checked_at desc);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_provider text references public.streaming_providers(provider_key) on delete set null,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_watch_provider_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger streaming_providers_updated_at
before update on public.streaming_providers
for each row execute function public.set_watch_provider_updated_at();
create trigger watch_providers_updated_at
before update on public.watch_providers
for each row execute function public.set_watch_provider_updated_at();
create trigger user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_watch_provider_updated_at();

alter table public.streaming_providers enable row level security;
alter table public.watch_providers enable row level security;
alter table public.user_preferences enable row level security;

create policy "Authenticated users can read enabled streaming providers"
on public.streaming_providers for select to authenticated
using (is_enabled = true);

create policy "Users can read providers for their own anime"
on public.watch_providers for select to authenticated
using (exists (
  select 1 from public.anime a
  where a.id = watch_providers.anime_id and a.user_id = (select auth.uid())
));

create policy "Users can read their own preferences"
on public.user_preferences for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can create their own preferences"
on public.user_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own preferences"
on public.user_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Watch-provider links are written only by the authenticated Edge Function using
-- its server-only service role after it verifies ownership through the user's JWT.
revoke all on public.streaming_providers from public, anon, authenticated;
grant select on public.streaming_providers to authenticated;
revoke all on public.watch_providers from public, anon, authenticated;
grant select on public.watch_providers to authenticated;
revoke all on public.user_preferences from public, anon, authenticated;
grant select, insert, update on public.user_preferences to authenticated;
