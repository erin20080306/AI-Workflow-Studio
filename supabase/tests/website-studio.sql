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
  ('e1000000-0000-4000-8000-000000000002', 'website-owner-b@example.invalid'),
  ('e1000000-0000-4000-8000-000000000003', 'website-member@example.invalid');

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

insert into public.website_content_entries (
  id,
  tenant_id,
  project_id,
  content_key,
  page_slug,
  title,
  body,
  status,
  created_by,
  updated_by
)
values
  (
    'e4000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'latest-news',
    'home',
    'Tenant A managed content',
    'Tenant A private managed website content.',
    'published',
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001'
  ),
  (
    'e4000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'latest-news',
    'home',
    'Tenant B managed content',
    'Tenant B private managed website content.',
    'draft',
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002'
  );

insert into public.website_form_submissions (
  id,
  tenant_id,
  project_id,
  page_slug,
  name,
  email,
  subject,
  message
)
values
  (
    'e5000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'home',
    'Tenant A visitor',
    'tenant-a-visitor@example.invalid',
    'Tenant A private subject',
    'Tenant A private contact message for the site owner.'
  ),
  (
    'e5000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'home',
    'Tenant B visitor',
    'tenant-b-visitor@example.invalid',
    'Tenant B private subject',
    'Tenant B private contact message for the site owner.'
  );

insert into public.website_brief_messages (
  tenant_id,
  project_id,
  role,
  kind,
  step,
  body,
  created_by
)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'user',
    'prompt',
    null,
    'Tenant A private website prompt',
    'e1000000-0000-4000-8000-000000000001'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'assistant',
    'question',
    'audience',
    'Tenant B private follow-up question',
    'e1000000-0000-4000-8000-000000000002'
  );

insert into public.website_specs (
  tenant_id,
  project_id,
  version_number,
  schema_version,
  provider,
  model,
  attempts,
  spec,
  created_by
)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    1,
    1,
    'openai',
    'test-model-a',
    1,
    '{"schemaVersion":1,"name":"Tenant A private spec"}',
    'e1000000-0000-4000-8000-000000000001'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    1,
    1,
    'gemini',
    'test-model-b',
    1,
    '{"schemaVersion":1,"name":"Tenant B private spec"}',
    'e1000000-0000-4000-8000-000000000002'
  );

insert into public.website_specs (
  tenant_id,
  project_id,
  version_number,
  schema_version,
  provider,
  model,
  attempts,
  spec,
  created_by,
  version_name,
  change_summary,
  source,
  parent_version_number
)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  2,
  1,
  'openai',
  'test-model-a',
  1,
  '{"schemaVersion":1,"name":"Tenant A edited spec"}',
  'e1000000-0000-4000-8000-000000000001',
  'Edited homepage',
  'Updated validated copy.',
  'direct',
  1
);

insert into public.website_assets (
  tenant_id,
  project_id,
  spec_asset_id,
  provider,
  model,
  role,
  alt,
  mime_type,
  byte_size,
  width,
  height,
  storage_path,
  prompt_hash,
  created_by
)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'asset-10000000-0000-4000-8000-000000000001',
    'openai',
    'gpt-image-2',
    'hero',
    'Tenant A private hero',
    'image/png',
    1024,
    1536,
    1024,
    'e2000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000001/asset-a.png',
    repeat('a', 64),
    'e1000000-0000-4000-8000-000000000001'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'asset-20000000-0000-4000-8000-000000000002',
    'gemini',
    'gemini-3.1-flash-lite-image',
    'illustration',
    'Tenant B private illustration',
    'image/png',
    2048,
    1024,
    1024,
    'e2000000-0000-4000-8000-000000000002/e3000000-0000-4000-8000-000000000002/asset-b.png',
    repeat('b', 64),
    'e1000000-0000-4000-8000-000000000002'
  );

insert into public.website_specs (
  tenant_id,
  project_id,
  version_number,
  schema_version,
  provider,
  model,
  attempts,
  spec,
  created_by,
  version_name,
  change_summary,
  source,
  parent_version_number
)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  3,
  1,
  'openai',
  'gpt-image-2',
  1,
  '{"schemaVersion":1,"name":"Tenant A spec with private image"}',
  'e1000000-0000-4000-8000-000000000001',
  'Generated hero image',
  'Generated and attached a validated hero image.',
  'asset-generation',
  2
);

