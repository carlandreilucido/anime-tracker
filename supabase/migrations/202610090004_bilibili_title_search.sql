-- Generate Bilibili search URLs with each anime's preferred title.
update public.streaming_providers
set website_url = 'https://www.bilibili.tv/en',
    search_url_template = 'https://www.bilibili.tv/en/search?keyword={query}'
where provider_key = 'bilibili';

-- Expire old homepage-only cache rows so the Edge Function regenerates title searches.
update public.watch_providers
set last_checked_at = now() - interval '25 hours'
where provider_key = 'bilibili';
