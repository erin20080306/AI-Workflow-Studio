-- Platform administration and subscription entitlements.
-- Platform roles are intentionally separate from tenant membership roles.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (
    handle = lower(handle)
    and handle ~ '^[a-z0-9][a-z0-9_-]{2,39}$'
  ),
  role text not null check (role in ('super_admin', 'support', 'billing_admin')),
  active boolean not null default true,
  granted_by uuid references auth.users (id) on delete set null,
  grant_reason text not null check (char_length(grant_reason) between 8 and 500),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.platform_admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (char_length(action) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 120),
  resource_id text,
  correlation_id uuid not null default extensions.gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamp with time zone not null default now()
);

create table public.billing_plans (
  code text primary key check (code in ('free', 'pro', 'team', 'business')),
  name_zh_hant text not null check (char_length(name_zh_hant) between 1 and 80),
  name_en text not null check (char_length(name_en) between 1 and 80),
  monthly_price_twd integer not null check (monthly_price_twd >= 0),
  yearly_price_twd integer not null check (yearly_price_twd >= 0),
  workflow_limit integer not null check (workflow_limit > 0),
  monthly_run_limit integer not null check (monthly_run_limit > 0),
  device_limit integer not null check (device_limit > 0),
  member_limit integer not null check (member_limit > 0),
  audit_retention_days integer not null check (audit_retention_days between 7 and 3650),
  active boolean not null default true,
  display_order integer not null unique check (display_order > 0),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

insert into public.billing_plans (
  code,
  name_zh_hant,
  name_en,
  monthly_price_twd,
  yearly_price_twd,
  workflow_limit,
  monthly_run_limit,
  device_limit,
  member_limit,
  audit_retention_days,
  display_order
)
values
  ('free', '免費版', 'Free', 0, 0, 3, 100, 1, 1, 7, 1),
  ('pro', '專業版', 'Pro', 590, 5900, 25, 2500, 2, 3, 30, 2),
  ('team', '團隊版', 'Team', 1990, 19900, 100, 10000, 10, 10, 90, 3),
  ('business', '商務版', 'Business', 5990, 59900, 1000, 50000, 50, 50, 365, 4);

create table public.tenant_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  plan_code text not null default 'free' references public.billing_plans (code),
  status text not null default 'active' check (
    status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')
  ),
  billing_provider text not null default 'manual' check (
    billing_provider in ('manual', 'paddle', 'stripe', 'microsoft_store')
  ),
  external_customer_id text,
  external_subscription_id text,
  current_period_start timestamp with time zone not null default date_trunc('month', now()),
  current_period_end timestamp with time zone not null default (
    date_trunc('month', now()) + interval '1 month'
  ),
  cancel_at_period_end boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (billing_provider, external_subscription_id),
  check (current_period_end > current_period_start)
);

create table public.billing_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null check (provider in ('manual', 'paddle', 'stripe', 'microsoft_store')),
  external_event_id text not null,
  event_type text not null check (char_length(event_type) between 1 and 160),
  payload_hash bytea not null,
  processed_at timestamp with time zone,
  error_code text,
  created_at timestamp with time zone not null default now(),
  unique (provider, external_event_id)
);

create index platform_admin_audit_time_idx
  on public.platform_admin_audit_logs (created_at desc);
create index tenant_subscriptions_plan_status_idx
  on public.tenant_subscriptions (plan_code, status);
create index billing_events_tenant_time_idx
  on public.billing_events (tenant_id, created_at desc);

create trigger set_platform_admins_updated_at
  before update on public.platform_admins
  for each row execute function public.set_updated_at();

create trigger set_billing_plans_updated_at
  before update on public.billing_plans
  for each row execute function public.set_updated_at();

create trigger set_tenant_subscriptions_updated_at
  before update on public.tenant_subscriptions
  for each row execute function public.set_updated_at();

create function public.create_free_tenant_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_subscriptions (tenant_id, plan_code, status)
  values (new.id, 'free', 'active')
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

create trigger create_free_tenant_subscription
  after insert on public.tenants
  for each row execute function public.create_free_tenant_subscription();

insert into public.tenant_subscriptions (tenant_id, plan_code, status)
select id, 'free', 'active'
from public.tenants
on conflict (tenant_id) do nothing;

create function public.effective_billing_plan(target_tenant_id uuid)
returns public.billing_plans
language sql
stable
security definer
set search_path = ''
as $$
  select plan.*
  from public.billing_plans plan
  where plan.code = coalesce(
    (
      select subscription.plan_code
      from public.tenant_subscriptions subscription
      where subscription.tenant_id = target_tenant_id
        and subscription.status in ('trialing', 'active', 'past_due')
    ),
    'free'
  );
