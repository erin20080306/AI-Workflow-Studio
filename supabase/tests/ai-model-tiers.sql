begin;

create schema if not exists tests;

create or replace function tests.assert_true(
  condition boolean,
  message text
)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'Assertion failed: %', message;
  end if;
end;
$$;

grant usage on schema tests to authenticated, service_role;
grant execute on function tests.assert_true(boolean, text) to authenticated, service_role;

select tests.assert_true(
  (select maximum_ai_model_tier = 'economy' from public.billing_plans where code = 'free'),
  'free plan must be limited to economy models'
);
select tests.assert_true(
  (select maximum_ai_model_tier = 'standard' from public.billing_plans where code = 'pro'),
  'pro plan must open standard models'
);
select tests.assert_true(
  (select maximum_ai_model_tier = 'advanced' from public.billing_plans where code = 'team'),
  'team plan must open advanced models'
);
select tests.assert_true(
  (select maximum_ai_model_tier = 'flagship' from public.billing_plans where code = 'business'),
  'business plan must open flagship models'
);

select tests.assert_true(
  (select count(*) = 12 from public.ai_model_tier_mappings),
  'all provider and tier mappings must be seeded'
);
select tests.assert_true(
  (
    select model = 'gemini-3.5-flash-lite'
    from public.ai_model_tier_mappings
    where provider = 'gemini' and tier = 'economy'
  ),
  'free Auto default must use Gemini Flash-Lite'
);
select tests.assert_true(
  (
    select model = 'gpt-5.6-luna'
    from public.ai_model_tier_mappings
    where provider = 'openai' and tier = 'economy'
  ),
  'OpenAI economy fallback must use Luna'
);
select tests.assert_true(
  (
    select model = 'claude-haiku-4-5-20251001'
    from public.ai_model_tier_mappings
    where provider = 'anthropic' and tier = 'economy'
  ),
  'Claude economy fallback must use Haiku'
);

select tests.assert_true(
  (
    select maximum_ai_request_cost_microunits = 3000000
    from public.billing_plans
    where code = 'free'
  ),
  'free requests must have a three TWD hard ceiling'
);
select tests.assert_true(
  (
    select maximum_ai_request_cost_microunits = 60000000
    from public.billing_plans
    where code = 'business'
  ),
  'business requests must retain a bounded flagship ceiling'
);

select tests.assert_true(
  to_regclass('public.ai_model_tier_mappings') is not null,
  'model mappings table must exist'
);
select tests.assert_true(
  to_regprocedure(
    'public.platform_admin_update_ai_model_mapping(uuid,text,text,text,boolean)'
  ) is not null,
  'allowlisted model update function must exist'
);
select tests.assert_true(
  not has_table_privilege(
    'authenticated',
    'public.ai_model_tier_mappings',
    'select'
  ),
  'ordinary authenticated users must not read model slugs'
);
select tests.assert_true(
  has_table_privilege(
    'service_role',
    'public.ai_model_tier_mappings',
    'select'
  ),
  'server service role must read model mappings'
);
select tests.assert_true(
  (select bool_and(enabled) from public.ai_model_tier_mappings),
  'all requested model tiers must initially be enabled'
);
select tests.assert_true(
  (
    select reasoning_effort = 'high'
    from public.ai_model_tier_mappings
    where provider = 'openai' and tier = 'flagship'
  ),
  'OpenAI flagship mapping must use high reasoning'
);

insert into auth.users (
  id,
  email
)
values
  (
    'f1000000-0000-0000-0000-000000000001',
    'tier-admin@example.com'
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'tier-support@example.com'
  );

insert into public.platform_admins (
  user_id,
  handle,
  role,
  active,
  grant_reason
)
values
  (
    'f1000000-0000-0000-0000-000000000001',
    'tier-super-admin',
    'super_admin',
    true,
    'AI model tier integration test'
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'tier-support-admin',
    'support',
    true,
    'AI model tier integration test'
  );

set local role service_role;

do $$
begin
  begin
    perform public.platform_admin_update_ai_model_mapping(
      'f1000000-0000-0000-0000-000000000002',
      'gemini',
      'economy',
      'gemini-3.5-flash-lite',
      false
    );
    raise exception 'Expected support admin update to be rejected';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.platform_admin_update_ai_model_mapping(
      'f1000000-0000-0000-0000-000000000001',
      'gemini',
      'economy',
      'gemini-3.1-pro-preview',
      true
    );
    raise exception 'Expected cross-tier model update to be rejected';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

select public.platform_admin_update_ai_model_mapping(
  'f1000000-0000-0000-0000-000000000001',
  'gemini',
  'economy',
  'gemini-3.5-flash-lite',
  false
);

select public.platform_admin_update_ai_model_mapping(
  'f1000000-0000-0000-0000-000000000001',
  'openai',
  'advanced',
  'gpt-5.6-sol-20260728',
  true
);

reset role;

select tests.assert_true(
  (
    select not enabled
    from public.ai_model_tier_mappings
    where provider = 'gemini' and tier = 'economy'
  ),
  'superadmin must be able to update an allowlisted model mapping'
);
select tests.assert_true(
  (
    select model = 'gpt-5.6-sol-20260728'
    from public.ai_model_tier_mappings
    where provider = 'openai' and tier = 'advanced'
  ),
  'superadmin must be able to store an account-listed versioned model ID'
);
select tests.assert_true(
  exists (
    select 1
    from public.platform_admin_audit_logs
    where actor_user_id = 'f1000000-0000-0000-0000-000000000001'
      and action = 'ai_model_mapping.updated'
  ),
  'model mapping changes must be audited'
);

rollback;
