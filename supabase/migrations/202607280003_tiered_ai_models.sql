-- Tier-aware AI model routing and per-request cost ceilings.
-- Provider secrets remain exclusively in server environment variables.

alter table public.billing_plans
  add column maximum_ai_model_tier text not null default 'economy'
    check (maximum_ai_model_tier in ('economy', 'standard', 'advanced', 'flagship')),
  add column maximum_ai_request_cost_microunits bigint not null default 3000000
    check (maximum_ai_request_cost_microunits > 0);

update public.billing_plans
set
  maximum_ai_model_tier = case code
    when 'free' then 'economy'
    when 'pro' then 'standard'
    when 'team' then 'advanced'
    when 'business' then 'flagship'
  end,
  maximum_ai_request_cost_microunits = case code
    when 'free' then 3000000
    when 'pro' then 15000000
    when 'team' then 40000000
    when 'business' then 60000000
  end;

create table public.ai_model_tier_mappings (
  provider text not null check (provider in ('anthropic', 'gemini', 'openai')),
  tier text not null check (tier in ('economy', 'standard', 'advanced', 'flagship')),
  model text not null check (
    char_length(model) between 2 and 120
    and model ~ '^[A-Za-z0-9._:-]+$'
  ),
  enabled boolean not null default true,
  cost_multiplier double precision not null check (cost_multiplier between 0.1 and 100),
  reasoning_effort text check (
    reasoning_effort is null or reasoning_effort in ('low', 'medium', 'high')
  ),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamp with time zone not null default now(),
  primary key (provider, tier),
  check (
    (provider = 'openai' and reasoning_effort is not null)
    or (provider <> 'openai' and reasoning_effort is null)
  )
);

insert into public.ai_model_tier_mappings (
  provider,
  tier,
  model,
  enabled,
  cost_multiplier,
  reasoning_effort
)
values
  ('openai', 'economy', 'gpt-5.6-luna', true, 1, 'low'),
  ('openai', 'standard', 'gpt-5.6-terra', true, 3, 'medium'),
  ('openai', 'advanced', 'gpt-5.6-sol', true, 8, 'medium'),
  ('openai', 'flagship', 'gpt-5.6-sol', true, 12, 'high'),
  ('anthropic', 'economy', 'claude-haiku-4-5-20251001', true, 1, null),
  ('anthropic', 'standard', 'claude-sonnet-5', true, 2, null),
  ('anthropic', 'advanced', 'claude-opus-4-8', true, 5, null),
  ('anthropic', 'flagship', 'claude-fable-5', true, 10, null),
  ('gemini', 'economy', 'gemini-3.5-flash-lite', true, 1, null),
  ('gemini', 'standard', 'gemini-3.6-flash', true, 4, null),
  ('gemini', 'advanced', 'gemini-3.5-flash', true, 4.5, null),
  ('gemini', 'flagship', 'gemini-3.1-pro-preview', true, 6, null);

alter table public.ai_model_tier_mappings enable row level security;

revoke all on public.ai_model_tier_mappings from public, anon, authenticated;
grant all on public.ai_model_tier_mappings to service_role;

create function public.platform_admin_update_ai_model_mapping(
  actor_id uuid,
  target_provider text,
  target_tier text,
  target_model text,
  target_enabled boolean
)
returns public.ai_model_tier_mappings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.ai_model_tier_mappings;
begin
  if not exists (
    select 1
    from public.platform_admins
    where user_id = actor_id
      and role = 'super_admin'
      and active
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_SUPER_ADMIN_REQUIRED';
  end if;

  if target_provider not in ('anthropic', 'gemini', 'openai')
    or target_tier not in ('economy', 'standard', 'advanced', 'flagship')
    or target_model !~ '^[A-Za-z0-9._:-]{2,120}$'
    or not (
      (
        target_provider = 'openai'
        and target_tier = 'economy'
        and target_model = 'gpt-5.6-luna'
      )
      or (
        target_provider = 'openai'
        and target_tier = 'standard'
        and target_model = 'gpt-5.6-terra'
      )
      or (
        target_provider = 'openai'
        and target_tier = 'advanced'
        and target_model = 'gpt-5.6-sol'
      )
      or (
        target_provider = 'openai'
        and target_tier = 'flagship'
        and target_model = 'gpt-5.6-sol'
      )
      or (
        target_provider = 'anthropic'
        and target_tier = 'economy'
        and target_model = 'claude-haiku-4-5-20251001'
      )
      or (
        target_provider = 'anthropic'
        and target_tier = 'standard'
        and target_model = 'claude-sonnet-5'
      )
      or (
        target_provider = 'anthropic'
        and target_tier = 'advanced'
        and target_model = 'claude-opus-4-8'
      )
      or (
        target_provider = 'anthropic'
        and target_tier = 'flagship'
        and target_model = 'claude-fable-5'
      )
      or (
        target_provider = 'gemini'
        and target_tier = 'economy'
        and target_model = 'gemini-3.5-flash-lite'
      )
      or (
        target_provider = 'gemini'
        and target_tier = 'standard'
        and target_model = 'gemini-3.6-flash'
      )
      or (
        target_provider = 'gemini'
        and target_tier = 'advanced'
        and target_model = 'gemini-3.5-flash'
      )
      or (
        target_provider = 'gemini'
        and target_tier = 'flagship'
        and target_model = 'gemini-3.1-pro-preview'
      )
    )
  then
    raise exception using errcode = '22023', message = 'AI_MODEL_MAPPING_INVALID';
  end if;

  update public.ai_model_tier_mappings
  set
    model = target_model,
    enabled = target_enabled,
    updated_by = actor_id,
    updated_at = now()
  where provider = target_provider
    and tier = target_tier
  returning * into result;

  if result.provider is null then
    raise exception using errcode = 'P0002', message = 'AI_MODEL_MAPPING_NOT_FOUND';
  end if;

  insert into public.platform_admin_audit_logs (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    actor_id,
    'ai_model_mapping.updated',
    'ai_model_tier_mapping',
    target_provider || ':' || target_tier,
    jsonb_build_object(
      'provider', target_provider,
      'tier', target_tier,
      'model', target_model,
      'enabled', target_enabled
    )
  );

  return result;
end;
$$;

revoke all on function public.platform_admin_update_ai_model_mapping(
  uuid,
  text,
  text,
  text,
  boolean
) from public, anon, authenticated;
grant execute on function public.platform_admin_update_ai_model_mapping(
  uuid,
  text,
  text,
  text,
  boolean
) to service_role;
