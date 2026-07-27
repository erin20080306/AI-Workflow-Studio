begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'AI tool/artifact assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

insert into auth.users (id, email)
values
  ('b1000000-0000-4000-8000-000000000001', 'resource-owner-a@example.invalid'),
  ('b1000000-0000-4000-8000-000000000002', 'resource-owner-b@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    'b2000000-0000-4000-8000-000000000001',
    'Resource Tenant A',
    'resource-tenant-a',
    'b1000000-0000-4000-8000-000000000001'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'Resource Tenant B',
    'resource-tenant-b',
    'b1000000-0000-4000-8000-000000000002'
  );

insert into public.memberships (tenant_id, user_id, role)
values
  (
    'b2000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
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
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'Resource workspace A',
    'ask',
    'mock',
    'mock-chat-v1'
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'Resource workspace B',
    'ask',
    'mock',
    'mock-chat-v1'
  );

insert into public.ai_messages (
  id,
  tenant_id,
  conversation_id,
  created_by,
  role,
  body
)
values
  (
    'b4000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'user',
    'Summarize the source'
  ),
  (
    'b4000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'user',
    'Tenant B message'
  );

insert into public.ai_attachments (
  id,
  tenant_id,
  conversation_id,
  uploaded_by,
  filename,
  mime_type,
  byte_size,
  sha256,
  content
)
values
  (
    'b5000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'orders.csv',
    'text/csv',
    octet_length('Order ID,Amount'),
    repeat('a', 64),
    'Order ID,Amount'
  ),
  (
    'b5000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'tenant-b.txt',
    'text/plain',
    octet_length('Tenant B private source'),
    repeat('c', 64),
    'Tenant B private source'
  );

insert into public.ai_message_sources (
  tenant_id,
  conversation_id,
  message_id,
  attachment_id,
  citation_label
)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'S1'
);

insert into public.ai_tool_results (
  tenant_id,
  conversation_id,
  message_id,
  created_by,
  tool_name,
  tool_version,
  status,
  input_summary,
  output_summary
)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'source.prepare_context',
  1,
  'succeeded',
  '{"attachmentCount": 1}',
  '{"sourceCount": 1}'
);

insert into public.ai_artifacts (
  id,
  tenant_id,
  conversation_id,
  message_id,
  created_by,
  title,
  filename,
  byte_size,
  sha256,
  content
)
values (
  'b6000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Source summary',
  'source-summary.md',
  octet_length('# Source summary'),
  repeat('b', 64),
  '# Source summary'
);

insert into public.ai_artifact_sources (
  tenant_id,
  conversation_id,
  artifact_id,
  attachment_id
)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001'
);

select tests.assert_true(
  (select count(*) from public.ai_attachments) = 2
  and (select count(*) from public.ai_message_sources) = 1
  and (select count(*) from public.ai_tool_results) = 1
  and (select count(*) from public.ai_artifacts) = 1
  and (select count(*) from public.ai_artifact_sources) = 1,
  'service role must create the bounded resource graph'
);

do $$
begin
  begin
    insert into public.ai_message_sources (
      tenant_id,
      conversation_id,
      message_id,
      attachment_id,
      citation_label
    )
    values (
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000001',
      'b5000000-0000-4000-8000-000000000002',
      'S2'
    );
    raise exception 'cross-tenant source link unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000001',
  true
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.ai_attachments', 'select')
  and not has_table_privilege('authenticated', 'public.ai_message_sources', 'select')
  and not has_table_privilege('authenticated', 'public.ai_tool_results', 'select')
  and not has_table_privilege('authenticated', 'public.ai_artifacts', 'select')
  and not has_table_privilege('authenticated', 'public.ai_artifact_sources', 'select'),
  'raw resources and tool results must remain server-only'
);

reset role;
rollback;
