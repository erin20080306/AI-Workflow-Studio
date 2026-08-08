-- Serialize device-limit checks and make operator revocation converge active work.

create function public.lock_tenant_for_device_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- BEFORE INSERT triggers run in name order. This trigger is intentionally
  -- prefixed so the tenant lock is held before the subscription-count trigger.
  perform 1
  from public.tenants
  where id = new.tenant_id
  for update;

  return new;
end;
$$;

create trigger a_lock_tenant_for_device_limit
  before insert on public.devices
  for each row execute function public.lock_tenant_for_device_limit();

revoke all on function public.lock_tenant_for_device_limit()
from public, anon, authenticated;

-- Device lifecycle writes must use the server-owned pairing and audited
-- revocation RPCs. RLS alone is not enough because a manager could otherwise
-- toggle a revoked row back to active and bypass both quota and cleanup.
drop policy if exists tenant_manager_insert on public.devices;
drop policy if exists tenant_manager_update on public.devices;
drop policy if exists tenant_manager_delete on public.devices;
revoke insert, update, delete on public.devices from authenticated;

create function public.prevent_revoked_device_reactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception using
      errcode = '23514',
      message = 'revoked devices cannot be reactivated';
  end if;
  return new;
end;
$$;

create trigger prevent_revoked_device_reactivation
  before update on public.devices
  for each row execute function public.prevent_revoked_device_reactivation();

revoke all on function public.prevent_revoked_device_reactivation()
from public, anon, authenticated;

create function public.require_active_agent_job_device()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_status public.device_status;
begin
  select status into target_status
  from public.devices
  where id = new.device_id
    and tenant_id = new.tenant_id
  for share;

  if target_status is null or target_status = 'revoked' then
    raise exception using
      errcode = '23514',
      message = 'agent job requires an active device';
  end if;

  return new;
end;
$$;

create trigger require_active_device_for_agent_job
  before insert on public.agent_jobs
  for each row execute function public.require_active_agent_job_device();

revoke all on function public.require_active_agent_job_device()
from public, anon, authenticated;

create function public.cancel_agent_jobs_for_timed_out_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.agent_jobs
  set
    status = 'cancelled',
    leased_until = null,
    completed_at = coalesce(new.completed_at, statement_timestamp()),
    updated_at = statement_timestamp()
  where tenant_id = new.tenant_id
    and workflow_run_id = new.id
    and status in ('pending', 'claimed', 'running');
  return new;
end;
$$;

create trigger cancel_agent_jobs_when_run_times_out
  after update of status on public.workflow_runs
  for each row
  when (old.status is distinct from new.status and new.status = 'timed_out')
  execute function public.cancel_agent_jobs_for_timed_out_run();

revoke all on function public.cancel_agent_jobs_for_timed_out_run()
from public, anon, authenticated;

create function public.revoke_agent_device_v2(
  requested_tenant_id uuid,
  requested_device_id uuid,
  requested_actor_user_id uuid,
  requested_now timestamp with time zone
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_run_ids uuid[] := '{}'::uuid[];
  cancelled_job_count integer := 0;
  cancelled_run_count integer := 0;
  target_device public.devices;
begin
  if not exists (
    select 1
    from public.memberships
    where tenant_id = requested_tenant_id
      and user_id = requested_actor_user_id
      and role in ('owner', 'admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only a tenant owner or administrator can revoke a device';
  end if;

  select * into target_device
  from public.devices
  where id = requested_device_id
    and tenant_id = requested_tenant_id
    and status <> 'revoked'
  for update;

  if target_device.id is null then
    return false;
  end if;

  -- The device row blocks new Agent Job inserts. Identify every still-active
  -- Run ever assigned to this device, including a Job that committed a terminal
  -- result immediately before this revocation.
  select coalesce(array_agg(distinct jobs.workflow_run_id), '{}'::uuid[])
  into affected_run_ids
  from public.agent_jobs as jobs
  inner join public.workflow_runs as runs
    on runs.id = jobs.workflow_run_id
    and runs.tenant_id = jobs.tenant_id
  where jobs.device_id = requested_device_id
    and jobs.tenant_id = requested_tenant_id
    and runs.status in ('queued', 'running');

  -- Match transition_workflow_run's Run -> Job lock order. Stable ordering
  -- prevents two multi-Run revocations from locking the same rows differently.
  perform 1
  from public.workflow_runs
  where tenant_id = requested_tenant_id
    and id = any(affected_run_ids)
  order by id
  for update;

  perform 1
  from public.agent_jobs
  where tenant_id = requested_tenant_id
    and (
      device_id = requested_device_id
      or workflow_run_id = any(affected_run_ids)
    )
  order by id
  for update;

  update public.workflow_run_steps
  set
    status = 'cancelled',
    started_at = coalesce(started_at, requested_now),
    completed_at = requested_now,
    updated_at = requested_now,
    error_code = null,
    error_message = null
  where tenant_id = requested_tenant_id
    and workflow_run_id = any(affected_run_ids)
    and status in ('pending', 'running');

  with candidates as (
    select id, status as previous_status
    from public.workflow_runs
    where tenant_id = requested_tenant_id
      and id = any(affected_run_ids)
      and status in ('queued', 'running')
    for update
  ), cancelled_runs as (
    update public.workflow_runs as runs
    set
      status = 'cancelled',
      started_at = coalesce(runs.started_at, requested_now),
      completed_at = requested_now,
      cancel_requested_at = requested_now,
      updated_at = requested_now,
      error_code = null,
      error_message = null
    from candidates
    where runs.id = candidates.id
      and runs.tenant_id = requested_tenant_id
    returning runs.id, candidates.previous_status
  )
  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    correlation_id,
    metadata
  )
  select
    requested_tenant_id,
    requested_actor_user_id,
    'run.cancelled',
    'workflow_run',
    cancelled_runs.id,
    cancelled_runs.id,
    jsonb_build_object(
      'from', cancelled_runs.previous_status,
      'to', 'cancelled',
      'reason', 'device_revoked'
    )
  from cancelled_runs;

  get diagnostics cancelled_run_count = row_count;

  update public.agent_jobs
  set
    status = 'cancelled',
    leased_until = null,
    completed_at = requested_now,
    updated_at = requested_now
  where tenant_id = requested_tenant_id
    and (
      device_id = requested_device_id
      or workflow_run_id = any(affected_run_ids)
    )
    and status in ('pending', 'claimed', 'running');

  get diagnostics cancelled_job_count = row_count;

  update public.devices
  set
    status = 'revoked',
    revoked_at = requested_now,
    updated_at = requested_now
  where id = requested_device_id
    and tenant_id = requested_tenant_id;

  update public.device_tokens
  set revoked_at = requested_now, updated_at = requested_now
  where device_id = requested_device_id
    and tenant_id = requested_tenant_id
    and revoked_at is null;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    requested_tenant_id,
    requested_actor_user_id,
    'device.revoked',
    'device',
    requested_device_id,
    jsonb_build_object(
      'cancelledJobCount', cancelled_job_count,
      'cancelledRunCount', cancelled_run_count,
      'previousStatus', target_device.status
    )
  );

  return true;
end;
$$;

revoke execute on function public.revoke_agent_device(
  uuid,
  uuid,
  timestamp with time zone
) from service_role;
revoke all on function public.revoke_agent_device_v2(
  uuid,
  uuid,
  uuid,
  timestamp with time zone
) from public, anon, authenticated;
grant execute on function public.revoke_agent_device_v2(
  uuid,
  uuid,
  uuid,
  timestamp with time zone
) to service_role;
