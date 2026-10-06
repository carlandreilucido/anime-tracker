# Kitsu — Anime Watchlist & Progress Tracker

A responsive personal anime tracker built with React, Vite, Tailwind CSS, and Supabase. User-owned data is protected by PostgreSQL Row Level Security.

## Run locally

1. Install Node.js 18+ and dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set your Supabase project URL and anon/public key.
3. Run `supabase/migrations/202610070001_create_anime_table.sql` in the Supabase SQL editor (or apply it with the Supabase CLI).
4. In Supabase Auth settings, configure the site URL and allowed redirect URLs for your local and deployed app.
5. Run `npm run dev`.

The app intentionally displays setup instructions until the Supabase environment variables exist. Never use a service-role key in the browser. The migration enables RLS, constrains data, sets `updated_at` automatically, and grants authenticated users access only to their own rows.

## Deploy

Deploy the repository to Vercel as a Vite project. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment environment and add the production URL to Supabase Auth redirect configuration. `npm run build` creates the static app in `dist`.

## Structure

- `src/services/animeService.js` — reusable paginated/filterable Supabase access
- `src/contexts/AuthContext.jsx` — persistent Supabase session
- `src/components/anime/` — cards, form, progress, and status UI
- `src/pages/` — dashboard, library, details, and authentication
- `supabase/migrations/` — schema, indexes, timestamp trigger, and RLS policies

Library search, filtering, sorting, and pagination are executed by Supabase. Dashboard totals use efficient count queries. The initial schema stores user-owned anime records and can later be separated into shared anime metadata and user-specific tracking data.
