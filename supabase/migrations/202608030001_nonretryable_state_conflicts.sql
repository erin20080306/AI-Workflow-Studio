-- Logical compare-and-set conflicts are HTTP conflicts, not serialization failures.
-- Using SQLSTATE 40001 caused infrastructure retries and an unbounded log/rollback loop.

create or replace function public.transition_workflow_run(
  target_tenant_id uuid,
  target_run_id uuid,
  expected_status public.run_status,
  next_status public.run_status,
  actor_user_id uuid default null,
  actor_device_id uuid default null,
  target_error_code text default null,
  target_error_message text default null
)
returns public.workflow_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  transitioned public.workflow_runs;
  now_at timestamp with time zone := now();
begin
  if not (
    (expected_status = 'pending' and next_status in ('awaiting_approval', 'queued', 'cancelled'))
    or (
      expected_status = 'awaiting_approval'
      and next_status in ('queued', 'cancelled', 'timed_out')
    )
    or (expected_status = 'queued' and next_status in ('running', 'cancelled', 'timed_out'))
    or (
      expected_status = 'running'
      and next_status in ('succeeded', 'failed', 'cancelled', 'timed_out')
    )
    or (expected_status in ('failed', 'timed_out') and next_status = 'queued')
  ) then
    raise exception using errcode = '22023', message = 'Invalid run status transition';
  end if;

  update public.workflow_runs
  set
    status = next_status,
    attempt = case
      when next_status = 'queued' and expected_status in ('pending', 'failed', 'timed_out')
        then attempt + 1
      else attempt
    end,
    started_at = case
      when next_status = 'running' then coalesce(started_at, now_at)
      when next_status in ('succeeded', 'failed', 'cancelled', 'timed_out')
        then coalesce(started_at, now_at)
      when expected_status in ('failed', 'timed_out') and next_status = 'queued' then null
      else started_at
    end,
    completed_at = case
      when next_status in ('succeeded', 'failed', 'cancelled', 'timed_out') then now_at
      when next_status = 'queued' then null
      else completed_at
    end,
    cancel_requested_at = case
      when next_status = 'cancelled' then now_at
      else cancel_requested_at
    end,
    error_code = case
      when next_status in ('failed', 'timed_out') then target_error_code
      when next_status = 'queued' then null
      else error_code
    end,
    error_message = case
      when next_status in ('failed', 'timed_out') then target_error_message
      when next_status = 'queued' then null
      else error_message
    end
  where tenant_id = target_tenant_id
    and id = target_run_id
    and status = expected_status
    and (
      next_status <> 'queued'
      or expected_status not in ('failed', 'timed_out')
      or attempt < max_attempts
    )
  returning * into transitioned;

  if transitioned.id is null then
    raise exception using errcode = 'PT409', message = 'Run status conflict';
  end if;

  if next_status = 'cancelled' then
    update public.agent_jobs
    set
      status = 'cancelled',
      leased_until = null,
      completed_at = now_at
    where tenant_id = target_tenant_id
      and workflow_run_id = target_run_id
      and status in ('pending', 'claimed', 'running');
  end if;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    actor_device_id,
    action,
    resource_type,
    resource_id,
    correlation_id,
    metadata
  )
  values (
    target_tenant_id,
    actor_user_id,
    actor_device_id,
    'run.' || next_status::text,
    'workflow_run',
    target_run_id,
    target_run_id,
    jsonb_build_object('from', expected_status, 'to', next_status)
  );

  if next_status in ('awaiting_approval', 'succeeded', 'failed', 'timed_out') then
    insert into public.notifications (
      tenant_id,
      user_id,
      kind,
      title,
      message,
      resource_type,
      resource_id
    )
    values (
      target_tenant_id,
      actor_user_id,
      case
        when next_status = 'awaiting_approval' then 'approval'
        when next_status = 'succeeded' then 'success'
        else 'error'
      end,
      case
        when next_status = 'awaiting_approval' then 'Workflow approval required'
        when next_status = 'succeeded' then 'Workflow run completed'
        when next_status = 'timed_out' then 'Workflow run timed out'
        else 'Workflow run failed'
      end,
      'Open Run details to review the metadata-only execution summary.',
      'workflow_run',
      target_run_id
    );
  end if;

  return transitioned;
end;
$$;

revoke all on function public.transition_workflow_run(
  uuid,
  uuid,
  public.run_status,
  public.run_status,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.transition_workflow_run(
  uuid,
  uuid,
  public.run_status,
  public.run_status,
  uuid,
  uuid,
  text,
  text
) to service_role;

create or replace function public.finish_connection_operation(
  target_tenant_id uuid,
  target_connection_id uuid,
  target_idempotency_key text,
  target_request_hash bytea,
  target_status public.connection_operation_status,
  target_result jsonb default null,
  target_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_status not in ('succeeded', 'ambiguous', 'failed') then
    raise exception using errcode = '22023', message = 'Invalid terminal status';
  end if;
  if target_status = 'succeeded'
    and (target_result is null or jsonb_typeof(target_result) <> 'object') then
    raise exception using errcode = '22023', message = 'Success result is required';
  end if;

  update public.connection_operations
  set
    status = target_status,
    result = case when target_status = 'succeeded' then target_result else null end,
    last_error_code = target_error_code,
    completed_at = case when target_status = 'succeeded' then now() else null end
  where tenant_id = target_tenant_id
    and connection_id = target_connection_id
    and idempotency_key = target_idempotency_key
    and request_hash = target_request_hash
    and status = 'pending';

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'Connection operation state conflict';
  end if;
end;
$$;

revoke all on function public.finish_connection_operation(
  uuid,
  uuid,
  text,
  bytea,
  public.connection_operation_status,
  jsonb,
  text
) from public, anon, authenticated;
grant execute on function public.finish_connection_operation(
  uuid,
  uuid,
  text,
  bytea,
  public.connection_operation_status,
  jsonb,
  text
) to service_role;
