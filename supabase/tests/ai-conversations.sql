begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'AI conversation assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'chat-owner-a@example.invalid'),
  ('a1000000-0000-4000-8000-000000000002', 'chat-owner-b@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'Chat Tenant A',
    'chat-tenant-a',
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'Chat Tenant B',
    'chat-tenant-b',
    'a1000000-0000-4000-8000-000000000002'
  );

insert into public.memberships (tenant_id, user_id, role)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
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
values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  '安全訂單彙整',
  'ask',
  'openai',
  'gpt-5.6-sol'
);

insert into public.ai_messages (
  id,
  tenant_id,
  conversation_id,
  created_by,
  role,
  body
)
values (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'user',
  '請說明安全做法'
);

insert into public.ai_messages (
  id,
  tenant_id,
  conversation_id,
  role,
  body,
  provider,
  model,
  input_units,
  output_units
)
values (
  'a4000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'assistant',
  '先驗證，再審核，最後執行。',
  'openai',
  'gpt-5.6-sol',
  8,
  6
);

select tests.assert_true(
  (
    select last_message_at >= created_at
    from public.ai_conversations
    where id = 'a3000000-0000-4000-8000-000000000001'
  ),
  'message insertion must update conversation recency'
);

do $$
begin
  begin
    insert into public.ai_messages (
      tenant_id,
      conversation_id,
      created_by,
      role,
      body
    )
    values (
      'a2000000-0000-4000-8000-000000000002',
      'a3000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'user',
      '跨 Tenant 訊息'
    );
    raise exception 'cross-tenant conversation message unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

select tests.assert_true(
  (select count(*) from public.ai_conversations) = 1
  and (select count(*) from public.ai_messages) = 2,
  'Tenant A must read its conversation and messages'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.ai_conversations', 'insert')
  and not has_table_privilege('authenticated', 'public.ai_messages', 'insert')
  and not has_table_privilege('authenticated', 'public.usage_records', 'insert'),
  'conversation writes and usage accounting must remain server-only'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);

select tests.assert_true(
  (select count(*) from public.ai_conversations) = 0
  and (select count(*) from public.ai_messages) = 0,
  'Tenant B must not read Tenant A conversations'
);

reset role;
rollback;
