-- Usage guardrails and Microsoft Store entitlement synchronization.
-- Store ID keys and Microsoft access tokens are intentionally never persisted.

alter table public.billing_plans
  add column monthly_ai_cost_budget_microunits bigint not null default 10000000
    check (monthly_ai_cost_budget_microunits > 0),
  add column ai_requests_per_minute integer not null default 3
    check (ai_requests_per_minute between 1 and 1000),
  add column monthly_source_bytes bigint not null default 20971520
    check (monthly_source_bytes > 0),
  add column monthly_tool_call_limit integer not null default 100
    check (monthly_tool_call_limit > 0);

update public.billing_plans
set
  monthly_ai_cost_budget_microunits = case code
    when 'free' then 10000000
    when 'pro' then 150000000
    when 'team' then 550000000
    when 'business' then 1700000000
  end,
  ai_requests_per_minute = case code
    when 'free' then 3
    when 'pro' then 10
    when 'team' then 30
    when 'business' then 60
  end,
  monthly_source_bytes = case code
    when 'free' then 20971520
    when 'pro' then 1073741824
    when 'team' then 10737418240
    when 'business' then 53687091200
  end,
  monthly_tool_call_limit = case code
    when 'free' then 100
    when 'pro' then 2500
    when 'team' then 10000
    when 'business' then 50000
  end;

-- Microsoft Store is the only commerce provider. Manual remains available only
-- for audited testing, compensation, and support overrides.
alter table public.tenant_subscriptions
  drop constraint tenant_subscriptions_billing_provider_check,
  add constraint tenant_subscriptions_billing_provider_check
    check (billing_provider in ('manual', 'microsoft_store')),
  add column store_product_id text,
  add column store_sku_id text,
  add column store_entitlement_state text check (
    store_entitlement_state is null
    or store_entitlement_state in ('Active', 'InDunning', 'Inactive', 'Canceled', 'Failed')
  ),
  add column entitlement_last_verified_at timestamp with time zone,
  add column entitlement_expires_at timestamp with time zone,
  add column entitlement_grace_expires_at timestamp with time zone,
  add column entitlement_payload_hash text check (
    entitlement_payload_hash is null
    or entitlement_payload_hash ~ '^[a-f0-9]{64}$'
  );

alter table public.billing_events
  drop constraint billing_events_provider_check,
  add constraint billing_events_provider_check
    check (provider in ('manual', 'microsoft_store'));

create table public.usage_budget_reservations (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  provider text not null check (provider in ('anthropic', 'gemini', 'mock', 'openai')),
  operation text not null check (operation in ('chat', 'workflow_plan', 'website_generation')),
  maximum_cost_microunits bigint not null check (maximum_cost_microunits >= 0),
  status text not null default 'active' check (status in ('active', 'released', 'expired')),
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + interval '15 minutes'),
  released_at timestamp with time zone,
  check (expires_at > created_at)
);

create index usage_budget_reservations_tenant_active_idx
  on public.usage_budget_reservations (tenant_id, status, expires_at);
create index usage_budget_reservations_tenant_rate_idx
  on public.usage_budget_reservations (tenant_id, created_at desc);