select tests.assert_true(
  (
    select
      version_name = 'Edited homepage'
      and source = 'direct'
      and parent_version_number = 1
    from public.website_specs
    where project_id = 'e3000000-0000-4000-8000-000000000001'
      and version_number = 2
  ),
  'website edits must preserve their reversible version metadata'
);

select tests.assert_true(
  exists (
    select 1
    from public.audit_logs
    where resource_id = 'e3000000-0000-4000-8000-000000000001'
      and action = 'website_spec.direct'
      and metadata ->> 'versionName' = 'Edited homepage'
  ),
  'website spec version inserts must create an atomic metadata-only audit event'
);

select tests.assert_true(
  exists (
    select 1
    from public.audit_logs
    where action = 'website_asset.generated'
      and resource_type = 'website_asset'
      and metadata ->> 'model' = 'gpt-image-2'
      and not metadata ? 'storagePath'
      and not metadata ? 'prompt'
  ),
  'generated website assets must create a metadata-only audit event'
);

select tests.assert_true(
  exists (
    select 1
    from public.audit_logs
    where action = 'website_brief.prompt'
      and resource_id = 'e3000000-0000-4000-8000-000000000001'
      and metadata ->> 'kind' = 'prompt'
      and not metadata ? 'body'
  ),
  'website brief conversations must audit metadata without prompt or answer bodies'
);

select tests.assert_true(
  exists (
    select 1
    from storage.buckets
    where id = 'website-assets'
      and public is false
      and file_size_limit = 8000000
      and allowed_mime_types = array['image/png']::text[]
  ),
  'generated website images must use a private bounded PNG-only bucket'
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
  (select count(*) from public.website_specs) = 3,
  'a member must only see website specs from their tenant'
);

select tests.assert_true(
  (select count(*) from public.website_assets) = 1,
  'a member must only see generated website assets from their tenant'
);

select tests.assert_true(
  (select count(*) from public.website_brief_messages) = 1,
  'a member must only see website discovery messages from their tenant'
);

select tests.assert_true(
  (select count(*) from public.website_content_entries) = 1,
  'a member must only see managed website content from their tenant'
);

select tests.assert_true(
  (select count(*) from public.website_form_submissions) = 1,
  'a member must only see website form submissions from their tenant'
);

select tests.assert_true(
  not exists (
    select 1
    from public.website_assets
    where project_id = 'e3000000-0000-4000-8000-000000000002'
  ),
  'a tenant member must not read another tenant generated website asset'
);

select tests.assert_true(
  not exists (
    select 1
    from public.website_specs
    where project_id = 'e3000000-0000-4000-8000-000000000002'
  ),
  'a tenant member must not read another tenant website spec'
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
  not has_table_privilege('authenticated', 'public.website_specs', 'insert')
  and not has_table_privilege('authenticated', 'public.website_specs', 'update')
  and not has_table_privilege('authenticated', 'public.website_specs', 'delete'),
  'website spec mutations must remain behind authenticated server routes'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_projects', 'insert')
  and not has_table_privilege('authenticated', 'public.website_projects', 'update')
  and not has_table_privilege('authenticated', 'public.website_projects', 'delete'),
  'website mutations must remain behind authenticated server routes'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_assets', 'insert')
  and not has_table_privilege('authenticated', 'public.website_assets', 'update')
  and not has_table_privilege('authenticated', 'public.website_assets', 'delete'),
  'website asset mutations must remain behind authenticated server routes'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_brief_messages', 'insert')
  and not has_table_privilege('authenticated', 'public.website_brief_messages', 'update')
  and not has_table_privilege('authenticated', 'public.website_brief_messages', 'delete'),
  'website conversation mutations must remain behind authenticated server routes'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_content_entries', 'insert')
  and not has_table_privilege('authenticated', 'public.website_content_entries', 'update')
  and not has_table_privilege('authenticated', 'public.website_content_entries', 'delete'),
  'managed website content mutations must remain behind authenticated server routes'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_form_submissions', 'insert')
  and not has_table_privilege('authenticated', 'public.website_form_submissions', 'update')
  and not has_table_privilege('authenticated', 'public.website_form_submissions', 'delete'),
  'website form mutations must remain behind validated server routes'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_publications', 'insert')
  and not has_table_privilege('authenticated', 'public.website_publications', 'update')
  and not has_table_privilege('authenticated', 'public.website_publications', 'delete')
  and not has_function_privilege(
    'authenticated',
    'public.publish_website(uuid,uuid,uuid,integer)',
    'execute'
  ),
  'website publishing must require the authenticated server service'
);

