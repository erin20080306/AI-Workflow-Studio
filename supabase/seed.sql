-- Development-only seed. It intentionally uses the first local Auth user and
-- does nothing when no user has signed up yet.

do $$
declare
  seed_user_id uuid;
  seed_tenant_id constant uuid := '00000000-0000-0000-0000-000000001000';
begin
  select id into seed_user_id
  from auth.users
  order by created_at
  limit 1;

  if seed_user_id is null then
    raise notice 'Development seed skipped: create an Auth user first.';
    return;
  end if;

  insert into public.tenants (id, name, slug, owner_user_id)
  values (seed_tenant_id, 'Development Workspace', 'development-workspace', seed_user_id)
  on conflict (id) do nothing;

  insert into public.memberships (tenant_id, user_id, role)
  values (seed_tenant_id, seed_user_id, 'owner')
  on conflict (tenant_id, user_id) do update set role = excluded.role;

  insert into public.devices (
    id,
    tenant_id,
    paired_by,
    name,
    status,
    agent_version,
    paired_at,
    last_seen_at
  )
  values (
    '00000000-0000-0000-0000-000000002000',
    seed_tenant_id,
    seed_user_id,
    'Mock Desktop Agent',
    'online',
    '0.1.0-mock',
    now(),
    now()
  )
  on conflict (id) do update
    set last_seen_at = excluded.last_seen_at,
        status = excluded.status;

  insert into public.workflows (
    id,
    tenant_id,
    created_by,
    name,
    description,
    status,
    execution_target
  )
  values (
    '00000000-0000-0000-0000-000000003000',
    seed_tenant_id,
    seed_user_id,
    'Mock Excel consolidation',
    'Development-only workflow shell used before the workflow DSL phase.',
    'draft',
    '{"type":"desktop","deviceId":"00000000-0000-0000-0000-000000002000"}'::jsonb
  )
  on conflict (id) do nothing;
end;
$$;
