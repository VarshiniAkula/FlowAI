-- 0009_platform_llm_usage.sql
-- Platform-funded LLM demo quota (FlowMind Groq "demo AI").
--
-- The `usage_events` table is org/assistant-scoped and cannot enforce an atomic
-- per-USER daily cap, so platform-funded Groq calls get their own counter table
-- plus an atomic reservation function. Only server code (service role) and the
-- SECURITY DEFINER functions below touch it — never anonymous or authenticated
-- clients directly, so RLS is enabled + forced with no policies (deny-all).

-- ---------------------------------------------------------------------------
-- Counter table: one row per (UTC date, user, provider).
-- ---------------------------------------------------------------------------
create table if not exists public.platform_llm_daily_usage (
  usage_date      date        not null,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  provider        text        not null,
  request_count   integer     not null default 0,
  input_tokens    bigint      not null default 0,
  output_tokens   bigint      not null default 0,
  failed_requests integer     not null default 0,
  updated_at      timestamptz not null default now(),

  primary key (usage_date, user_id, provider),
  constraint platform_llm_daily_usage_counts_nonneg
    check (request_count >= 0 and input_tokens >= 0 and output_tokens >= 0 and failed_requests >= 0)
);

create index if not exists platform_llm_daily_usage_date_provider_idx
  on public.platform_llm_daily_usage (usage_date, provider);

-- Deny-all RLS: this table is reachable only via the service role and the
-- SECURITY DEFINER functions below. No client (anon/authenticated) may read it.
alter table public.platform_llm_daily_usage enable row level security;
alter table public.platform_llm_daily_usage force  row level security;

-- ---------------------------------------------------------------------------
-- Atomic reservation. Serializes concurrent calls for the same (provider, UTC
-- date) with a transaction-scoped advisory lock, checks the global cap first,
-- then the per-user cap, and increments the user's request_count only when both
-- caps permit. Returns whether the request was accepted, the sanitized reason,
-- the user's remaining requests, and the next UTC reset time.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_platform_llm_request(
  p_user_id           uuid,
  p_provider          text,
  p_user_daily_limit  integer,
  p_global_daily_limit integer
)
returns table (allowed boolean, reason text, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date        date        := (now() at time zone 'utc')::date;
  v_reset       timestamptz := ((v_date + 1)::timestamp) at time zone 'utc';
  v_user_count  integer;
  v_global_count bigint;
begin
  if p_user_daily_limit <= 0 or p_global_daily_limit <= 0 then
    return query select false, 'GLOBAL_DAILY_LIMIT'::text, 0, v_reset;
    return;
  end if;

  -- Serialize all reservations for this provider on this UTC day.
  perform pg_advisory_xact_lock(hashtextextended(p_provider || ':' || v_date::text, 0));

  select coalesce(sum(request_count), 0) into v_global_count
    from public.platform_llm_daily_usage
    where usage_date = v_date and provider = p_provider;

  if v_global_count >= p_global_daily_limit then
    return query select false, 'GLOBAL_DAILY_LIMIT'::text, 0, v_reset;
    return;
  end if;

  select request_count into v_user_count
    from public.platform_llm_daily_usage
    where usage_date = v_date and user_id = p_user_id and provider = p_provider;
  v_user_count := coalesce(v_user_count, 0);

  if v_user_count >= p_user_daily_limit then
    return query select false, 'USER_DAILY_LIMIT'::text, 0, v_reset;
    return;
  end if;

  insert into public.platform_llm_daily_usage (usage_date, user_id, provider, request_count)
    values (v_date, p_user_id, p_provider, 1)
    on conflict (usage_date, user_id, provider)
    do update set request_count = platform_llm_daily_usage.request_count + 1,
                  updated_at    = now();

  return query
    select true, null::text, greatest(p_user_daily_limit - (v_user_count + 1), 0), v_reset;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record the outcome of a reserved request (tokens + success/failure). A failed
-- provider call still consumed the reserved slot, so request_count is NOT
-- decremented here — we only add token counts and, on failure, bump
-- failed_requests. Metadata only; never prompt content.
-- ---------------------------------------------------------------------------
create or replace function public.record_platform_llm_result(
  p_user_id       uuid,
  p_provider      text,
  p_input_tokens  bigint,
  p_output_tokens bigint,
  p_failed        boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'utc')::date;
begin
  update public.platform_llm_daily_usage
    set input_tokens    = input_tokens    + greatest(coalesce(p_input_tokens, 0), 0),
        output_tokens   = output_tokens   + greatest(coalesce(p_output_tokens, 0), 0),
        failed_requests = failed_requests + (case when p_failed then 1 else 0 end),
        updated_at      = now()
    where usage_date = v_date and user_id = p_user_id and provider = p_provider;
end;
$$;

-- Read a user's current usage for a provider on the current UTC day (for status).
create or replace function public.get_platform_llm_usage(
  p_user_id  uuid,
  p_provider text
)
returns table (request_count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  date        := (now() at time zone 'utc')::date;
  v_reset timestamptz := ((v_date + 1)::timestamp) at time zone 'utc';
  v_count integer;
begin
  select platform_llm_daily_usage.request_count into v_count
    from public.platform_llm_daily_usage
    where usage_date = v_date and user_id = p_user_id and provider = p_provider;
  return query select coalesce(v_count, 0), v_reset;
end;
$$;

-- Only the service role executes these; revoke from anon/authenticated.
revoke all on function public.reserve_platform_llm_request(uuid, text, integer, integer) from anon, authenticated;
revoke all on function public.record_platform_llm_result(uuid, text, bigint, bigint, boolean) from anon, authenticated;
revoke all on function public.get_platform_llm_usage(uuid, text) from anon, authenticated;
