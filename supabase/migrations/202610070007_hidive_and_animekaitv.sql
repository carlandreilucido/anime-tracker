-- Correct AnimeKai TV's hostname and add another anime streaming provider.
update public.streaming_providers
set name = 'AnimeKai TV',
    website_url = 'https://animekaitv.to',
    search_url_template = 'https://animekaitv.to/search?keyword={query}',
    allowed_hostnames = array['animekaitv.to', 'www.animekaitv.to'],
    adapter_key = 'animekai'
where provider_key = 'animekai';

-- Mark previously cached AnimeKai links stale so they are regenerated with the corrected host.
update public.watch_providers
set last_checked_at = now() - interval '25 hours'
where provider_key = 'animekai';

insert into public.streaming_providers
  (provider_key, name, website_url, search_url_template, allowed_hostnames, adapter_key, brand_color, priority, access_model, pricing_note)
values
  ('hidive', 'HIDIVE', 'https://www.hidive.com', 'https://www.hidive.com/search?q={query}', array['www.hidive.com', 'hidive.com'], 'hidive', '#4B3E83', 7, 'subscription', 'Subscription service; catalog varies by region.')
on conflict (provider_key) do update set
  name = excluded.name,
  website_url = excluded.website_url,
  search_url_template = excluded.search_url_template,
  allowed_hostnames = excluded.allowed_hostnames,
  adapter_key = excluded.adapter_key,
  brand_color = excluded.brand_color,
  priority = excluded.priority,
  access_model = excluded.access_model,
  pricing_note = excluded.pricing_note;
