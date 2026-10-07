-- Pricing model describes the provider generally, not guaranteed availability of
-- a particular anime. 'mixed' and 'unknown' deliberately do not imply free access.
alter table public.streaming_providers
  add column access_model text not null default 'unknown'
    check (access_model in ('free', 'subscription', 'mixed', 'unknown'));

alter table public.streaming_providers
  add column is_free boolean generated always as (
    case access_model
      when 'free' then true
      when 'subscription' then false
      else null
    end
  ) stored;

alter table public.streaming_providers
  add column pricing_note text;

update public.streaming_providers set access_model = 'mixed', pricing_note = 'Free and paid titles/plans may vary by region.'
where provider_key in ('bilibili', 'crunchyroll', 'prime_video', 'youtube');

update public.streaming_providers set access_model = 'subscription', pricing_note = 'Requires a paid subscription; catalog varies by region.'
where provider_key in ('netflix', 'disney_plus');

update public.streaming_providers set access_model = 'unknown', pricing_note = 'Pricing and availability are not verified by Kitsu.'
where provider_key in ('animekai', 'loklok');