select tests.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.publish_website_with_slug(uuid,uuid,uuid,integer,text)',
    'execute'
  ),
  'platform subdomain publishing must require the authenticated server service'
);

reset role;
set local role service_role;

insert into public.website_projects (
  id,
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
  'e3000000-0000-4000-8000-000000000003',
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

insert into public.website_specs (
  tenant_id,
  project_id,
  version_number,
  schema_version,
  provider,
  model,
  attempts,
  spec,
  created_by,
  version_name,
  change_summary,
  source
)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000003',
    1,
    1,
    'mock',
    'mock-planner-v1',
    1,
    '{"schemaVersion":1,"name":"Published v1"}',
    'e1000000-0000-4000-8000-000000000001',
    'Initial release',
    'Initial validated release.',
    'generated'
  ),
  (
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000003',
    2,
    1,
    'mock',
    'mock-planner-v1',
    1,
    '{"schemaVersion":1,"name":"Published v2"}',
    'e1000000-0000-4000-8000-000000000001',
    'Second release',
    'Second validated release.',
    'direct'
  );

select public.publish_website_with_slug(
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000003',
  1,
  'customer-chosen-name'
);

select public.publish_website_with_slug(
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000003',
  2,
  'customer-chosen-name'
);

select tests.assert_true(
  (
    select count(*) = 1
      and max(spec_version) = 2
    from public.website_publications
    where project_id = 'e3000000-0000-4000-8000-000000000003'
      and status = 'active'
  ),
  'publishing a new immutable release must supersede the prior active release'
);

select tests.assert_true(
  (
    select slug = 'customer-chosen-name'
    from public.website_publications
    where project_id = 'e3000000-0000-4000-8000-000000000003'
      and status = 'active'
  ),
  'the customer-selected platform subdomain label must remain stable across releases'
);

select tests.assert_true(
  (
    select count(*) = 1
    from public.website_publications
    where project_id = 'e3000000-0000-4000-8000-000000000003'
      and status = 'superseded'
      and superseded_at is not null
  ),
  'the previous public release must remain auditable as superseded'
);

select tests.assert_true(
  exists (
    select 1
    from public.audit_logs
    where action = 'website_publication.published'
      and correlation_id = 'e3000000-0000-4000-8000-000000000003'
      and metadata ->> 'version' = '2'
  ),
  'approved website publishing must create a metadata-only audit event'
);

insert into public.website_custom_domains (
  id,
  tenant_id,
  project_id,
  hostname,
  status,
  ownership_verified,
  routing_verified,
  dns_records,
  created_by,
  updated_by,
  activated_at
)
values
  (
    'e8000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000003',
    'www.tenant-a-site.example.com',
    'active',
    true,
    true,
    '[{"name":"www.tenant-a-site.example.com","purpose":"routing","type":"CNAME","value":"cname.vercel-dns-0.com"}]',
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    now()
  ),
  (
    'e8000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'www.tenant-b-site.example.com',
    'pending_dns',
    true,
    false,
    '[{"name":"www.tenant-b-site.example.com","purpose":"routing","type":"CNAME","value":"cname.vercel-dns-0.com"}]',
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    null
  );

select tests.assert_true(
  (
    select count(*) = 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'website_custom_domains'
      and indexname = 'website_custom_domains_hostname_idx'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ),
  'customer website hostnames must be globally unique'
);

insert into public.website_github_connections (
  id,
  tenant_id,
  installation_id,
  account_login,
  account_type,
  connected_by
)
values (
  'e9000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  987654,
  'tenant-a-demo',
  'Organization',
  'e1000000-0000-4000-8000-000000000001'
);

