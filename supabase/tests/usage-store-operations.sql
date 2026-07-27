begin;

create schema tests;

create function tests.assert_true(condition boolean, message text)
returns void
language plpgsql
security invoker
as $$
begin
  if condition is distinct from true then
    raise exception 'Usage/Store assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

insert into auth.users (id, email)
values
  ('e1000000-0000-4000-8000-000000000001', 'usage-owner-a@example.invalid'),
  ('e1000000-0000-4000-8000-000000000002', 'usage-owner-b@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'Usage Tenant A',
    'usage-tenant-a',
    'e1000000-0000-4000-8000-000000000001'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'Usage Tenant B',
    'usage-tenant-b',
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

select tests.assert_true(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'billing_plans'
      and column_name = 'monthly_ai_cost_budget_microunits'
  ),
  'billing plans must include bounded AI cost budgets'
);

select tests.assert_true(
  to_regclass('public.usage_budget_reservations') is not null,
  'usage reservations must exist'
);

select tests.assert_true(
  not has_table_privilege('authenticated', 'public.usage_budget_reservations', 'select')
  and not has_function_privilege(
    'authenticated',
    'public.reserve_tenant_usage_budget(uuid,uuid,text,text,bigint)',
    'execute'
  ),
  'browser users must not read or create cost reservations'
);

set local role service_role;

do $$
declare
  second_reservation_id uuid;
  third_reservation_id uuid;
  reservation_id uuid;
  usage_id bigint;
begin
  reservation_id := public.reserve_tenant_usage_budget(
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'openai',
    'chat',
    1000000
  );

  perform tests.assert_true(
    exists (
      select 1
      from public.usage_budget_reservations
      where id = reservation_id
        and status = 'active'
    ),
    'a valid reservation must remain active until release'
  );

  usage_id := public.record_tenant_ai_usage(
    'e1000000-0000-4000-8000-000000000001',
    reservation_id,
    'openai',
    'chat',
    100,
    20,
    500000,
    '{"rateCardVersion":"test"}'
  );
  perform tests.assert_true(
    (
      select cost_microunits = 500000
      from public.usage_records
      where id = usage_id
    ),
    'actual cost must be stored in microunits'
  );

  perform public.release_tenant_usage_reservation(
    'e1000000-0000-4000-8000-000000000001',
    reservation_id
  );
  perform tests.assert_true(
    (
      select status = 'released'
      from public.usage_budget_reservations
      where id = reservation_id
    ),
    'released reservations must stop holding budget'
  );

  begin
    perform public.reserve_tenant_usage_budget(
      'e1000000-0000-4000-8000-000000000002',
      'e2000000-0000-4000-8000-000000000001',
      'openai',
      'chat',
      1
    );
    raise exception 'cross-tenant reservation unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.reserve_tenant_usage_budget(
      'e1000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000001',
      'openai',
      'chat',
      999999999999
    );
    raise exception 'over-budget reservation unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'USAGE_BUDGET_EXCEEDED' then
        raise;
      end if;
  end;

  second_reservation_id := public.reserve_tenant_usage_budget(
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'openai',
    'chat',
    1
  );
  third_reservation_id := public.reserve_tenant_usage_budget(
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'openai',
    'chat',
    1
  );
  begin
    perform public.reserve_tenant_usage_budget(
      'e1000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000001',
      'openai',
      'chat',
      1
    );
    raise exception 'per-minute request limit unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'USAGE_RATE_LIMIT_EXCEEDED' then
        raise;
      end if;
  end;
  perform public.release_tenant_usage_reservation(
    'e1000000-0000-4000-8000-000000000001',
    second_reservation_id
  );
  perform public.release_tenant_usage_reservation(
    'e1000000-0000-4000-8000-000000000001',
    third_reservation_id
  );

  usage_id := public.consume_tenant_metered_allowance(
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'source_upload',
    1048576,
    '{"sha256":"test"}'
  );
  perform tests.assert_true(
    (
      select input_units = 1048576
      from public.usage_records
      where id = usage_id
    ),
    'source allowance must record byte units'
  );

  perform public.sync_microsoft_store_entitlement(
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'pro',
    'Active',
    'store-subscription-1',
    'store-product-pro',
    'monthly',
    now(),
    now() + interval '1 month',
    now() + interval '1 month 3 days',
    false,
    'TW',
    repeat('a', 64)
  );
end;
$$;

select tests.assert_true(
  (
    select plan_code = 'pro'
      and billing_provider = 'microsoft_store'
      and store_entitlement_state = 'Active'
    from public.tenant_subscriptions
    where tenant_id = 'e2000000-0000-4000-8000-000000000001'
  ),
  'active Store entitlement must grant the mapped paid plan'
);

select tests.assert_true(
  exists (
    select 1
    from public.audit_logs
    where tenant_id = 'e2000000-0000-4000-8000-000000000001'
      and action = 'subscription.microsoft_store.synced'
  ),
  'Store synchronization must be audited'
);

select tests.assert_true(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and column_name in ('store_id_key', 'access_token', 'client_secret')
  ),
  'Store ID keys and provider secrets must have no database column'
);

reset role;
rollback;
