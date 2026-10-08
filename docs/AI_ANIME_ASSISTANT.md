# AI Anime Assistant

The signed-in app includes a persistent anime chat assistant. Library questions are answered from a narrowly scoped, authenticated Supabase RPC without a Gemini call. Other questions use the Gemini API from the `anime-assistant` Edge Function. The browser never receives the Gemini API key.

The Edge Function verifies the caller's JWT (`verify_jwt = true`) and independently verifies the user with Supabase Auth. It checks conversation ownership before loading or saving messages, uses the caller's RLS-scoped database client for library context, and applies a database-backed limit of 12 requests per user per minute. It accepts messages up to 1,800 characters, limits model context to 12 messages and a compact library summary, and caps output to 900 tokens.

## Gemini free-tier discovery and fallback

At runtime the function calls Google's official `v1beta/models` list endpoint with the server-side API key. A model is eligible only when Google reports `generateContent` support **and** the model ID is in the separately maintained free-text-generation allowlist in `supabase/functions/anime-assistant/geminiFallback.mjs`. The model-list response alone is not treated as proof of free pricing. The allowlist is checked against Google's official [models](https://ai.google.dev/gemini-api/docs/models) and [pricing](https://ai.google.dev/gemini-api/docs/pricing) documentation (reviewed 2026-10-09); update it only after rechecking both sources. Unknown, preview, image, audio, embedding, video, deprecated, or paid-only IDs are excluded.

Current allowlist and default priority (all listed as stable models with free standard text input/output pricing in the official pricing table):

1. `gemini-3.8-flash` — strongest default for anime discussion/reasoning.
2. `gemini-3.7-flash`
3. `gemini-3.6-flash`
4. `gemini-3.5-flash`
5. `gemini-3.5-flash-lite`
6. `gemini-3.1-flash-lite`
7. `gemini-2.5-flash`
8. `gemini-2.5-flash-lite`

The eligible list is cached in Supabase for six hours (up to 24 hours stale during discovery outages). A server-side comma-separated `GEMINI_MODEL_PRIORITY` reorders these IDs; unrecognized and non-allowlisted names are ignored, and any remaining allowlisted models follow in the reviewed default order. At most three models are tried, with 12-second per-attempt and 39-second generation deadlines. A failed attempt reuses the same system prompt, personalized library snapshot, current user message, and history; no database write occurs inside the fallback loop. Model outages/rate limits and a project-wide quota cooldown are stored in a private Supabase table, shared across Edge Function instances, with exponential backoff and jitter. The existing per-user database rate limit still applies.

HTTP 429 model-specific limits, 404 model removal, 5xx overloads, timeouts, and network failures can move to another eligible model. Invalid credentials, invalid requests, safety blocks, and explicitly project-wide/daily quotas stop fallback. Safety-blocked responses are not retried with a different model. If all attempts fail, the API returns only: “Kitsu AI is temporarily unavailable. Please try again in a few minutes.”

## Gemini configuration and deployment

1. Create a Gemini API key for a **dedicated Google AI project with no Cloud Billing account linked**. The Gemini Models API does not report billing-tier status, so the function cannot verify that a key belongs to a free-tier project. The `GEMINI_FREE_TIER_ONLY=true` secret is an explicit deployment guard, not a Google billing-status check. Do not set it for a project with billing enabled; use a no-billing project to prevent paid-tier requests/charges. Google can change eligibility and quotas; check the pricing page before upgrading or changing project billing.
2. Set the Edge Function secrets and deploy:

```sh
supabase db push
supabase secrets set GEMINI_API_KEY=your-key GEMINI_FREE_TIER_ONLY=true GEMINI_MAX_FALLBACK_ATTEMPTS=3 GEMINI_MODEL_PRIORITY=gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite
supabase functions deploy anime-assistant
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided to Supabase Edge Functions. Never put `GEMINI_API_KEY` in Vercel environment variables, frontend `.env` files, or `VITE_*` variables. `GEMINI_MODEL` is no longer used. No new frontend environment variables are required.

## Database and privacy behavior

Apply both `supabase/migrations/202610090001_ai_anime_assistant.sql` and `supabase/migrations/202610090002_gemini_free_tier_fallback.sql`. The second migration adds only a private model-list cache, cross-instance model/project cooldown state, and a service-role-only cooldown function. Existing conversation and anime data is unchanged. Chat rows are only readable/deletable by their owner; Edge Functions write messages using the service role only after verifying the JWT and conversation owner. A database unique constraint on request ID and role prevents duplicate user/assistant messages when the client retries.

When a user sends a message, Gemini receives that message, a bounded slice of recent chat, and a compact context derived from the user's own anime/seasons. Personal notes are excluded. Library questions such as status lists, episode progress, and watched-episode totals are handled from Supabase data without Gemini. Unknown season totals are reported as unknown, not treated as zero.

Recommendation candidates from Gemini are not trusted for metadata. The Edge Function matches candidates against TVmaze by exact normalized title and the `Anime` genre before including a recommendation card. The card contains TVmaze metadata, an attribution link, and the optional Add to Library action. If no exact catalog match is found, the chatbot still shows the text recommendation without an image/card. TVmaze episode totals are displayed only when all its season totals are known; otherwise they are labeled unknown. TVmaze licenses API data under CC BY-SA and the card links back to TVmaze.

## Manual verification

- Open the assistant and try each suggested prompt; submit `What episode am I on in <title>?` for a title in the signed-in library.
- Test two accounts and confirm conversation history and library facts do not cross accounts.
- Use a short-lived/expired session and confirm the UI requests sign-in again.
- In the mocked Edge Function tests, verify model success, 429/503/timeouts/404, daily quota, invalid credentials, safety blocks, context preservation, and safe model selection. No Gemini calls are made by these tests.
- In a staging no-billing Google AI project, send a normal anime recommendation prompt and verify the returned recommendation cards. Use logs for server-side failure categories; model IDs and provider errors are not returned to the user.
- Temporarily unset `GEMINI_FREE_TIER_ONLY` to verify the friendly unavailable response; restore it before normal use.
- Ask a recommendation query and check that cards only appear for exact TVmaze title/Anime-genre matches. Use **Add to Library** and review the prefilled existing AnimeForm before saving.
- Test narrow mobile viewports and the on-screen keyboard. The assistant uses a full-screen mobile layout with safe-area padding.

Free-tier quotas are shared at Google's project level and are subject to change; model fallback cannot bypass a shared project quota. The allowlist is deliberately maintained in code because pricing/free-tier status is not returned by the Models API. Review the official models and pricing pages when updating it, then run `npm test` and deploy. `npm run build` checks the frontend bundle; Supabase migrations/functions still require deployment using the commands above.
