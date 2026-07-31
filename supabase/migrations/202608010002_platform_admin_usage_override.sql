-- Platform administrators may run production acceptance and support workflows
-- after a tenant reaches its subscription allowance. Usage remains recorded and
-- auditable; per-request server limits and provider checks remain enforced.

create or replace function public.reserve_tenant_usage_budget(
  actor_id uuid,
  target_tenant_id uuid,
  target_provider text,
  target_operation text,
  target_maximum_cost_microunits bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_reserved bigint;
  actor_is_platform_admin boolean;
  current_usage bigint;
  effective_plan public.billing_plans;
  period_start timestamp with time zone;
  recent_requests bigint;
  reservation_id uuid;
begin
  if not exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'USAGE_TENANT_ACCESS_REQUIRED';
  end if;
  if target_provider not in ('anthropic', 'gemini', 'mock', 'openai')
    or target_operation not in (
      'chat',
      'website_generation',
      'website_image_generation',
      'workflow_plan'
    )
    or target_maximum_cost_microunits < 0
  then
    raise exception using errcode = '22023', message = 'USAGE_RESERVATION_INVALID';
  end if;

  select exists (
    select 1
    from public.platform_admins
    where user_id = actor_id
      and active
  ) into actor_is_platform_admin;

  perform 1
  from public.tenant_subscriptions
  where tenant_id = target_tenant_id
  for update;

  update public.usage_budget_reservations
  set status = 'expired'
  where tenant_id = target_tenant_id
    and status = 'active'
    and expires_at <= now();

  effective_plan := public.effective_billing_plan(target_tenant_id);
  select current_period_start into period_start
  from public.tenant_subscriptions
  where tenant_id = target_tenant_id;
  period_start := greatest(period_start, date_trunc('month', now()));

  select count(*) into recent_requests
  from public.usage_budget_reservations
  where tenant_id = target_tenant_id
    and created_at > now() - interval '1 minute';

  if recent_requests >= effective_plan.ai_requests_per_minute then
    raise exception using errcode = 'P0001', message = 'USAGE_RATE_LIMIT_EXCEEDED';
  end if;

  select coalesce(sum(cost_microunits), 0) into current_usage
  from public.usage_records
  where tenant_id = target_tenant_id
    and occurred_at >= period_start;

  select coalesce(sum(reservation.maximum_cost_microunits), 0) into active_reserved
  from public.usage_budget_reservations as reservation
  where reservation.tenant_id = target_tenant_id
    and reservation.status = 'active'
    and reservation.expires_at > now();

  if not actor_is_platform_admin
    and current_usage + active_reserved + target_maximum_cost_microunits
      > effective_plan.monthly_ai_cost_budget_microunits
  then
    raise exception using errcode = 'P0001', message = 'USAGE_BUDGET_EXCEEDED';
  end if;

  insert into public.usage_budget_reservations (
    tenant_id,
    actor_user_id,
    provider,
    operation,
    maximum_cost_microunits
  )
  values (
    target_tenant_id,
    actor_id,
    target_provider,
    target_operation,
    target_maximum_cost_microunits
  )
  returning id into reservation_id;

  return reservation_id;
end;
$$;

create or replace function public.consume_tenant_metered_allowance(
  actor_id uuid,
  target_tenant_id uuid,
  target_operation text,
  target_units bigint,
  usage_metadata jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_is_platform_admin boolean;
  allowed_units bigint;
  current_units bigint;
  effective_plan public.billing_plans;
  period_start timestamp with time zone;
  usage_id bigint;
begin
  if not exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'USAGE_TENANT_ACCESS_REQUIRED';
  end if;
  if target_operation not in ('source_upload', 'tool_call')
    or target_units <= 0
    or jsonb_typeof(usage_metadata) <> 'object'
  then
    raise exception using errcode = '22023', message = 'USAGE_ALLOWANCE_INVALID';
  end if;

  select exists (
    select 1
    from public.platform_admins
    where user_id = actor_id
      and active
  ) into actor_is_platform_admin;

  perform 1
  from public.tenant_subscriptions
  where tenant_id = target_tenant_id
  for update;
  effective_plan := public.effective_billing_plan(target_tenant_id);
  allowed_units := case target_operation
    when 'source_upload' then effective_plan.monthly_source_bytes
    else effective_plan.monthly_tool_call_limit
  end;
  select current_period_start into period_start
  from public.tenant_subscriptions
  where tenant_id = target_tenant_id;
  period_start := greatest(period_start, date_trunc('month', now()));

  select coalesce(sum(input_units), 0) into current_units
  from public.usage_records
  where tenant_id = target_tenant_id
    and operation = target_operation
    and occurred_at >= period_start;

  if not actor_is_platform_admin and current_units + target_units > allowed_units then
    raise exception using errcode = 'P0001', message = 'USAGE_ALLOWANCE_EXCEEDED';
  end if;

  insert into public.usage_records (
    tenant_id,
    actor_user_id,
    provider,
    operation,
    input_units,
    metadata
  )
  values (
    target_tenant_id,
    actor_id,
    'platform',
    target_operation,
    target_units,
    usage_metadata
  )
  returning id into usage_id;
  return usage_id;
end;
$$;
