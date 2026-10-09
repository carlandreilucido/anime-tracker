-- Bilibili's app link opens the official English site instead of a title search.
update public.streaming_providers
set website_url = 'https://www.bilibili.tv/en'
where provider_key = 'bilibili';

-- Refresh existing per-anime rows so users receive the new destination immediately.
update public.watch_providers
set url = 'https://www.bilibili.tv/en',
    link_type = 'direct',
    confidence = null,
    is_available = false,
    last_checked_at = now()
where provider_key = 'bilibili';
