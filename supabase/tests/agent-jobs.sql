begin;

insert into auth.users (id, email)
values
  ('71000000-0000-4000-8000-000000000001', 'agent-owner-a@example.invalid'),
  ('71000000-0000-4000-8000-000000000002', 'agent-owner-b@example.invalid');

insert into public.tenants (id, name, slug, owner_user_id)
values
  (
    '72000000-0000-4000-8000-000000000001',
    'Agent Tenant A',
    'agent-tenant-a',
    '71000000-0000-4000-8000-000000000001'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    'Agent Tenant B',
    'agent-tenant-b',
    '71000000-0000-4000-8000-000000000002'
  );

insert into public.memberships (tenant_id, user_id, role)
values
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'owner'
  );

insert into public.devices (id, tenant_id, paired_by, name, status, paired_at)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Agent A',
    'online',
    now()
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Agent B',
    'online',
    now()
  );

insert into public.device_tokens (
  id,
  tenant_id,
  device_id,
  token_hash,
  token_hint,
  expires_at
)
values (
  '74000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  extensions.digest('plaintext-device-token', 'sha256'),
  'ce-token',
  now() + interval '90 days'
);

insert into public.device_pairing_codes (
  tenant_id,
  created_by,
  device_name,
  code_hash,
  expires_at
)
values (
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'Pending Agent',
  extensions.digest('plaintext-pairing-code', 'sha256'),
  now() + interval '10 minutes'
);

insert into public.workflows (id, tenant_id, created_by, name, status)
values
  (
    '75000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Agent workflow A',
    'active'
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Agent workflow B',
    'active'
  );

insert into public.workflow_versions (
  id,
  tenant_id,
  workflow_id,
  version,
  schema_version,
  definition,
  created_by
)
values
  (
    '76000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    1,
    1,
    '{}',
    '71000000-0000-4000-8000-000000000001'
  ),
  (
    '76000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000002',
    1,
    1,
    '{}',
    '71000000-0000-4000-8000-000000000002'
  );

insert into public.workflow_runs (
  id,
  tenant_id,
  workflow_id,
  workflow_version_id,
  status,
  idempotency_key
)
values
  (
    '77000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    'queued',
    'agent-run-a'
  ),
  (
    '77000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000002',
    'queued',
    'agent-run-b'
  );

insert into public.agent_jobs (
  id,
  tenant_id,
  device_id,
  workflow_run_id,
  payload,
  idempotency_key
)
values
  (
    '78000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    '{"workflow":{"schemaVersion":1}}',
    'agent-job-a'
  ),
  (
    '78000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    '{"workflow":{"schemaVersion":1}}',
    'agent-job-expiry'
  ),
  (
    '78000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    '77000000-0000-4000-8000-000000000002',
    '{"workflow":{"schemaVersion":1}}',
    'agent-job-b'
  );

do $$
declare
  result_count integer;
begin
  if (
    select encode(token_hash, 'hex') = 'plaintext-device-token'
    from public.device_tokens
    where id = '74000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'device token plaintext was stored';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.device_pairing_codes'::regclass
  ) then
    raise exception 'device pairing codes must enforce RLS';
  end if;

  if has_table_privilege('authenticated', 'public.device_pairing_codes', 'select') then
    raise exception 'authenticated users must not read pairing code hashes';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.claim_agent_job(uuid,uuid,uuid,bytea,integer)',
    'execute'
  ) then
    raise exception 'authenticated users must not call service-role job claims';
  end if;

  select count(*) into result_count
  from public.claim_agent_job(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001',
    extensions.digest('claim-a', 'sha256'),
    60
  );
  if result_count <> 1 then
    raise exception 'first atomic claim must succeed';
  end if;

  select count(*) into result_count
  from public.claim_agent_job(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001',
    extensions.digest('duplicate-claim', 'sha256'),
    60
  );
  if result_count <> 0 then
    raise exception 'duplicate active claim must fail';
  end if;

  select count(*) into result_count
  from public.claim_agent_job(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000003',
    extensions.digest('cross-tenant-claim', 'sha256'),
    60
  );
  if result_count <> 0 then
    raise exception 'cross-tenant claim must fail';
  end if;

  select count(*) into result_count
  from public.renew_agent_job_lease(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001',
    extensions.digest('wrong-claim', 'sha256'),
    120
  );
  if result_count <> 0 then
    raise exception 'wrong claim token must not renew a lease';
  end if;

  select count(*) into result_count
  from public.renew_agent_job_lease(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001',
    extensions.digest('claim-a', 'sha256'),
    120
  );
  if result_count <> 1 then
    raise exception 'valid claim token must renew a live lease';
  end if;

  if not public.record_agent_job_progress(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001',
    extensions.digest('claim-a', 'sha256'),
    '79000000-0000-4000-8000-000000000001',
    '{"nodeId":"validate_orders","status":"running"}'
  ) then
    raise exception 'first progress event must be recorded';
  end if;

  if public.record_agent_job_progress(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001',
    extensions.digest('claim-a', 'sha256'),
    '79000000-0000-4000-8000-000000000001',
    '{"nodeId":"validate_orders","status":"running"}'
  ) then
    raise exception 'duplicate progress event must be deduplicated';
  end if;

  select count(*) into result_count
  from public.finish_agent_job(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001',
    extensions.digest('claim-a', 'sha256'),
    '79000000-0000-4000-8000-000000000002',
    'succeeded',
    '{"processedRows":12}'
  );
  if result_count <> 1 then
    raise exception 'job completion must succeed';
  end if;

  select count(*) into result_count
  from public.finish_agent_job(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001',
    extensions.digest('claim-a', 'sha256'),
    '79000000-0000-4000-8000-000000000002',
    'succeeded',
    '{"processedRows":12}'
  );
  if result_count <> 1 then
    raise exception 'duplicate completion must return the terminal job idempotently';
  end if;

  select count(*) into result_count
  from public.claim_agent_job(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000002',
    extensions.digest('claim-expiry', 'sha256'),
    60
  );
  if result_count <> 1 then
    raise exception 'lease-expiry fixture claim must succeed';
  end if;

  update public.agent_jobs
  set leased_until = statement_timestamp() - interval '1 second'
  where id = '78000000-0000-4000-8000-000000000002';

  select count(*) into result_count
  from public.renew_agent_job_lease(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000002',
    extensions.digest('claim-expiry', 'sha256'),
    60
  );
  if result_count <> 0 then
    raise exception 'expired lease must not be renewed';
  end if;

  if (
    select count(*)
    from public.agent_job_events
    where
      agent_job_id = '78000000-0000-4000-8000-000000000001'
      and event_key = '79000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'progress event idempotency index must keep one row';
  end if;
end;
$$;

rollback;
