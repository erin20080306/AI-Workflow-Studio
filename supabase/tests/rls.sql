begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'RLS assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated;
grant execute on function tests.assert_true(boolean, text) to authenticated;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'owner-a@example.invalid',
    '{"display_name":"Owner A"}'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'viewer-b@example.invalid',
    '{"display_name":"Viewer B"}'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'owner-c@example.invalid',
    '{"display_name":"Owner C"}'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'owner-d@example.invalid',
    '{"display_name":"Owner D"}'
  );

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'Tenant A',
    'tenant-a',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Tenant B',
    'tenant-b',
    '10000000-0000-0000-0000-000000000003'
  );

update public.tenant_subscriptions
set plan_code = 'team'
where tenant_id = '20000000-0000-0000-0000-000000000002';

insert into public.memberships (tenant_id, user_id, role)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'owner'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    'owner'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'viewer'
  );

insert into public.workflows (id, tenant_id, created_by, name, status)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Tenant A workflow',
    'draft'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    'Tenant B workflow',
    'draft'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select tests.assert_true(
  (select count(*) from public.profiles) = 1,
  'a user must only read their own profile'
);
select tests.assert_true(
  (select count(*) from public.tenants) = 1,
  'Tenant A owner must not read Tenant B'
);
select tests.assert_true(
  (select count(*) from public.workflows) = 1,
  'Tenant A owner must not read Tenant B workflows'
);
select tests.assert_true(
  public.current_tenant_role('20000000-0000-0000-0000-000000000001') = 'owner',
  'Tenant A owner role must resolve'
);

do $$
begin
  begin
    update public.memberships
    set role = 'viewer'
    where tenant_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000001';
    raise exception 'tenant owner demotion unexpectedly succeeded';
  exception
    when check_violation then
      null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.workflows (tenant_id, created_by, name)
    values (
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      'Cross-tenant insert'
    );
    raise exception 'cross-tenant workflow insert unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);

select tests.assert_true(
  (select count(*) from public.tenants) = 1,
  'Tenant B viewer must only read Tenant B'
);
select tests.assert_true(
  (select count(*) from public.workflows) = 1,
  'Tenant B viewer must read only Tenant B workflows'
);

do $$
declare
  changed_rows integer;
begin
  update public.workflows
  set name = 'Viewer changed this'
  where id = '30000000-0000-0000-0000-000000000002';

  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then
    raise exception 'viewer workflow update unexpectedly succeeded';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000003',
  true
);

update public.workflows
set name = 'Owner C updated workflow'
where id = '30000000-0000-0000-0000-000000000002';

select tests.assert_true(
  (select name from public.workflows where id = '30000000-0000-0000-0000-000000000002')
    = 'Owner C updated workflow',
  'an owner must be able to update their tenant workflow'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000004',
  true
);

select public.create_tenant('RPC Tenant', 'rpc-tenant');
select tests.assert_true(
  (select count(*) from public.tenants where slug = 'rpc-tenant') = 1,
  'create_tenant must create a visible tenant'
);
select tests.assert_true(
  (
    select role
    from public.memberships
    where tenant_id = (select id from public.tenants where slug = 'rpc-tenant')
      and user_id = auth.uid()
  ) = 'owner',
  'the first tenant member must be owner'
);

reset role;

do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'profiles',
    'tenants',
    'memberships',
    'notifications',
    'devices',
    'device_tokens',
    'device_heartbeats',
    'folder_aliases',
    'connections',
    'connection_operations',
    'ai_provider_settings',
    'workflows',
    'workflow_versions',
    'workflow_runs',
    'workflow_run_steps',
    'workflow_approvals',
    'agent_jobs',
    'agent_job_events',
    'column_mapping_rules',
    'usage_records',
    'audit_logs',
    'billing_plans',
    'tenant_subscriptions',
    'billing_events',
    'platform_admins',
    'platform_admin_audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'required table is missing: %', required_table;
    end if;
  end loop;

  if exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relrowsecurity is false
      and exists (
        select 1
        from information_schema.columns column_definition
        where column_definition.table_schema = namespace.nspname
          and column_definition.table_name = relation.relname
          and column_definition.column_name = 'tenant_id'
      )
  ) then
    raise exception 'one or more tenant tables do not enforce RLS';
  end if;
end;
$$;

rollback;
