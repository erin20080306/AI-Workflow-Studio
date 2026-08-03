-- Atomically claim reviewed Desktop-to-Cloud continuation steps.
-- The service passes only schema-validated metadata and the exact stored
-- predecessor output; raw local workbook envelopes are never persisted here.

create function public.claim_agent_cloud_step(
  requested_tenant_id uuid,
  requested_run_id uuid,
  requested_attempt integer,
  requested_node_id text,
  requested_node_type text,
  requested_predecessor_node_id text,
  requested_predecessor_node_type text,
  requested_input jsonb,
  requested_input_hash text,
  requested_started_at timestamp with time zone
)
returns setof public.workflow_run_steps
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_attempt < 1
    or char_length(requested_node_id) not between 1 and 120
    or char_length(requested_node_type) not between 1 and 120
    or char_length(requested_predecessor_node_id) not between 1 and 120
    or char_length(requested_predecessor_node_type) not between 1 and 120
    or requested_input_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(requested_input) <> 'object'
    or octet_length(requested_input::text) > 65536
    or requested_started_at is null then
    raise exception using errcode = '22023', message = 'Invalid Agent cloud step claim';
  end if;

  return query
  update public.workflow_run_steps as current_step
  set
    input_summary = jsonb_build_object(
      'agentCloudInputHash', requested_input_hash,
      'nodeType', requested_node_type,
      'predecessorNodeId', requested_predecessor_node_id
    ),
    started_at = coalesce(current_step.started_at, requested_started_at),
    status = 'running',
    updated_at = requested_started_at
  where current_step.tenant_id = requested_tenant_id
    and current_step.workflow_run_id = requested_run_id
    and current_step.attempt = requested_attempt
    and current_step.node_id = requested_node_id
    and current_step.node_type = requested_node_type
    and current_step.status = 'pending'
    and current_step.input_summary = '{}'::jsonb
    and exists (
      select 1
      from public.workflow_runs as workflow_run
      where workflow_run.tenant_id = requested_tenant_id
        and workflow_run.id = requested_run_id
        and workflow_run.status in ('queued', 'running')
        and greatest(1, workflow_run.attempt) = requested_attempt
    )
    and exists (
      select 1
      from public.workflow_run_steps as predecessor_step
      where predecessor_step.tenant_id = requested_tenant_id
        and predecessor_step.workflow_run_id = requested_run_id
        and predecessor_step.attempt = requested_attempt
        and predecessor_step.node_id = requested_predecessor_node_id
        and predecessor_step.node_type = requested_predecessor_node_type
        and predecessor_step.status = 'succeeded'
        and predecessor_step.output_summary = requested_input
    )
  returning current_step.*;
end;
$$;

revoke all on function public.claim_agent_cloud_step(
  uuid,
  uuid,
  integer,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  timestamp with time zone
) from public, anon, authenticated;

grant execute on function public.claim_agent_cloud_step(
  uuid,
  uuid,
  integer,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  timestamp with time zone
) to service_role;