insert into public.website_github_publications (
  tenant_id,
  project_id,
  spec_version,
  connection_id,
  repository_id,
  repository_full_name,
  branch,
  idempotency_key,
  status,
  source_sha256,
  tree_sha,
  commit_sha,
  started_by,
  completed_at
)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000003',
  2,
  'e9000000-0000-4000-8000-000000000001',
  123456,
  'tenant-a-demo/generated-site',
  'ai-workflow-studio/validated-draft',
  'e9000000-0000-4000-8000-000000000002',
  'succeeded',
  repeat('a', 64),
  repeat('b', 40),
  repeat('c', 40),
  'e1000000-0000-4000-8000-000000000001',
  now()
);

select tests.assert_true(
  (
    select count(*) = 1
      and max(status) = 'succeeded'
    from public.website_github_publications
    where tenant_id = 'e2000000-0000-4000-8000-000000000001'
  ),
  'an exact website version GitHub push must remain metadata-auditable'
);

select public.replace_website_site_access(
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  true,
  '[{"pageSlug":"member-portal","requiredRole":"member"}]',
  'website-owner-a@example.invalid',
  'Website Owner A'
);

select public.replace_website_site_access(
  'e2000000-0000-4000-8000-000000000002',
  'e3000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000002',
  false,
  '[{"pageSlug":"staff-portal","requiredRole":"staff"}]',
  'website-owner-b@example.invalid',
  'Website Owner B'
);

insert into public.website_site_memberships (
  tenant_id,
  project_id,
  user_id,
  email,
  display_name,
  role,
  status,
  created_by,
  updated_by
)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000003',
  'website-member@example.invalid',
  'Website member',
  'member',
  'active',
  'e1000000-0000-4000-8000-000000000003',
  'e1000000-0000-4000-8000-000000000003'
);