$$;

create function public.enforce_tenant_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.billing_plans;
  current_count bigint;
  limit_name text;
  allowed_count integer;
begin
  plan := public.effective_billing_plan(new.tenant_id);

  case tg_table_name
    when 'workflows' then
      if exists (select 1 from public.workflows where id = new.id) then
        return new;
      end if;
      select count(*) into current_count
      from public.workflows
      where tenant_id = new.tenant_id
        and status <> 'archived';
      limit_name := 'workflow';
      allowed_count := plan.workflow_limit;
    when 'workflow_runs' then
      if exists (
        select 1
        from public.workflow_runs
        where tenant_id = new.tenant_id
          and idempotency_key = new.idempotency_key
      ) then
        return new;
      end if;
      select count(*) into current_count
      from public.workflow_runs
      where tenant_id = new.tenant_id
        and created_at >= date_trunc('month', now());
      limit_name := 'monthly run';
      allowed_count := plan.monthly_run_limit;
    when 'devices' then
      if exists (select 1 from public.devices where id = new.id) then
        return new;
      end if;
      select count(*) into current_count
      from public.devices
      where tenant_id = new.tenant_id
        and status <> 'revoked';
      limit_name := 'device';
      allowed_count := plan.device_limit;
    when 'memberships' then
      if exists (
        select 1
        from public.memberships
        where tenant_id = new.tenant_id
          and user_id = new.user_id
      ) then
        return new;
      end if;
      select count(*) into current_count
      from public.memberships
      where tenant_id = new.tenant_id;
      limit_name := 'member';
      allowed_count := plan.member_limit;
    else
      raise exception using
        errcode = '22023',
        message = 'Unsupported subscription limit target';
  end case;

  if current_count >= allowed_count then
    raise exception using
      errcode = '23514',
      message = format('%s plan %s limit reached', plan.code, limit_name);
  end if;

  return new;
end;
$$;

create trigger enforce_workflow_subscription_limit
  before insert on public.workflows
  for each row execute function public.enforce_tenant_subscription_limit();

create trigger enforce_run_subscription_limit
  before insert on public.workflow_runs
  for each row execute function public.enforce_tenant_subscription_limit();

create trigger enforce_device_subscription_limit
  before insert on public.devices
  for each row execute function public.enforce_tenant_subscription_limit();

create trigger enforce_member_subscription_limit
  before insert on public.memberships
  for each row execute function public.enforce_tenant_subscription_limit();

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and active
  );
$$;

create function public.platform_admin_change_tenant_plan(
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

  select plan_code into previous_plan_code
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
      'toPlanCode', target_plan_code
    )
  );

  return updated_subscription;
end;
$$;

alter table public.platform_admins enable row level security;
alter table public.platform_admin_audit_logs enable row level security;
alter table public.billing_plans enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.billing_events enable row level security;

create policy billing_plan_public_select
  on public.billing_plans
  for select
  to anon, authenticated
  using (active);

create policy tenant_subscription_member_select
  on public.tenant_subscriptions
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.platform_admins from public, anon, authenticated;
revoke all on public.platform_admin_audit_logs from public, anon, authenticated;
revoke all on public.billing_plans from public, anon, authenticated;
revoke all on public.tenant_subscriptions from public, anon, authenticated;
revoke all on public.billing_events from public, anon, authenticated;
revoke all on function public.create_free_tenant_subscription() from public, anon, authenticated;
revoke all on function public.effective_billing_plan(uuid) from public, anon, authenticated;
revoke all on function public.enforce_tenant_subscription_limit() from public, anon, authenticated;
revoke all on function public.is_platform_admin() from public, anon, authenticated;
revoke all on function public.platform_admin_change_tenant_plan(uuid, uuid, text)
  from public, anon, authenticated;

grant usage on schema public to anon;
grant select on public.billing_plans to anon, authenticated;
grant select on public.tenant_subscriptions to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

grant all on public.platform_admins to service_role;
grant all on public.platform_admin_audit_logs to service_role;
grant all on public.billing_plans to service_role;
grant all on public.tenant_subscriptions to service_role;
grant all on public.billing_events to service_role;
grant usage, select on sequence public.platform_admin_audit_logs_id_seq to service_role;
grant usage, select on sequence public.billing_events_id_seq to service_role;
grant execute on function public.effective_billing_plan(uuid) to service_role;
grant execute on function public.platform_admin_change_tenant_plan(uuid, uuid, text)
  to service_role;
