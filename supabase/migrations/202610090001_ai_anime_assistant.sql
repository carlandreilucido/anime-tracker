-- Private, per-user assistant conversations. Existing anime/progress tables are unchanged.
create table if not exists public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_chat_conversations_owner_id_unique unique (user_id, id)
);

create index if not exists ai_chat_conversations_user_updated_idx
  on public.ai_chat_conversations (user_id, updated_at desc);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  metadata jsonb not null default '{}'::jsonb,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  constraint ai_chat_messages_owner_conversation_fk foreign key (user_id, conversation_id)
    references public.ai_chat_conversations(user_id, id) on delete cascade,
  constraint ai_chat_messages_request_role_unique unique (user_id, conversation_id, client_request_id, role)
);

create index if not exists ai_chat_messages_conversation_created_idx
  on public.ai_chat_messages (user_id, conversation_id, created_at desc);

alter table public.ai_chat_conversations enable row level security;
alter table public.ai_chat_messages enable row level security;

drop policy if exists "Users can read their own AI conversations" on public.ai_chat_conversations;
create policy "Users can read their own AI conversations"
  on public.ai_chat_conversations for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own AI conversations" on public.ai_chat_conversations;
create policy "Users can create their own AI conversations"
  on public.ai_chat_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can rename their own AI conversations" on public.ai_chat_conversations;
create policy "Users can rename their own AI conversations"
  on public.ai_chat_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own AI conversations" on public.ai_chat_conversations;
create policy "Users can delete their own AI conversations"
  on public.ai_chat_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own AI messages" on public.ai_chat_messages;
create policy "Users can read their own AI messages"
  on public.ai_chat_messages for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own AI messages" on public.ai_chat_messages;
create policy "Users can delete their own AI messages"
  on public.ai_chat_messages for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_chat_conversations, public.ai_chat_messages from public, anon, authenticated;
grant select, insert, delete on public.ai_chat_conversations to authenticated;
grant update (title) on public.ai_chat_conversations to authenticated;
grant select, delete on public.ai_chat_messages to authenticated;
grant all on public.ai_chat_conversations, public.ai_chat_messages to service_role;

create or replace function public.touch_ai_chat_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_chat_conversations_updated_at on public.ai_chat_conversations;
create trigger ai_chat_conversations_updated_at
before update on public.ai_chat_conversations
for each row execute function public.touch_ai_chat_updated_at();

create or replace function public.touch_ai_chat_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_chat_conversations
  set updated_at = now()
  where id = new.conversation_id and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists ai_chat_messages_touch_conversation on public.ai_chat_messages;
create trigger ai_chat_messages_touch_conversation
after insert on public.ai_chat_messages
for each row execute function public.touch_ai_chat_conversation_on_message();

revoke all on function public.touch_ai_chat_conversation_on_message() from public, anon, authenticated;

-- This narrowly-scoped, invoker-rights RPC applies the caller's existing anime/seasons RLS.
create or replace function public.get_my_ai_library_context()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with owned as (
  select a.id, a.title, a.alternative_title, a.genres, a.status, a.rating,
         a.community_rating, a.total_episodes, a.current_episode, a.updated_at
  from public.anime a
  where a.user_id = (select auth.uid())
), totals as (
  select count(*)::integer as anime_count,
         count(*) filter (where status = 'watching')::integer as watching,
         count(*) filter (where status = 'plan_to_watch')::integer as plan_to_watch,
         count(*) filter (where status = 'completed')::integer as completed,
         count(*) filter (where status = 'on_hold')::integer as on_hold,
         count(*) filter (where status = 'dropped')::integer as dropped
  from owned
), episodes as (
  select count(*)::integer as season_count,
         coalesce(sum(s.current_episode), 0)::integer as watched_episodes,
         count(s.total_episodes)::integer as known_episode_totals,
         count(*) filter (where s.total_episodes is null)::integer as unknown_episode_totals,
         coalesce(sum(s.total_episodes), 0)::integer as known_total_episodes
  from public.anime_seasons s
  where s.user_id = (select auth.uid())
), recent_items as (
  select a.id, a.title, a.alternative_title, a.genres, a.status, a.rating,
         a.community_rating, a.total_episodes, a.current_episode, a.updated_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'season_number', s.season_number,
             'season_title', s.season_title,
             'total_episodes', s.total_episodes,
             'current_episode', s.current_episode,
             'status', s.status,
             'media_type', s.media_type,
             'updated_at', s.updated_at
           ) order by s.season_number)
           from public.anime_seasons s
           where s.anime_id = a.id and s.user_id = (select auth.uid())
         ), '[]'::jsonb) as seasons
  from owned a
  order by a.updated_at desc
  limit 250
), title_index as (
  select id, title, alternative_title, status, rating
  from owned
  order by updated_at desc
  limit 1200
), genre_preferences as (
  select coalesce(jsonb_agg(jsonb_build_object('genre', genre, 'count', count) order by count desc), '[]'::jsonb) as genres
  from (
    select genre_values.genre, count(*)::integer as count
    from owned anime_rows
    cross join lateral unnest(anime_rows.genres) as genre_values(genre)
    where anime_rows.rating >= 8
    group by genre_values.genre
    order by count(*) desc
    limit 12
  ) preferred
)
select jsonb_build_object(
  'totals', (select to_jsonb(totals) from totals),
  'episodes', (select to_jsonb(episodes) from episodes),
  'genre_preferences', (select genres from genre_preferences),
  'library', coalesce((select jsonb_agg(to_jsonb(recent_items) order by updated_at desc) from recent_items), '[]'::jsonb),
  'title_index', coalesce((select jsonb_agg(to_jsonb(title_index) order by title) from title_index), '[]'::jsonb),
  'title_index_truncated', (select anime_count > 1200 from totals)
)
$$;

revoke all on function public.get_my_ai_library_context() from public, anon;
grant execute on function public.get_my_ai_library_context() to authenticated;

-- Service-role-only sliding-window counter, called only after the Edge Function verifies the JWT.
create table if not exists public.ai_chat_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);
alter table public.ai_chat_rate_limits enable row level security;
revoke all on public.ai_chat_rate_limits from public, anon, authenticated;
grant all on public.ai_chat_rate_limits to service_role;

create or replace function public.consume_ai_chat_rate_limit(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_count integer;
begin
  if p_user_id is null then return false; end if;
  insert into public.ai_chat_rate_limits (user_id, window_started_at, request_count)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update set
    window_started_at = case
      when public.ai_chat_rate_limits.window_started_at < now() - interval '1 minute' then now()
      else public.ai_chat_rate_limits.window_started_at
    end,
    request_count = case
      when public.ai_chat_rate_limits.window_started_at < now() - interval '1 minute' then 1
      else public.ai_chat_rate_limits.request_count + 1
    end
  returning ai_chat_rate_limits.request_count into request_count;
  return request_count <= 12;
end;
$$;

revoke all on function public.consume_ai_chat_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_chat_rate_limit(uuid) to service_role;