select tests.assert_true(
  (
    select registration_enabled
    from public.website_site_access_configs
    where project_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  'an owner-reviewed site may explicitly enable public registration'
);

select tests.assert_true(
  (
    select count(*) = 1
      and max(required_role::text) = 'member'
    from public.website_site_page_access
    where project_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  'the reviewed protected-page matrix must persist only allowlisted roles'
);

select tests.assert_true(
  (
    select count(*) = 1
      and max(role::text) = 'manager'
    from public.website_site_memberships
    where project_id = 'e3000000-0000-4000-8000-000000000001'
      and user_id = 'e1000000-0000-4000-8000-000000000001'
  ),
  'the workspace owner must receive a distinct per-site manager membership'
);

select tests.assert_true(
  exists (
    select 1
    from public.audit_logs
    where action = 'website_access.reviewed'
      and correlation_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  'reviewing site access must create an auditable metadata-only event'
);

insert into public.website_data_collections (
  id,
  tenant_id,
  project_id,
  collection_key,
  name,
  fields,
  reviewed_by,
  created_by,
  updated_by
)
values
  (
    'e9100000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'bookings',
    'Tenant A bookings',
    '[
      {
        "key":"name",
        "label":"Name",
        "options":[],
        "referenceCollectionKey":null,
        "required":true,
        "type":"text"
      },
      {
        "key":"seats",
        "label":"Seats",
        "options":[],
        "referenceCollectionKey":null,
        "required":true,
        "type":"number"
      }
    ]',
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001'
  ),
  (
    'e9100000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'bookings',
    'Tenant B bookings',
    '[
      {
        "key":"name",
        "label":"Name",
        "options":[],
        "referenceCollectionKey":null,
        "required":true,
        "type":"text"
      }
    ]',
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002'
  );

insert into public.website_data_forms (
  id,
  tenant_id,
  project_id,
  collection_id,
  form_key,
  page_slug,
  title,
  field_keys,
  submit_label,
  success_message,
  workflow_trigger,
  active,
  reviewed_by,
  created_by,
  updated_by
)
values
  (
    'e9110000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e9100000-0000-4000-8000-000000000001',
    'booking-form',
    'home',
    'Tenant A booking form',
    '["name","seats"]',
    'Submit',
    'Booking received.',
    'audit-record-created',
    true,
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001'
  ),
  (
    'e9110000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'e9100000-0000-4000-8000-000000000002',
    'booking-form',
    'home',
    'Tenant B booking form',
    '["name"]',
    'Submit',
    'Booking received.',
    'none',
    true,
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002'
  );

select public.execute_website_data_action(
  target_tenant_id => 'e2000000-0000-4000-8000-000000000001',
  target_project_id => 'e3000000-0000-4000-8000-000000000001',
  target_collection_key => 'bookings',
  action_name => 'create-record',
  action_idempotency_key => 'e9200000-0000-4000-8000-000000000001',
  action_values => '{"name":"Tenant A visitor","seats":2}',
  workspace_actor_user_id => 'e1000000-0000-4000-8000-000000000001',
  action_workflow_trigger => 'audit-record-created'
);

select public.execute_website_data_action(
  target_tenant_id => 'e2000000-0000-4000-8000-000000000001',
  target_project_id => 'e3000000-0000-4000-8000-000000000001',
  target_collection_key => 'bookings',
  action_name => 'create-record',
  action_idempotency_key => 'e9200000-0000-4000-8000-000000000001',
  action_values => '{"name":"Tenant A visitor","seats":2}',
  workspace_actor_user_id => 'e1000000-0000-4000-8000-000000000001',
  action_workflow_trigger => 'audit-record-created'
);

select tests.assert_true(
  (
    select count(*) = 1
    from public.website_data_records
    where project_id = 'e3000000-0000-4000-8000-000000000001'
      and collection_id = 'e9100000-0000-4000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.website_data_action_runs
    where project_id = 'e3000000-0000-4000-8000-000000000001'
      and idempotency_key = 'e9200000-0000-4000-8000-000000000001'
  ),
  'an idempotent website data action must write one record and one action run'
);

select public.execute_website_data_action(
  target_tenant_id => 'e2000000-0000-4000-8000-000000000001',
  target_project_id => 'e3000000-0000-4000-8000-000000000001',
  target_collection_key => 'bookings',
  action_name => 'update-record',
  action_idempotency_key => 'e9200000-0000-4000-8000-000000000002',
  action_values => '{"name":"Tenant A visitor","seats":4}',
  workspace_actor_user_id => 'e1000000-0000-4000-8000-000000000001',
  target_record_id => (
    select id
    from public.website_data_records
    where project_id = 'e3000000-0000-4000-8000-000000000001'
    limit 1
  ),
  target_expected_version => 1
);

select tests.assert_true(
  (
    select version = 2 and values ->> 'seats' = '4'
    from public.website_data_records
    where project_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  'a safe update must use optimistic versioning and persist validated values'
);

do $$
declare
  denied boolean := false;
begin
  begin
    perform public.execute_website_data_action(
      target_tenant_id => 'e2000000-0000-4000-8000-000000000001',
      target_project_id => 'e3000000-0000-4000-8000-000000000001',
      target_collection_key => 'bookings',
      action_name => 'delete-record',
      action_idempotency_key => 'e9200000-0000-4000-8000-000000000003',
      action_values => '{}',
      workspace_actor_user_id => 'e1000000-0000-4000-8000-000000000001',
      target_record_id => (
        select id
        from public.website_data_records
        where project_id = 'e3000000-0000-4000-8000-000000000001'
        limit 1
      ),
      target_expected_version => 2,
      deletion_confirmed => false
    );
  exception
    when others then
      if position('Deletion requires explicit confirmation' in sqlerrm) > 0 then
        denied := true;
      else
        raise;
      end if;
  end;
  if not denied then
    raise exception 'Website data delete without explicit confirmation was not denied';
  end if;
end;
$$;

select public.execute_website_data_action(
  target_tenant_id => 'e2000000-0000-4000-8000-000000000002',
  target_project_id => 'e3000000-0000-4000-8000-000000000002',
  target_collection_key => 'bookings',
  action_name => 'create-record',
  action_idempotency_key => 'e9200000-0000-4000-8000-000000000004',
  action_values => '{"name":"Tenant B visitor"}',
  workspace_actor_user_id => 'e1000000-0000-4000-8000-000000000002'
);

select tests.assert_true(
  exists (
    select 1
    from public.audit_logs
    where action = 'website_data.record_created'
      and correlation_id = 'e3000000-0000-4000-8000-000000000001'
      and metadata ->> 'collectionKey' = 'bookings'
      and not metadata ? 'values'
  ),
  'safe website data actions must audit metadata without storing record values'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);

select tests.assert_true(
  (
    select count(*) = 1
      and bool_and(tenant_id = 'e2000000-0000-4000-8000-000000000001')
    from public.website_custom_domains
  ),
  'a member must only read custom domains from their tenant'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_custom_domains', 'insert')
  and not has_table_privilege('authenticated', 'public.website_custom_domains', 'update')
  and not has_table_privilege('authenticated', 'public.website_custom_domains', 'delete'),
  'customer domain mutations must remain behind authenticated server routes'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_github_connections', 'select')
  and not has_table_privilege('authenticated', 'public.website_github_connections', 'insert')
  and not has_table_privilege('authenticated', 'public.website_github_publications', 'select')
  and not has_table_privilege('authenticated', 'public.website_github_publications', 'insert'),
  'GitHub installation and push metadata must remain server-only'
);

select tests.assert_true(
  (
    select count(*) = 1
      and bool_and(tenant_id = 'e2000000-0000-4000-8000-000000000001')
    from public.website_site_access_configs
  ),
  'a workspace member must only read site access configuration from their tenant'
);

select tests.assert_true(
  (
    select count(*) = 2
      and bool_and(tenant_id = 'e2000000-0000-4000-8000-000000000001')
    from public.website_site_memberships
  ),
  'workspace membership and site membership must remain separate tenant-scoped records'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_site_access_configs', 'insert')
  and not has_table_privilege('authenticated', 'public.website_site_page_access', 'insert')
  and not has_table_privilege('authenticated', 'public.website_site_memberships', 'insert')
  and not has_function_privilege(
    'authenticated',
    'public.replace_website_site_access(uuid,uuid,uuid,boolean,jsonb,text,text)',
    'execute'
  ),
  'site role and protected-page mutations must remain behind authenticated server routes'
);

select tests.assert_true(
  (
    select count(*) = 1
      and bool_and(tenant_id = 'e2000000-0000-4000-8000-000000000001')
    from public.website_data_collections
  )
  and (
    select count(*) = 1
      and bool_and(tenant_id = 'e2000000-0000-4000-8000-000000000001')
    from public.website_data_forms
  )
  and (
    select count(*) = 1
      and bool_and(tenant_id = 'e2000000-0000-4000-8000-000000000001')
    from public.website_data_records
  )
  and (
    select count(*) = 2
      and bool_and(tenant_id = 'e2000000-0000-4000-8000-000000000001')
    from public.website_data_action_runs
  ),
  'workspace members must only read website data definitions and actions from their tenant'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.website_data_collections', 'insert')
  and not has_table_privilege('authenticated', 'public.website_data_collections', 'update')
  and not has_table_privilege('authenticated', 'public.website_data_collections', 'delete')
  and not has_table_privilege('authenticated', 'public.website_data_forms', 'insert')
  and not has_table_privilege('authenticated', 'public.website_data_records', 'insert')
  and not has_table_privilege('authenticated', 'public.website_data_action_runs', 'insert')
  and not has_function_privilege(
    'authenticated',
    'public.execute_website_data_action(uuid,uuid,text,public.website_data_action_type,uuid,jsonb,uuid,uuid,uuid,integer,boolean,public.website_data_workflow_trigger)',
    'execute'
  ),
  'website data mutations and safe action RPCs must remain server-only'
);

select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000003',
  true
);

select tests.assert_true(
  (
    select count(*) = 0
    from public.website_site_memberships
  ),
  'a site member must not receive workspace-level access to site member administration'
);

select tests.assert_true(
  (select count(*) from public.website_data_collections) = 0
  and (select count(*) from public.website_data_forms) = 0
  and (select count(*) from public.website_data_records) = 0
  and (select count(*) from public.website_data_action_runs) = 0,
  'site-only members must not receive workspace administration access to website data'
);

reset role;
rollback;
