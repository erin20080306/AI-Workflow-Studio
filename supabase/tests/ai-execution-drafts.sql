begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'AI execution draft assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

insert into auth.users (id, email)
values
  ('c1000000-0000-4000-8000-000000000001', 'draft-owner-a@example.invalid'),
  ('c1000000-0000-4000-8000-000000000002', 'draft-owner-b@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    'c2000000-0000-4000-8000-000000000001',
    'Draft Tenant A',
    'draft-tenant-a',
    'c1000000-0000-4000-8000-000000000001'
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    'Draft Tenant B',
    'draft-tenant-b',
    'c1000000-0000-4000-8000-000000000002'
  );

insert into public.memberships (tenant_id, user_id, role)
values
  (
    'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    'owner'
  );

set local role service_role;

insert into public.ai_conversations (
  id,
  tenant_id,
  created_by,
  title,
  mode,
  selected_provider,
  selected_model
)
values
  (
    'c3000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'Reviewed Plan A',
    'plan',
    'mock',
    'mock-planner-v1'
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    'Reviewed Plan B',
    'plan',
    'mock',
    'mock-planner-v1'
  );

insert into public.ai_messages (
  id,
  tenant_id,
  conversation_id,
  created_by,
  role,
  body,
  provider,
  model,
  metadata
)
values
  (
    'c4000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'assistant',
    'Validated Plan A',
    'mock',
    'mock-planner-v1',
    '{"plan": {"validated": true}}'
  ),
  (
    'c4000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    'assistant',
    'Validated Plan B',
    'mock',
    'mock-planner-v1',
    '{"plan": {"validated": true}}'
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
    'c5000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'Reviewed workflow A',
    'draft',
    '{"type": "desktop", "deviceId": "c7000000-0000-4000-8000-000000000001"}'
  ),
  (
    'c5000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    'Reviewed workflow B',
    'draft',
    '{"type": "cloud"}'
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
    'c6000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001',
    1,
    1,
    '{"schemaVersion": 1}',
    '{"success": true}',
    'c1000000-0000-4000-8000-000000000001'
  ),
  (
    'c6000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000002',
    'c5000000-0000-4000-8000-000000000002',
    1,
    1,
    '{"schemaVersion": 1}',
    '{"success": true}',
    'c1000000-0000-4000-8000-000000000002'
  );

insert into public.ai_workflow_drafts (
  id,
  tenant_id,
  conversation_id,
  message_id,
  workflow_id,
  workflow_version_id,
  created_by,
  definition_hash
)
values (
  'c8000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001',
  'c6000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  repeat('a', 64)
);

select tests.assert_true(
  (select count(*) from public.ai_workflow_drafts) = 1,
  'service role must create one reviewed draft link'
);

do $$
begin
  begin
    insert into public.ai_workflow_drafts (
      tenant_id,
      conversation_id,
      message_id,
      workflow_id,
      workflow_version_id,
      created_by,
      definition_hash
    )
    values (
      'c2000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'c4000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000002',
      'c6000000-0000-4000-8000-000000000002',
      'c1000000-0000-4000-8000-000000000001',
      repeat('b', 64)
    );
    raise exception 'cross-tenant draft link unexpectedly succeeded';
  exception
    when foreign_key_violation or unique_violation then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.ai_workflow_drafts', 'select')
  and not has_table_privilege('authenticated', 'public.ai_workflow_drafts', 'insert')
  and not has_table_privilege('authenticated', 'public.ai_workflow_drafts', 'update')
  and not has_table_privilege('authenticated', 'public.ai_workflow_drafts', 'delete'),
  'reviewed draft links must remain behind authenticated server routes'
);

reset role;
rollback;
