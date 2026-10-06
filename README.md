# Kitsu — Anime Watchlist & Progress Tracker

A responsive personal anime tracker built with React, Vite, Tailwind CSS, and Supabase. User-owned data is protected by PostgreSQL Row Level Security.

For the full project setup, architecture, database security, admin operations, test checklist, and Vercel deployment guide, see [the Project Guide](docs/PROJECT_GUIDE.md).

## Run locally

1. Install Node.js 18+ and dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set your Supabase project URL and anon/public key.
3. Run all four SQL files in `supabase/migrations/` in order in the Supabase SQL editor (or apply them with the Supabase CLI). The profile migration creates/backfills profiles and configures avatar storage; the admin migration adds authorization and aggregate RPCs; the multi-season migration groups seasons under one series.
4. In Supabase Auth settings, configure the site URL and allowed redirect URLs for your local and deployed app.
5. Run `npm run dev`.

The app intentionally displays setup instructions until the Supabase environment variables exist. Never use a service-role key in the browser. The migration enables RLS, constrains data, sets `updated_at` automatically, and grants authenticated users access only to their own rows.

## Profiles and avatars

Supabase Auth remains the authentication source. `202610070002_create_profiles.sql` creates a profile automatically after every Auth user insert, backfills existing users without profiles, and sets the initial role to `user`. The profile RLS policy permits users to read and update only their own row. SQL column grants allow browser updates only to `username`, `full_name`, and `avatar_url`; `id`, `email`, `role`, and timestamps cannot be changed through the frontend. Avatar objects are stored in the public `avatars` bucket under a per-user folder; insert/update/delete storage policies restrict writes to the authenticated user's folder. Public bucket reads mean avatar URLs are accessible to anyone who has the URL.

To make an account an admin, use the Supabase SQL editor as the project owner and run:

```sql
update public.profiles
set role = 'admin'
where email = 'your-account-email@example.com';
```

This is an owner-only database action; authenticated browser clients have no permission to update the role column. Migration `202610070003_admin_system.sql` adds `public.is_admin()`, an RLS-safe `SECURITY DEFINER` role check, plus admin-only aggregate/user-detail RPCs and a protected audit log. Role changes use `admin_change_user_role()`, which verifies the caller in the database, prevents removing the last admin, serializes changes, and writes its own audit event. There is no service-role key in the frontend. Admin watchlist analytics are aggregated; individual anime rows and notes remain private under the existing anime RLS policies.

To test profiles, register a new user and verify a matching `public.profiles` row is created. Sign in, open the account menu, edit the username/name, upload a JPG/PNG/WEBP avatar (5 MB max), refresh, and confirm the profile persists. Try updating another user's row or changing `role` through the Supabase API: RLS/column grants should reject the request. Existing Auth users are backfilled when the profile migration is applied.

## Admin area

After promoting the first admin with the SQL above, sign out and back in (or refresh the session/profile), then visit `/admin`. Admin route access checks the current Supabase Auth session and database-loaded profile. The admin user directory uses server-side search, filters, and pagination. Dashboard and anime pages use `admin_dashboard_stats()` to show server-computed aggregates without exposing watchlist rows. `admin_get_user_detail()` returns profile details and status counts only. `admin_audit_logs` is read-only to admins; role events are inserted by the protected role-change RPC, never by the browser directly.

To test authorization, sign in as a normal user and visit `/admin` and `/admin/users`; the app returns to the user dashboard. Also try calling `admin_dashboard_stats()` or `admin_change_user_role()` as that user in the Supabase client; the RPC must reject the call. As an admin, search users, open a user detail page, change a role with the confirmation dialog, then confirm the event appears under Activity. Try demoting the final admin; the database must reject it. Role management never deletes auth users.

## Deploy

Deploy the repository to Vercel as a Vite project. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment environment and add the production URL to Supabase Auth redirect configuration. `npm run build` creates the static app in `dist`.

## Structure

- `src/services/animeService.js` — reusable paginated/filterable Supabase access
- `src/contexts/AuthContext.jsx` — persistent Supabase session
- `src/contexts/ProfileContext.jsx` — cached current-user profile state
- `src/services/adminService.js` — paginated admin queries and protected RPC calls
- `src/components/admin/` — admin layout and role-management controls
- `src/components/anime/` — cards, form, progress, and status UI
- `src/pages/` — dashboard, library, details, and authentication
- `supabase/migrations/` — schema, indexes, timestamp triggers, season relations, and RLS policies

Library search, filtering, sorting, and pagination are executed by Supabase. Dashboard totals use efficient count queries. The initial schema stores user-owned anime records and can later be separated into shared anime metadata and user-specific tracking data.

Series with multiple seasons are stored once in `public.anime`; independent episode counts and progress live in `public.anime_seasons`. Apply migration `202610070004_multi_season_anime.sql` to group any existing same-title season entries before using the multi-season UI.
