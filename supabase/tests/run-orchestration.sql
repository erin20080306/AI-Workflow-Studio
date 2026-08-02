begin;

insert into auth.users (id, email)
values ('91000000-0000-4000-8000-000000000001', 'run-owner@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values (
  '92000000-0000-4000-8000-000000000001',
  'Run Tenant',
  'run-tenant',
  '91000000-0000-4000-8000-000000000001'
);

insert into public.memberships (tenant_id, user_id, role)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.workflows (id, tenant_id, created_by, name, status)
values (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Run workflow',
  'active'
);

insert into public.workflow_versions (
  id,
  tenant_id,
  workflow_id,
  version,
  schema_version,
  definition,
  created_by
)
values (
  '94000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  1,
  1,
  '{}',
  '91000000-0000-4000-8000-000000000001'
);

insert into public.workflow_runs (
  id,
  tenant_id,
  workflow_id,
  workflow_version_id,
  triggered_by,
  status,
  idempotency_key
)
values (
  '95000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'pending',
  'run-orchestration-test'
);

do $$
begin
  if has_table_privilege('authenticated', 'public.workflow_runs', 'update') then
    raise exception 'authenticated clients must not transition runs directly';
  end if;
  if has_table_privilege('authenticated', 'public.notifications', 'insert') then
    raise exception 'authenticated clients must not create notifications';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.transition_workflow_run(uuid,uuid,public.run_status,public.run_status,uuid,uuid,text,text)',
    'execute'
  ) then
    raise exception 'authenticated clients must not call run transition function';
  end if;
end;
$$;

set local role service_role;

select public.transition_workflow_run(
  '92000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  'pending',
  'queued',
  '91000000-0000-4000-8000-000000000001'
);
select public.transition_workflow_run(
  '92000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  'queued',
  'running',
  null,
  null
);
select public.transition_workflow_run(
  '92000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  'running',
  'succeeded',
  '91000000-0000-4000-8000-000000000001'
);

do $$
begin
  if not exists (
    select 1
    from public.workflow_runs
    where id = '95000000-0000-4000-8000-000000000001'
      and status = 'succeeded'
      and attempt = 1
      and started_at is not null
      and completed_at is not null
  ) then
    raise exception 'run transitions did not persist expected terminal state';
  end if;
  if (
    select count(*)
    from public.audit_logs
    where correlation_id = '95000000-0000-4000-8000-000000000001'
  ) <> 3 then
    raise exception 'every run transition must create an audit entry';
  end if;
  if not exists (
    select 1
    from public.notifications
    where resource_id = '95000000-0000-4000-8000-000000000001'
      and kind = 'success'
  ) then
    raise exception 'terminal success must create a notification';
  end if;
  begin
    perform public.transition_workflow_run(
      '92000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000001',
      'running',
      'succeeded',
      null,
      null
    );
    raise exception 'stale run transition unexpectedly succeeded';
  exception
    when sqlstate 'PT409' then null;
  end;
  begin
    perform public.transition_workflow_run(
      '92000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000001',
      'succeeded',
      'running',
      null,
      null
    );
    raise exception 'invalid terminal transition unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

reset role;
rollback;
