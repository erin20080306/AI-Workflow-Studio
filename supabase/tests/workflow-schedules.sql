begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'Workflow schedule assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

insert into auth.users (id, email)
values
  ('d1000000-0000-4000-8000-000000000001', 'schedule-owner-a@example.invalid'),
  ('d1000000-0000-4000-8000-000000000002', 'schedule-owner-b@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    'd2000000-0000-4000-8000-000000000001',
    'Schedule Tenant A',
    'schedule-tenant-a',
    'd1000000-0000-4000-8000-000000000001'
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'Schedule Tenant B',
    'schedule-tenant-b',
    'd1000000-0000-4000-8000-000000000002'
  );

insert into public.memberships (tenant_id, user_id, role)
values
  (
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'owner'
  );

insert into public.devices (id, tenant_id, paired_by, name, status, paired_at)
values
  (
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'Schedule Device A',
    'online',
    now()
  ),
  (
    'd3000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'Schedule Device B',
    'online',
    now()
  );

insert into public.workflows (
  id,
  tenant_id,
  created_by,
  name,
  status,
  execution_target
)
values
  (
    'd4000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'Schedule Workflow A',
    'active',
    '{"type":"desktop","deviceId":"d3000000-0000-4000-8000-000000000001"}'
  ),
  (
    'd4000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'Schedule Workflow B',
    'active',
    '{"type":"desktop","deviceId":"d3000000-0000-4000-8000-000000000002"}'
  );

insert into public.workflow_versions (
  id,
  tenant_id,
  workflow_id,
  version,
  schema_version,
  definition,
  validation_summary,
  created_by
)
values
  (
    'd5000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    1,
    1,
    '{"schemaVersion":1}',
    '{"success":true}',
    'd1000000-0000-4000-8000-000000000001'
  ),
  (
    'd5000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000002',
    1,
    1,
    '{"schemaVersion":1}',
    '{"success":true}',
    'd1000000-0000-4000-8000-000000000002'
  );

update public.workflows
set active_version_id = case
  when id = 'd4000000-0000-4000-8000-000000000001'
    then 'd5000000-0000-4000-8000-000000000001'::uuid
  else 'd5000000-0000-4000-8000-000000000002'::uuid
end;

set local role service_role;

insert into public.workflow_schedules (
  id,
  tenant_id,
  workflow_id,
  workflow_version_id,
  device_id,
  created_by,
  rule,
  cron_expression,
  timezone,
  next_run_at
)
values (
  'd6000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  '{"cadence":"weekdays","time":"09:00"}',
  '0 9 * * 1-5',
  'Asia/Taipei',
  now()
);

select tests.assert_true(
  public.claim_workflow_schedule_fire(
    'd2000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    now(),
    'schedule:d6000000:2026-07-27T09:00'
  ),
  'the first due occurrence must be claimed'
);

select tests.assert_true(
  not public.claim_workflow_schedule_fire(
    'd2000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    now(),
    'schedule:d6000000:2026-07-27T09:00'
  ),
  'a duplicate idempotency key must not be claimed twice'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);

select tests.assert_true(
  (select count(*) from public.workflow_schedules) = 1,
  'a member must only see schedules from their tenant'
);
select tests.assert_true(
  not has_table_privilege('authenticated', 'public.workflow_schedules', 'insert')
  and not has_table_privilege('authenticated', 'public.workflow_schedules', 'update')
  and not has_table_privilege('authenticated', 'public.workflow_schedules', 'delete'),
  'schedule mutation must remain behind authenticated server routes'
);
select tests.assert_true(
  not has_table_privilege('authenticated', 'public.workflow_schedule_fires', 'select')
  and not has_function_privilege(
    'authenticated',
    'public.claim_workflow_schedule_fire(uuid,uuid,timestamp with time zone,text)',
    'execute'
  ),
  'schedule fire claims must remain service-role-only'
);

reset role;
rollback;
