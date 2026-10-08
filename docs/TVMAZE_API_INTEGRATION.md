# TVmaze anime metadata integration

The Add Anime dialog uses the public TVmaze REST API for search and metadata. TVmaze's [official API documentation](https://www.tvmaze.com/api) says its API is free, API data is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), use is allowed for any purpose with attribution and ShareAlike compliance, and direct links to its image CDN are permitted. The docs recommend a unique User-Agent, but do not require one for browser calls; requests run from the browser because the API supports CORS.

The UI credits TVmaze and links selected shows to their TVmaze page. TVmaze community ratings are kept separate from a user's personal rating. Artwork is hotlinked from TVmaze's CDN; it is not copied into Supabase Storage. Search/detail JSON is cached locally in the user's browser for one hour. The app does not maintain a shared public copy of TVmaze's catalog.

## Behavior and limits

- Search is debounced by 350 ms. TVmaze's `/search/shows` endpoint returns the matching list without server-side pagination; the UI shows results in batches of eight.
- The documented rate limit is **at least 20 API requests per 10 seconds per IP**, with possible stricter temporary limits. HTTP 429 responses show a retry message. The client caches API responses for one hour and allows explicit retries.
- TVmaze's API response cache is documented as 60 minutes. TVmaze permits hotlinking and says image URLs can be cached indefinitely, but this app currently only hotlinks them.
- TVmaze does not provide a typed show-to-show franchise relationship endpoint. The app imports seasons returned for the selected show as candidates. A user may search for separate shows as extra candidates, but those are marked “relationship not verified,” remain unchecked, and require explicit inclusion. The user can choose type, edit titles/counts, and reorder before saving.
- Search results expose an episode count only after the user selects a show and the app loads its seasons/episodes. Episode counts stay `NULL` if TVmaze does not provide enough data; users can fill them in.
- TVmaze is a general television catalog, not an anime-only catalog. Coverage and season conventions vary by show. For example, some long-running anime are divided by broadcast year, and split arcs may be combined into one TVmaze season. Review/edit all candidates before adding.

## Database migration

Apply `supabase/migrations/202610080001_tvmaze_search_metadata.sql` before using the search-to-library save flow. It adds nullable metadata/provenance fields and partial unique indexes; it does not rewrite existing `anime` or `anime_seasons` rows. The existing RLS ownership policies remain in force. The migration also adds `create_anime_with_seasons`, a single transactional RPC used by both search and manual add so a failed season insert rolls back the parent entry.

Apply with the linked Supabase CLI:

```sh
supabase db push
```

Alternatively, run the migration SQL in the Supabase SQL Editor. Verify the migration is applied before deploying the frontend. No Edge Function, API key, or new Vercel environment variable is required. The provider API calls run directly in the browser.

## Licensing and attribution

TVmaze requests that applications using its API credit/link back to TVmaze. The Add Anime dialog includes a visible TVmaze attribution/license link; metadata-backed detail pages link to the selected TVmaze record. Keep those credits if moving the UI or adding another display surface.

If the app later publishes, shares, or exposes a derived catalog of TVmaze data, review CC BY-SA 4.0 obligations for that use and provide the applicable share-alike attribution. The present design avoids a shared public catalog and leaves user library rows under existing per-user RLS. It does not import data from AniList, Jikan, MyAnimeList, Kitsu, or anime-offline-database.
