-- Server-only, shared model discovery cache and cooldowns for the Gemini
-- free-tier fallback scheduler. No user content or API credentials are stored.
create table if not exists public.ai_gemini_model_catalog (
  cache_key text primary key check (cache_key = 'free-tier-text-v1'),
  model_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(model_ids) = 'array'),
  fetched_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists public.ai_gemini_model_health (
  model_id text primary key check (model_id = '__project__' or model_id ~ '^[a-z0-9.-]{1,120}$'),
  failure_count integer not null default 0 check (failure_count >= 0),
  cooldown_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_gemini_model_catalog enable row level security;
alter table public.ai_gemini_model_health enable row level security;
revoke all on public.ai_gemini_model_catalog, public.ai_gemini_model_health from public, anon, authenticated;
grant all on public.ai_gemini_model_catalog, public.ai_gemini_model_health to service_role;

create or replace function public.cooldown_ai_gemini_model(
  p_model_id text,
  p_minimum_seconds integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_cooldown timestamptz;
  minimum_seconds integer := least(86400, greatest(20, coalesce(p_minimum_seconds, 20)));
begin
  if p_model_id is null or (p_model_id <> '__project__' and p_model_id !~ '^[a-z0-9.-]{1,120}$') then
    raise exception 'invalid Gemini model identifier';
  end if;

  insert into public.ai_gemini_model_health (model_id, failure_count, cooldown_until, updated_at)
  values (
    p_model_id,
    1,
    now() + make_interval(secs => least(86400, minimum_seconds + floor(random() * greatest(5, minimum_seconds * 0.15))::integer)),
    now()
  )
  on conflict (model_id) do update set
    failure_count = least(public.ai_gemini_model_health.failure_count + 1, 12),
    cooldown_until = greatest(
      public.ai_gemini_model_health.cooldown_until,
      now() + make_interval(secs => least(
        86400,
        greatest(minimum_seconds,
          minimum_seconds * power(2, least(public.ai_gemini_model_health.failure_count, 5))::integer
        ) + floor(random() * greatest(5, minimum_seconds * 0.15))::integer
      ))),
    updated_at = now()
  returning cooldown_until into resulting_cooldown;

  return resulting_cooldown;
end;
$$;

revoke all on function public.cooldown_ai_gemini_model(text, integer) from public, anon, authenticated;
grant execute on function public.cooldown_ai_gemini_model(text, integer) to service_role;