create function public.reserve_tenant_usage_budget(
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
    or target_operation not in ('chat', 'workflow_plan', 'website_generation')
    or target_maximum_cost_microunits < 0
  then
    raise exception using errcode = '22023', message = 'USAGE_RESERVATION_INVALID';
  end if;

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

  if current_usage + active_reserved + target_maximum_cost_microunits
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

create function public.record_tenant_ai_usage(
  actor_id uuid,
  target_reservation_id uuid,
  target_provider text,
  target_operation text,
  target_input_units bigint,
  target_output_units bigint,
  target_actual_cost_microunits bigint,
  usage_metadata jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.usage_budget_reservations;
  usage_id bigint;
begin
  select * into reservation
  from public.usage_budget_reservations
  where id = target_reservation_id
  for update;

  if reservation.id is null
    or reservation.actor_user_id <> actor_id
    or reservation.provider <> target_provider
    or reservation.operation <> target_operation
  then
    raise exception using errcode = '42501', message = 'USAGE_RESERVATION_ACCESS_DENIED';
  end if;
  if reservation.status <> 'active' or reservation.expires_at <= now() then
    raise exception using errcode = '23514', message = 'USAGE_RESERVATION_INACTIVE';
  end if;
  if target_input_units < 0 or target_output_units < 0 or target_actual_cost_microunits < 0
    or target_actual_cost_microunits > reservation.maximum_cost_microunits
    or jsonb_typeof(usage_metadata) <> 'object'
  then
    raise exception using errcode = '22023', message = 'USAGE_RECORD_INVALID';
  end if;

  insert into public.usage_records (
    tenant_id,
    actor_user_id,
    provider,
    operation,
    input_units,
    output_units,
    cost_microunits,
    metadata
  )
  values (
    reservation.tenant_id,
    actor_id,
    target_provider,
    target_operation,
    target_input_units,
    target_output_units,
    target_actual_cost_microunits,
    usage_metadata || jsonb_build_object('reservationId', target_reservation_id)
  )
  returning id into usage_id;

  update public.usage_budget_reservations
  set
    status = 'released',
    released_at = now()
  where id = target_reservation_id;

  return usage_id;
end;
$$;

create function public.release_tenant_usage_reservation(
  actor_id uuid,
  target_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.usage_budget_reservations
  set
    status = case when expires_at <= now() then 'expired' else 'released' end,
    released_at = now()
  where id = target_reservation_id
    and actor_user_id = actor_id
    and status = 'active';
  return found;
end;
$$;

create function public.consume_tenant_metered_allowance(
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

  if current_units + target_units > allowed_units then
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

create function public.sync_microsoft_store_entitlement(
  actor_id uuid,
  target_tenant_id uuid,
  target_plan_code text,
  target_entitlement_state text,
  target_external_subscription_id text,
  target_store_product_id text,
  target_store_sku_id text,
  target_period_start timestamp with time zone,
  target_expires_at timestamp with time zone,
  target_grace_expires_at timestamp with time zone,
  target_is_trial boolean,
  target_market text,
  target_payload_hash text
)
returns public.tenant_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  next_plan text;
  next_status text;
  updated_subscription public.tenant_subscriptions;
begin
  select role into actor_role
  from public.memberships
  where tenant_id = target_tenant_id
    and user_id = actor_id;
  if actor_role not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'STORE_ENTITLEMENT_ADMIN_REQUIRED';
  end if;
  if target_plan_code not in ('free', 'pro', 'team', 'business')
    or target_entitlement_state not in ('Active', 'InDunning', 'Inactive', 'Canceled', 'Failed')
    or char_length(target_external_subscription_id) not between 1 and 200
    or char_length(target_store_product_id) not between 1 and 200
    or char_length(target_store_sku_id) not between 1 and 200
    or target_payload_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception using errcode = '22023', message = 'STORE_ENTITLEMENT_INVALID';
  end if;

  next_plan := case when target_entitlement_state in ('Active', 'InDunning')
    then target_plan_code else 'free' end;
  next_status := case
    when target_entitlement_state = 'Active' and target_is_trial then 'trialing'
    when target_entitlement_state = 'Active' then 'active'
    when target_entitlement_state = 'InDunning' and target_grace_expires_at > now() then 'past_due'
    else 'canceled'
  end;

  update public.tenant_subscriptions
  set
    plan_code = next_plan,
    status = next_status,
    billing_provider = 'microsoft_store',
    external_subscription_id = target_external_subscription_id,
    current_period_start = least(target_period_start, target_expires_at - interval '1 second'),
    current_period_end = greatest(target_expires_at, target_period_start + interval '1 second'),
    cancel_at_period_end = target_entitlement_state <> 'Active',
    store_product_id = target_store_product_id,
    store_sku_id = target_store_sku_id,
    store_entitlement_state = target_entitlement_state,
    entitlement_last_verified_at = now(),
    entitlement_expires_at = target_expires_at,
    entitlement_grace_expires_at = target_grace_expires_at,
    entitlement_payload_hash = target_payload_hash,
    updated_at = now()
  where tenant_id = target_tenant_id
  returning * into updated_subscription;

  if updated_subscription.id is null then
    raise exception using errcode = 'P0002', message = 'STORE_SUBSCRIPTION_NOT_FOUND';
  end if;

  insert into public.billing_events (
    tenant_id,
    provider,
    external_event_id,
    event_type,
    payload_hash,
    processed_at
  )
  values (
    target_tenant_id,
    'microsoft_store',
    target_external_subscription_id || ':' || target_payload_hash,
    'subscription.entitlement_synced',
    decode(target_payload_hash, 'hex'),
    now()
  )
  on conflict (provider, external_event_id) do nothing;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_tenant_id,
    actor_id,
    'subscription.microsoft_store.synced',
    'tenant_subscription',
    updated_subscription.id,
    jsonb_build_object(
      'planCode', next_plan,
      'status', next_status,
      'entitlementState', target_entitlement_state,
      'productId', target_store_product_id,
      'skuId', target_store_sku_id,
      'market', target_market,
      'payloadHash', target_payload_hash
    )
  );

  return updated_subscription;
end;
$$;

create or replace function public.platform_admin_change_tenant_plan(
  actor_id uuid,
  target_tenant_id uuid,
  target_plan_code text
)
returns public.tenant_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_billing_provider text;
  previous_plan_code text;
  updated_subscription public.tenant_subscriptions;
begin
  if not exists (
    select 1
    from public.platform_admins
    where user_id = actor_id
      and active
      and role in ('super_admin', 'billing_admin')
  ) then
    raise exception using errcode = '42501', message = 'Platform billing administration required';
  end if;

  if not exists (
    select 1
    from public.billing_plans
    where code = target_plan_code
      and active
  ) then
    raise exception using errcode = '22023', message = 'Invalid billing plan';
  end if;

  select plan_code, billing_provider
  into previous_plan_code, previous_billing_provider
  from public.tenant_subscriptions
  where tenant_id = target_tenant_id
  for update;

  if previous_plan_code is null then
    raise exception using errcode = 'P0002', message = 'Tenant subscription not found';
  end if;

  update public.tenant_subscriptions
  set
    plan_code = target_plan_code,
    status = 'active',
    billing_provider = 'manual',
    external_customer_id = null,
    external_subscription_id = null,
    cancel_at_period_end = false,
    store_product_id = null,
    store_sku_id = null,
    store_entitlement_state = null,
    entitlement_last_verified_at = null,
    entitlement_expires_at = null,
    entitlement_grace_expires_at = null,
    entitlement_payload_hash = null,
    updated_at = now()
  where tenant_id = target_tenant_id
  returning * into updated_subscription;

  insert into public.platform_admin_audit_logs (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    actor_id,
    'tenant.subscription.plan_changed',
    'tenant_subscription',
    target_tenant_id::text,
    jsonb_build_object(
      'fromPlanCode', previous_plan_code,
      'fromBillingProvider', previous_billing_provider,
      'toPlanCode', target_plan_code,
      'toBillingProvider', 'manual',
      'source', 'internal_override'
    )
  );

  return updated_subscription;
end;
$$;

alter table public.usage_budget_reservations enable row level security;

revoke all on public.usage_budget_reservations from public, anon, authenticated;
revoke all on function public.reserve_tenant_usage_budget(uuid, uuid, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.record_tenant_ai_usage(uuid, uuid, text, text, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.release_tenant_usage_reservation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_tenant_metered_allowance(uuid, uuid, text, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.sync_microsoft_store_entitlement(
  uuid, uuid, text, text, text, text, text, timestamp with time zone,
  timestamp with time zone, timestamp with time zone, boolean, text, text
) from public, anon, authenticated;

grant all on public.usage_budget_reservations to service_role;
grant execute on function public.reserve_tenant_usage_budget(uuid, uuid, text, text, bigint)
  to service_role;
grant execute on function public.record_tenant_ai_usage(uuid, uuid, text, text, bigint, bigint, bigint, jsonb)
  to service_role;
grant execute on function public.release_tenant_usage_reservation(uuid, uuid)
  to service_role;
grant execute on function public.consume_tenant_metered_allowance(uuid, uuid, text, bigint, jsonb)
  to service_role;
grant execute on function public.sync_microsoft_store_entitlement(
  uuid, uuid, text, text, text, text, text, timestamp with time zone,
  timestamp with time zone, timestamp with time zone, boolean, text, text
) to service_role;
