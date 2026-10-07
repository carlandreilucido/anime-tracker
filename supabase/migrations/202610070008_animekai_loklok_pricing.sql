-- Update general pricing classifications for AnimeKai TV and LokLok.
update public.streaming_providers
set access_model = 'free',
    pricing_note = 'Free to watch; catalog and availability may vary by region.'
where provider_key = 'animekai';

update public.streaming_providers
set access_model = 'mixed',
    pricing_note = 'Free and paid titles or plans may vary by region.'
where provider_key = 'loklok';
