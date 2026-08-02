begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'Google connection assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

insert into auth.users (id, email)
values ('81000000-0000-4000-8000-000000000001', 'google-owner@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values (
  '82000000-0000-4000-8000-000000000001',
  'Google Tenant',
  'google-tenant',
  '81000000-0000-4000-8000-000000000001'
);

insert into public.memberships (tenant_id, user_id, role)
values (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.connections (
  id,
  tenant_id,
  created_by,
  provider,
  name,
  encrypted_access_token,
  encrypted_refresh_token,
  token_expires_at
)
values (
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'google_sheets',
  'Google Sheets',
  decode(repeat('aa', 32), 'hex'),
  decode(repeat('bb', 32), 'hex'),
  now() + interval '1 hour'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.connections', 'select'),
  'authenticated clients must not select server-only connection token rows'
);
select tests.assert_true(
  not has_table_privilege('authenticated', 'public.connection_operations', 'select')
  and not has_table_privilege('authenticated', 'public.connection_operations', 'insert')
  and not has_table_privilege('authenticated', 'public.connection_operations', 'update'),
  'connection operation idempotency rows must be service-only'
);
select tests.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.claim_connection_operation(uuid,uuid,text,text,bytea)',
    'execute'
  ),
  'authenticated clients must not claim connection operations directly'
);

reset role;
set local role service_role;

select tests.assert_true(
  (
    select operation_status = 'pending' and request_matches
    from public.claim_connection_operation(
      '82000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001',
      'google_sheets.append',
      'run:google:append:1',
      decode(repeat('11', 32), 'hex')
    )
  ),
  'first Google write claim must create a matching pending operation'
);

select tests.assert_true(
  (
    select operation_status = 'pending' and not request_matches
    from public.claim_connection_operation(
      '82000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001',
      'google_sheets.append',
      'run:google:append:1',
      decode(repeat('22', 32), 'hex')
    )
  ),
  'an idempotency key reused with different input must report a conflict'
);

select public.finish_connection_operation(
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'run:google:append:1',
  decode(repeat('11', 32), 'hex'),
  'succeeded',
  '{"updatedRows": 2}'::jsonb,
  null
);

do $$
begin
  begin
    perform public.finish_connection_operation(
      '82000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001',
      'run:google:append:1',
      decode(repeat('11', 32), 'hex'),
      'succeeded',
      '{"updatedRows": 2}'::jsonb,
      null
    );
    raise exception 'completed connection operation unexpectedly finished twice';
  exception
    when sqlstate 'PT409' then null;
  end;
end;
$$;

select tests.assert_true(
  (
    select
      operation_status = 'succeeded'
      and request_matches
      and stored_result = '{"updatedRows": 2}'::jsonb
    from public.claim_connection_operation(
      '82000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001',
      'google_sheets.append',
      'run:google:append:1',
      decode(repeat('11', 32), 'hex')
    )
  ),
  'a completed Google operation must replay its metadata-only result'
);

do $$
begin
  begin
    perform public.claim_connection_operation(
      '82000000-0000-4000-8000-000000000099',
      '83000000-0000-4000-8000-000000000001',
      'google_sheets.update',
      'run:google:update:wrong-tenant',
      decode(repeat('33', 32), 'hex')
    );
    raise exception 'tenant/connection mismatch unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

reset role;
rollback;
