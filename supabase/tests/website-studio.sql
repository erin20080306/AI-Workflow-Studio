begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'Website Studio assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

insert into auth.users (id, email)
values
  ('e1000000-0000-4000-8000-000000000001', 'website-owner-a@example.invalid'),
  ('e1000000-0000-4000-8000-000000000002', 'website-owner-b@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'Website Tenant A',
    'website-tenant-a',
    'e1000000-0000-4000-8000-000000000001'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'Website Tenant B',
    'website-tenant-b',
    'e1000000-0000-4000-8000-000000000002'
  );

insert into public.memberships (tenant_id, user_id, role)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'owner'
  );

set local role service_role;

insert into public.website_projects (
  id,
  tenant_id,
  created_by,
  name,
  slug,
  brief
)
values
  (
    'e3000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'Tenant A Website',
    'tenant-a-website',
    '{"purpose":"Tenant A private purpose"}'
  ),
  (
    'e3000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'Tenant B Website',
    'tenant-b-website',
    '{"purpose":"Tenant B private purpose"}'
  );

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);

select tests.assert_true(
  (select count(*) from public.website_projects) = 1,
  'a member must only see website projects from their tenant'
);

select tests.assert_true(
  not exists (
    select 1
    from public.website_projects
    where id = 'e3000000-0000-4000-8000-000000000002'
  ),
  'a tenant member must not read another tenant website brief'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_projects', 'insert')
  and not has_table_privilege('authenticated', 'public.website_projects', 'update')
  and not has_table_privilege('authenticated', 'public.website_projects', 'delete'),
  'website mutations must remain behind authenticated server routes'
);

reset role;
set local role service_role;

insert into public.website_projects (
  tenant_id,
  created_by,
  name,
  slug,
  status,
  brief,
  brief_progress,
  brief_completed_at,
  draft_created_at
)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'Validated Draft',
  'validated-draft',
  'draft',
  '{
    "purpose":"Create a qualified lead website.",
    "audience":"Operations teams and small businesses.",
    "pages":[{"title":"Home","slug":"home","goal":"Explain the product value."}],
    "brandDirection":"Professional, calm, and trustworthy.",
    "content":"Product value, features, pricing, and FAQ.",
    "callsToAction":["Start free"]
  }',
  6,
  now(),
  now()
);

select tests.assert_true(
  (
    select status = 'draft' and brief_progress = 6
    from public.website_projects
    where slug = 'validated-draft'
  ),
  'a completed website brief may be stored as a draft'
);

reset role;
rollback;
