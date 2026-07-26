-- Durable workflow run transitions, notifications, and event idempotency.
-- This migration is immutable after publication.

alter table public.workflow_runs
  add column attempt integer not null default 0 check (attempt >= 0),
  add column max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  add column timeout_at timestamp with time zone,
  add column cancel_requested_at timestamp with time zone;

update public.workflow_runs
set timeout_at = created_at + interval '30 minutes'
where timeout_at is null;

alter table public.workflow_runs
  alter column timeout_at set default (now() + interval '30 minutes'),
  alter column timeout_at set not null;

create index workflow_runs_active_timeout_idx
  on public.workflow_runs (timeout_at)
  where status in ('pending', 'awaiting_approval', 'queued', 'running');

alter table public.agent_job_events
  add column event_id uuid;

create unique index agent_job_events_job_event_idx
  on public.agent_job_events (agent_job_id, event_id)
  where event_id is not null;

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('approval', 'error', 'info', 'success')),
  title text not null check (char_length(title) between 1 and 160),
  message text not null check (char_length(message) between 1 and 500),
  resource_type text not null check (char_length(resource_type) between 1 and 120),
  resource_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  unique (id, tenant_id)
);

create index notifications_tenant_user_created_idx
  on public.notifications (tenant_id, user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notification_member_select
  on public.notifications
  for select
  to authenticated
  using (
    public.is_tenant_member(tenant_id)
    and (user_id is null or user_id = auth.uid())
  );

revoke insert, update, delete on public.workflow_runs from authenticated;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;

create function public.transition_workflow_run(
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
    raise exception using errcode = '40001', message = 'Run status conflict';
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
