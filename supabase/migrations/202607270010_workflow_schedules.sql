-- Safe recurring workflow schedules and idempotent fire claims.
-- Schedule mutations and fire records stay behind authenticated server routes.

create table public.workflow_schedules (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workflow_id uuid not null,
  workflow_version_id uuid not null,
  device_id uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  rule jsonb not null check (
    jsonb_typeof(rule) = 'object'
    and rule ->> 'cadence' in ('every_15_minutes', 'hourly', 'daily', 'weekdays')
  ),
  cron_expression text not null check (
    cron_expression in ('*/15 * * * *', '0 * * * *')
    or cron_expression ~ '^[0-5]?[0-9] ([01]?[0-9]|2[0-3]) \* \* (\*|1-5)$'
  ),
  timezone text not null check (
    char_length(timezone) between 3 and 100
    and (
      timezone = 'UTC'
      or timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$'
    )
  ),
  status text not null default 'active'
    check (status in ('active', 'paused', 'disabled')),
  next_run_at timestamp with time zone not null,
  last_fired_at timestamp with time zone,
  failure_count integer not null default 0 check (failure_count between 0 and 10),
  max_failures integer not null default 3 check (max_failures between 1 and 10),
  last_error_code text check (
    last_error_code is null or char_length(last_error_code) between 1 and 120
  ),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (workflow_id, tenant_id)
    references public.workflows (id, tenant_id)
    on delete cascade,
  foreign key (workflow_version_id, workflow_id, tenant_id)
    references public.workflow_versions (id, workflow_id, tenant_id)
    on delete restrict,
  foreign key (device_id, tenant_id)
    references public.devices (id, tenant_id)
    on delete restrict,
  unique (id, tenant_id)
);

create table public.workflow_schedule_fires (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  schedule_id uuid not null,
  due_at timestamp with time zone not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  status text not null check (status in ('claimed', 'run_created', 'failed')),
  workflow_run_id uuid,
  error_code text check (error_code is null or char_length(error_code) between 1 and 120),
  created_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  foreign key (schedule_id, tenant_id)
    references public.workflow_schedules (id, tenant_id)
    on delete cascade,
  foreign key (workflow_run_id, tenant_id)
    references public.workflow_runs (id, tenant_id)
    on delete set null (workflow_run_id),
  unique (tenant_id, idempotency_key),
  unique (schedule_id, due_at),
  check ((status = 'claimed') = (completed_at is null)),
  check ((status = 'run_created') = (workflow_run_id is not null))
);

create index workflow_schedules_due_idx
  on public.workflow_schedules (next_run_at, id)
  where status = 'active';

create index workflow_schedules_tenant_status_idx
  on public.workflow_schedules (tenant_id, status, next_run_at);

create index workflow_schedule_fires_tenant_created_idx
  on public.workflow_schedule_fires (tenant_id, created_at desc);

create trigger set_workflow_schedules_updated_at
before update on public.workflow_schedules
for each row execute function public.set_updated_at();

alter table public.workflow_schedules enable row level security;
alter table public.workflow_schedule_fires enable row level security;

create policy workflow_schedule_member_select
  on public.workflow_schedules
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.workflow_schedules from public, anon, authenticated;
revoke all on public.workflow_schedule_fires from public, anon, authenticated;
grant select on public.workflow_schedules to authenticated;
grant all on public.workflow_schedules to service_role;
grant all on public.workflow_schedule_fires to service_role;

create function public.claim_workflow_schedule_fire(
  target_tenant_id uuid,
  target_schedule_id uuid,
  target_due_at timestamp with time zone,
  target_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workflow_schedule_fires (
    tenant_id,
    schedule_id,
    due_at,
    idempotency_key,
    status
  )
  values (
    target_tenant_id,
    target_schedule_id,
    target_due_at,
    target_idempotency_key,
    'claimed'
  )
  on conflict do nothing;

  return found;
end;
$$;

revoke all on function public.claim_workflow_schedule_fire(
  uuid,
  uuid,
  timestamp with time zone,
  text
) from public, anon, authenticated;
grant execute on function public.claim_workflow_schedule_fire(
  uuid,
  uuid,
  timestamp with time zone,
  text
) to service_role;
