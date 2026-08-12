begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'Platform/billing assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'billing-owner-a@example.invalid',
    '{"display_name":"Billing Owner A"}'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'billing-viewer-b@example.invalid',
    '{"display_name":"Billing Viewer B"}'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'billing-owner-b@example.invalid',
    '{"display_name":"Billing Owner B"}'
  );

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'Billing Tenant A',
    'billing-tenant-a',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Billing Tenant B',
    'billing-tenant-b',
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

insert into public.workflows (tenant_id, created_by, name)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Free workflow one'
);

select tests.assert_true(
  (select count(*) from public.billing_plans) = 5,
  'all public billing plans must exist'
);

select tests.assert_true(
  (
    select count(*)
    from public.tenant_subscriptions
    where plan_code = 'free'
  ) = 1,
  'new tenants must receive free subscriptions before an explicit upgrade'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select tests.assert_true(
  (select count(*) from public.tenant_subscriptions) = 1,
  'a tenant owner must only read their own subscription'
);

select tests.assert_true(
  public.is_platform_admin() is false,
  'a normal tenant owner must not be a platform administrator'
);

do $$
begin
  begin
    perform count(*) from public.platform_admins;
    raise exception 'authenticated platform_admins read unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

insert into public.workflows (tenant_id, created_by, name)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Free workflow two'
  );

do $$
begin
  begin
    insert into public.workflows (tenant_id, created_by, name)
    values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'Free workflow three'
    );
    raise exception 'free workflow limit unexpectedly allowed a third workflow';
  exception
    when check_violation then
      null;
  end;
end;
$$;

reset role;
set local role service_role;

insert into public.devices (tenant_id, paired_by, name, status, paired_at)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Free device one',
  'online',
  now()
);

do $$
begin
  begin
    insert into public.devices (tenant_id, paired_by, name, status, paired_at)
    values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'Free device two',
      'online',
      now()
    );
    raise exception 'free device limit unexpectedly allowed a second active device';
  exception
    when check_violation then
      null;
  end;
end;
$$;

select tests.assert_true(
  public.revoke_agent_device_v2(
    '20000000-0000-0000-0000-000000000001',
    (
      select id
      from public.devices
      where tenant_id = '20000000-0000-0000-0000-000000000001'
        and name = 'Free device one'
    ),
    '10000000-0000-0000-0000-000000000001',
    now()
  ),
  'an ordinary Free tenant must be able to explicitly revoke its active device'
);

insert into public.devices (tenant_id, paired_by, name, status, paired_at)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Free replacement device',
  'online',
  now()
);

select tests.assert_true(
  (
    select count(*)
    from public.devices
    where tenant_id = '20000000-0000-0000-0000-000000000001'
      and status <> 'revoked'
  ) = 1
  and exists (
    select 1
    from public.devices
    where tenant_id = '20000000-0000-0000-0000-000000000001'
      and name = 'Free replacement device'
      and status = 'online'
  ),
  'revoking the old device must release the Free device quota for one replacement'
);

do $$
begin
  begin
    insert into public.memberships (tenant_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      'viewer'
    );
    raise exception 'free member limit unexpectedly allowed a second member';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into public.workflow_versions (
  tenant_id,
  workflow_id,
  version,
  schema_version,
  definition,
  created_by
)
select
  '20000000-0000-0000-0000-000000000001',
  id,
  1,
  1,
  '{}',
  '10000000-0000-0000-0000-000000000001'
from public.workflows
where name = 'Free workflow one';

insert into public.workflow_runs (
  tenant_id,
  workflow_id,
  workflow_version_id,
  triggered_by,
  status,
  idempotency_key
)
select
  version.tenant_id,
  version.workflow_id,
  version.id,
  '10000000-0000-0000-0000-000000000001',
  'pending',
  'free-limit-run-' || run_sequence.run_number
from public.workflow_versions version
cross join generate_series(1, 50) as run_sequence(run_number)
where version.tenant_id = '20000000-0000-0000-0000-000000000001';

do $$
declare
  target_version public.workflow_versions;
begin
  select * into target_version
  from public.workflow_versions
  where tenant_id = '20000000-0000-0000-0000-000000000001';

  begin
    insert into public.workflow_runs (
      tenant_id,
      workflow_id,
      workflow_version_id,
      triggered_by,
      status,
      idempotency_key
    )
    values (
      target_version.tenant_id,
      target_version.workflow_id,
      target_version.id,
      '10000000-0000-0000-0000-000000000001',
      'pending',
      'free-limit-run-51'
    );
    raise exception 'free monthly run limit unexpectedly allowed run 51';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into public.platform_admins (
  user_id,
  handle,
  role,
  active,
  grant_reason
)
values (
  '10000000-0000-0000-0000-000000000003',
  'test-support-admin',
  'support',
  true,
  'Database role boundary test bootstrap'
);

do $$
begin
  begin
    perform public.platform_admin_change_tenant_plan(
      '10000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000001',
      'pro'
    );
    raise exception 'support administrator unexpectedly changed a subscription plan';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

insert into public.platform_admins (
  user_id,
  handle,
  role,
  active,
  grant_reason
)
values (
  '10000000-0000-0000-0000-000000000001',
  'test-super-admin',
  'super_admin',
  true,
  'Database authorization test bootstrap'
);

insert into public.workflows (tenant_id, created_by, name)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Platform administrator acceptance workflow'
);

do $$
declare
  target_version public.workflow_versions;
begin
  select * into target_version
  from public.workflow_versions
  where tenant_id = '20000000-0000-0000-0000-000000000001'
  order by created_at
  limit 1;

  insert into public.workflow_runs (
    tenant_id,
    workflow_id,
    workflow_version_id,
    triggered_by,
    status,
    idempotency_key
  )
  values (
    target_version.tenant_id,
    target_version.workflow_id,
    target_version.id,
    '10000000-0000-0000-0000-000000000001',
    'pending',
    'platform-admin-limit-override-run'
  );
end;
$$;

select tests.assert_true(
  (
    select count(*)
    from public.workflows
    where tenant_id = '20000000-0000-0000-0000-000000000001'
      and status <> 'archived'
  ) = 3,
  'an active platform administrator must be able to create an auditable acceptance workflow after the Tenant limit'
);

select tests.assert_true(
  (
    select count(*)
    from public.workflow_runs
    where tenant_id = '20000000-0000-0000-0000-000000000001'
  ) = 51,
  'an active platform administrator must be able to create an auditable acceptance Run after the monthly limit'
);

select public.platform_admin_change_tenant_plan(
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'pro'
);

do $$
begin
  if (
    select count(*)
    from public.platform_admin_audit_logs
    where action = 'tenant.subscription.plan_changed'
      and resource_id = '20000000-0000-0000-0000-000000000001'
      and metadata @> '{"fromPlanCode":"free","toPlanCode":"pro"}'
  ) <> 1 then
    raise exception 'an administrator plan change must atomically create an audit event';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select tests.assert_true(
  public.is_platform_admin(),
  'an active service-granted platform administrator must be recognized'
);

reset role;
rollback;
