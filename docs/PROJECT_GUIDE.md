# Kitsu Project Guide

Kitsu is a personal anime watchlist and progress tracker built with React, Vite, Tailwind CSS, and Supabase. Supabase Auth is the identity provider; PostgreSQL stores profiles and private anime entries; Supabase Storage holds profile avatars.

## Contents

- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Database migrations](#database-migrations)
- [Application architecture](#application-architecture)
- [User features](#user-features)
- [Admin area](#admin-area)
- [Security model](#security-model)
- [Testing checklist](#testing-checklist)
- [Vercel deployment](#vercel-deployment)
- [Troubleshooting](#troubleshooting)

## Requirements

- Node.js 18 or later and npm
- A Supabase project with Auth and Storage enabled
- Git for version control

The browser uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never place a Supabase service-role key in the frontend, a `VITE_` variable, or a checked-in file.

## Local setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable/anon key.
3. Apply any unapplied SQL migrations from `supabase/migrations/` in filename order. See [Database migrations](#database-migrations).
4. In Supabase Auth URL Configuration, allow your local URL (usually `http://localhost:5173`) and production Vercel URL. Configure email confirmation to match how you want account registration to behave.
5. Start the Vite development server:

   ```sh
   npm run dev
   ```

The local `.env.local` file is ignored by Git. Restart Vite after changing environment variables.

## Database migrations

Run the migrations in order, either with the Supabase SQL Editor or Supabase CLI:

| Migration | Purpose |
| --- | --- |
| `202610070001_create_anime_table.sql` | Creates the user-owned anime/watchlist table, constraints, indexes, timestamp trigger, and per-user RLS policies. |
| `202610070002_create_profiles.sql` | Creates/backfills profiles, generates profiles on Auth signup, limits profile updates, and creates the `avatars` bucket and per-user write policies. |
| `202610070003_admin_system.sql` | Adds the admin role helper, profile/audit RLS, protected admin RPCs, indexes, aggregate statistics, and role-change auditing. |
| `202610070004_multi_season_anime.sql` | Consolidates same-title season entries into one series and creates per-season progress rows with owner RLS and summary synchronization. |
| `202610070005_watch_providers.sql` | Adds provider search configuration, cached per-anime links, user preferences, optional anime metadata identifiers, and RLS. |
| `202610070006_provider_pricing.sql` | Adds each provider's general access model (`free`, `subscription`, `mixed`, or `unknown`) and a generated `is_free` value when it is definitive. |

If earlier migrations have already been applied to the project, apply only the remaining migration(s). Do not rerun or skip migrations without checking their effects first.

### First administrator

New profiles default to the `user` role. Once your account exists, promote it in the Supabase SQL Editor while signed in as the project owner:

```sql
update public.profiles
set role = 'admin'
where email = 'your-account-email@example.com';
```

Sign out and back in (or refresh the profile) and open `/admin`. Regular users cannot change their role through PostgREST; role changes use the protected `admin_change_user_role` RPC.

## Application architecture

```text
src/
├── components/
│   ├── admin/       # Admin layout and role-change confirmation
│   ├── anime/       # Anime cards, forms, status and progress UI
│   ├── layout/     # Main application layout and profile menu
│   └── ui/          # Shared modal, toast and UI components
├── contexts/        # Supabase Auth, current profile, and theme state
├── lib/             # The single Supabase client
├── pages/           # User and admin route pages
├── services/        # Anime, profile and admin data access
└── utils/           # Formatting and shared helpers
```

The Supabase client is created once in `src/lib/supabase.js`. `AuthContext` owns the Supabase session, `ProfileContext` loads the signed-in user's row, and service modules keep database requests out of page components. React Router lazy-loads feature pages. `vercel.json` rewrites direct SPA route requests to the Vite entry point.

An anime is one series row in `public.anime`; each season is a row in `public.anime_seasons`. A database trigger keeps series-level status and episode totals synchronized from its seasons. The multi-season migration consolidates existing duplicate series rows and moves their previous season progress into the related season records.

## User features

- Register, sign in, and sign out through Supabase Auth.
- Add, edit, delete, search, filter, sort, and paginate private anime series.
- Keep each series together with separate episode progress and status per season; add seasons from the series details page.
- Track favorites, ratings, notes, genres, and series/season dates.
- View generated external provider search/watch links from the details page or a card's Watch button; select a preferred provider in Settings.
- Open a profile from the account menu; edit username/full name and upload a JPG, PNG, or WEBP avatar (maximum 5 MB).
- Change the Supabase Auth password from Settings after confirming the current password.
- Switch dark/light appearance from the top bar. The preference is saved in browser local storage.

Series are stored per user in `public.anime`, with episode progress in `public.anime_seasons`. Both tables have owner-scoped row-level policies; the admin interface does not fetch private season rows.

## Admin area

Admin routes are `/admin`, `/admin/users`, `/admin/users/:userId`, `/admin/anime`, `/admin/activity`, and `/admin/settings`.

- The admin layout waits for the Auth session and database profile before showing admin content. Non-admins are redirected to the regular app.
- The user directory searches name, username, and email on the server, with role/date filters and 20-row pagination.
- User details show profile information and aggregate anime status counts, not titles, notes, ratings, or episode history.
- Dashboard/watchlist analytics are returned by the admin-verified `admin_dashboard_stats()` RPC. Popular anime and daily additions/completions are aggregated in SQL.
- Activity combines recent registrations, aggregate watchlist activity, and role changes. Role changes are inserted into `admin_audit_logs` by the database RPC, not by browser code.
- Admin settings reuse the profile editor. User deletion/suspension is not implemented; there is no insecure browser-side Auth Admin API call.

## External watch providers

`public.streaming_providers` is the enabled provider directory. The UI renders this directory dynamically; the seeded providers are Bilibili, Crunchyroll, Netflix, Disney+, Prime Video, YouTube, AnimeKai, and LokLok. The directory includes general pricing labels: Free, Subscription, Free + paid, or Pricing unknown. `is_free` is nullable when a service has mixed or unverified pricing. These labels describe providers generally, not whether a specific title is free in a user's region. `public.watch_providers` caches a per-series provider URL/type for 24 hours, with a user region code for future regional integrations. `public.user_preferences` stores the preferred provider and optional two-letter country code.

Provider lookup runs in the `find-watch-providers` Supabase Edge Function. It validates the caller's JWT, fetches the anime through the caller's RLS-scoped client, then uses the service-role key only inside the Edge Function to save generated links. The frontend never receives that key. The function is configured with JWT verification in `supabase/config.toml`. Deploy it with `supabase functions deploy find-watch-providers` after linking the Supabase CLI to your project. Supabase provides its standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; if you configure secrets manually, set them only in Supabase Edge Function secrets, never in Vite/Vercel `VITE_` variables.

There are no reliable public catalog lookup APIs configured for the seeded services, so the current adapters generate official-site HTTPS search URLs. The buttons say “Search” rather than claiming a title is available. Adapters normalize and deduplicate canonical, English, romaji, Japanese, and alternative titles; optional MAL/AniList/provider IDs are available for future API-backed adapters. External URLs are restricted to each provider's allowlisted hosts, opened in a new tab with `noopener noreferrer`. Kitsu does not host, proxy, scrape, extract, or download streams. One provider lookup failure does not block adding an anime; the Watch Options panel offers retry and manual refresh.

### Admin authorization and role changes

`public.is_admin()` is a narrowly scoped `SECURITY DEFINER` helper with a fixed empty `search_path`; it queries the profile role as the function owner so it does not recurse through profile RLS. The admin RPCs each check that function on the server. Admin profile listing and audit log reads have admin-only RLS policies. Anime access remains owner-only; aggregate RPCs return only counts and grouped titles.

`admin_change_user_role(target_user_id, requested_role)` is the only frontend role-change path. It verifies the current database role, accepts only `user`/`admin`, serializes concurrent changes, prevents demotion of the final administrator, and writes an audit event atomically. Column grants prevent clients from updating `profiles.role` directly. The confirmation dialog is a user-experience safeguard; database checks are the security boundary.

## Security model

- `auth.users` remains the authentication source. A database trigger creates a corresponding profile; a backfill covers existing Auth accounts.
- Profile RLS allows a regular user to read/update only their own row. Column-level UPDATE grants restrict changes to username, full name, and avatar URL. Profile identity, email, role, and timestamps are not client-editable.
- The avatar bucket is public for image display, so anyone with an avatar URL can read that image. Upload, update, and delete policies only allow an authenticated user to write inside their own UID folder.
- Admin-only profile listing, analytics, user details, and audit reads are guarded by RLS or role-checking database functions.
- Do not treat React state, local storage, hidden navigation, or route guards as authorization. Do not expose a service-role key.

## Testing checklist

### Regular account

1. Register and verify a `public.profiles` row is created by the Auth trigger.
2. Sign in, edit username/full name, upload an accepted avatar, refresh, and confirm data persists.
3. Try selecting another user's profile or changing `role` through the Supabase client; RLS/column grants must reject it.
4. Visit `/admin` directly; the app should redirect to the normal dashboard.
5. Call an admin RPC as a normal user; it must return an authorization error.

### Administrator

1. Promote the account through the SQL Editor and sign in again.
2. Open `/admin`; check the dashboard metrics, user pagination/search/date and role filters, user detail, analytics, and activity.
3. Change a user's role with the confirmation dialog; verify the event appears in Activity.
4. Try demoting the only remaining administrator; the database must reject it.
5. Add one anime series with multiple seasons; verify each season and episode count is visible on the library card and details page. Update progress in one season and confirm other seasons keep their own episode counts.
6. Open Watch Options; confirm providers show Search unless a future official adapter confirms a direct available link. Click one to verify it opens in a new tab. Change preferred provider under Settings and confirm it is ordered first.
7. Open `/profile`, `/admin/users`, and `/admin` directly or refresh them to verify SPA routes load.

Build verification:

```sh
npm run build
```

## Vercel deployment

Import the repository into Vercel as a Vite app. Set these project environment variables for each environment:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Vercel builds with `npm run build` and serves `dist`. `vercel.json` rewrites direct client-side routes to `/`, so refreshes on `/admin`, `/profile`, and similar paths work. Add the deployed domain to Supabase Auth's site URL and allowed redirect URLs. No server-only or service-role key is required in Vercel's frontend environment.

## Troubleshooting

- **Setup screen instead of app:** confirm Vercel/local values use the exact `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` names, then restart/redeploy.
- **Profile missing:** apply the profile migration; inspect Supabase Auth logs and the `on_auth_user_created_profile` trigger.
- **Admin pages deny access:** verify the profile row has role `admin`, re-authenticate to refresh profile state, and apply the admin migration.
- **Admin RPC missing:** apply `202610070003_admin_system.sql` after the profile and anime tables exist, then refresh the Supabase API schema cache if needed.
- **Avatar upload denied:** confirm the avatar migration ran, the authenticated session is valid, file type/size is allowed, and the object path uses the current user's UID folder.
- **Watch Options unavailable:** apply `202610070005_watch_providers.sql` and `202610070006_provider_pricing.sql`, deploy `find-watch-providers`, and confirm Supabase Edge Function JWT verification is enabled.
- **Route refresh gives 404 on Vercel:** confirm the root `vercel.json` rewrite is deployed.
