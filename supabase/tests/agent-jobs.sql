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

insert into public.workflow_run_steps (
  tenant_id,
  workflow_run_id,
  node_id,
  node_type,
  status,
  attempt,
  started_at,
  completed_at,
  output_summary
)
values
  (
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    'review_profile_ready',
    'excel.visible_review',
    'succeeded',
    1,
    statement_timestamp(),
    statement_timestamp(),
    '{"columns":[],"fileCount":2,"kind":"desktop_excel_profile","rowCount":10,"sheetCount":1,"truncatedColumns":0}'
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    'cloud_summary_claim',
    'ai.summarize',
    'pending',
    1,
    null,
    null,
    '{}'
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    'cloud_summary_mismatch',
    'ai.summarize',
    'pending',
    1,
    null,
    null,
    '{}'
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    'review_profile_running',
    'excel.visible_review',
    'running',
    1,
    statement_timestamp(),
    null,
    '{"columns":[],"fileCount":2,"kind":"desktop_excel_profile","rowCount":10,"sheetCount":1,"truncatedColumns":0}'
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    'cloud_summary_unmet',
    'ai.summarize',
    'pending',
    1,
    null,
    null,
    '{}'
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

  if has_table_privilege('authenticated', 'public.devices', 'insert')
    or has_table_privilege('authenticated', 'public.devices', 'update')
    or has_table_privilege('authenticated', 'public.devices', 'delete') then
    raise exception 'authenticated users must not bypass server-owned device lifecycle RPCs';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.claim_agent_job(uuid,uuid,uuid,bytea,integer)',
    'execute'
  ) then
    raise exception 'authenticated users must not call service-role job claims';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.complete_agent_pairing(bytea,uuid,text,uuid,bytea,text,timestamp with time zone,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'authenticated users must not complete Desktop Agent pairing';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.record_agent_heartbeat(uuid,uuid,text,boolean,jsonb,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'authenticated users must not record Desktop Agent heartbeats';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.revoke_agent_device(uuid,uuid,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'authenticated users must not revoke Desktop Agents';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.revoke_agent_device_v2(uuid,uuid,uuid,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'authenticated users must not call audited Desktop Agent revocation';
  end if;

  if has_function_privilege(
    'service_role',
    'public.revoke_agent_device(uuid,uuid,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'service role must not retain the unaudited legacy revocation entry point';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.revoke_agent_device_v2(uuid,uuid,uuid,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'service role must execute the audited revocation entry point';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.devices'::regclass
      and tgname = 'a_lock_tenant_for_device_limit'
      and not tgisinternal
      and tgenabled = 'O'
      and (tgtype & 2) = 2
      and (tgtype & 4) = 4
      and tgfoid = 'public.lock_tenant_for_device_limit()'::regprocedure
  ) then
    raise exception 'device inserts must serialize before enforcing the active-device limit';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.agent_jobs'::regclass
      and tgname = 'require_active_device_for_agent_job'
      and not tgisinternal
      and tgenabled = 'O'
      and (tgtype & 2) = 2
      and (tgtype & 4) = 4
      and tgfoid = 'public.require_active_agent_job_device()'::regprocedure
  ) then
    raise exception 'Agent Job inserts must reject revoked devices atomically';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.devices'::regclass
      and tgname = 'prevent_revoked_device_reactivation'
      and not tgisinternal
  ) then
    raise exception 'revoked Desktop Agents must not be reactivated';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.claim_agent_cloud_step(uuid,uuid,integer,text,text,text,text,jsonb,text,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'authenticated users must not claim Desktop-to-Cloud continuation steps';
  end if;

  select count(*) into result_count
  from public.claim_agent_cloud_step(
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    1,
    'cloud_summary_claim',
    'ai.summarize',
    'review_profile_ready',
    'excel.visible_review',
    '{"columns":[],"fileCount":2,"kind":"desktop_excel_profile","rowCount":10,"sheetCount":1,"truncatedColumns":0}',
    encode(extensions.digest('approved-profile', 'sha256'), 'hex'),
    statement_timestamp()
  );
  if result_count <> 1 then
    raise exception 'the first exact predecessor-bound cloud step claim must succeed';
  end if;

  select count(*) into result_count
  from public.claim_agent_cloud_step(
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    1,
    'cloud_summary_claim',
    'ai.summarize',
    'review_profile_ready',
    'excel.visible_review',
    '{"columns":[],"fileCount":2,"kind":"desktop_excel_profile","rowCount":10,"sheetCount":1,"truncatedColumns":0}',
    encode(extensions.digest('approved-profile', 'sha256'), 'hex'),
    statement_timestamp()
  );
  if result_count <> 0 then
    raise exception 'an active cloud step claim must not execute twice';
  end if;

  select count(*) into result_count
  from public.claim_agent_cloud_step(
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    1,
    'cloud_summary_mismatch',
    'ai.summarize',
    'review_profile_ready',
    'excel.visible_review',
    '{"columns":[],"fileCount":3,"kind":"desktop_excel_profile","rowCount":10,"sheetCount":1,"truncatedColumns":0}',
    encode(extensions.digest('changed-profile', 'sha256'), 'hex'),
    statement_timestamp()
  );
  if result_count <> 0 then
    raise exception 'a cloud step claim must reject changed predecessor input';
  end if;

  select count(*) into result_count
  from public.claim_agent_cloud_step(
    '72000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    1,
    'cloud_summary_unmet',
    'ai.summarize',
    'review_profile_running',
    'excel.visible_review',
    '{"columns":[],"fileCount":2,"kind":"desktop_excel_profile","rowCount":10,"sheetCount":1,"truncatedColumns":0}',
    encode(extensions.digest('unmet-profile', 'sha256'), 'hex'),
    statement_timestamp()
  );
  if result_count <> 0 then
    raise exception 'a cloud step claim must require a succeeded predecessor';
  end if;

  select count(*) into result_count
  from public.claim_agent_cloud_step(
    '72000000-0000-4000-8000-000000000002',
    '77000000-0000-4000-8000-000000000001',
    1,
    'cloud_summary_mismatch',
    'ai.summarize',
    'review_profile_ready',
    'excel.visible_review',
    '{"columns":[],"fileCount":2,"kind":"desktop_excel_profile","rowCount":10,"sheetCount":1,"truncatedColumns":0}',
    encode(extensions.digest('cross-tenant-profile', 'sha256'), 'hex'),
    statement_timestamp()
  );
  if result_count <> 0 then
    raise exception 'a cloud step claim must not cross Tenant boundaries';
  end if;

  if (
    select status
    from public.workflow_run_steps
    where workflow_run_id = '77000000-0000-4000-8000-000000000001'
      and node_id = 'cloud_summary_claim'
      and attempt = 1
  ) <> 'running' then
    raise exception 'the atomic cloud step claim must transition pending to running';
  end if;

  if (
    select output_summary <> '{}'::jsonb
      or input_summary ? 'localPath'
      or input_summary ? 'rows'
    from public.workflow_run_steps
    where workflow_run_id = '77000000-0000-4000-8000-000000000001'
      and node_id = 'cloud_summary_claim'
      and attempt = 1
  ) then
    raise exception 'the cloud step claim must persist only bounded metadata';
  end if;

  begin
    perform count(*)
    from public.complete_agent_pairing(
      extensions.digest('plaintext-pairing-code', 'sha256'),
      '73000000-0000-4000-8000-000000000004',
      '1.2.3-test',
      '74000000-0000-4000-8000-000000000004',
      extensions.digest('paired-device-token', 'sha256'),
      'ce-token',
      statement_timestamp() + interval '90 days',
      statement_timestamp()
    );
    raise exception 'free device limit unexpectedly allowed atomic pairing';
  exception
    when check_violation then
      null;
  end;

  if (
    select consumed_at is not null
    from public.device_pairing_codes
    where code_hash = extensions.digest('plaintext-pairing-code', 'sha256')
  ) then
    raise exception 'failed quota-limited pairing must not consume its one-time code';
  end if;

  if exists (
    select 1
    from public.devices
    where id = '73000000-0000-4000-8000-000000000004'
  ) or exists (
    select 1
    from public.device_tokens
    where id = '74000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'failed quota-limited pairing must roll back device credentials';
  end if;

  update public.tenant_subscriptions
  set plan_code = 'team'
  where tenant_id = '72000000-0000-4000-8000-000000000001';

  select count(*) into result_count
  from public.complete_agent_pairing(
    extensions.digest('plaintext-pairing-code', 'sha256'),
    '73000000-0000-4000-8000-000000000004',
    '1.2.3-test',
    '74000000-0000-4000-8000-000000000004',
    extensions.digest('paired-device-token', 'sha256'),
    'ce-token',
    statement_timestamp() + interval '90 days',
    statement_timestamp()
  );
  if result_count <> 1 then
    raise exception 'first atomic Desktop Agent pairing must succeed';
  end if;

  select count(*) into result_count
  from public.complete_agent_pairing(
    extensions.digest('plaintext-pairing-code', 'sha256'),
    '73000000-0000-4000-8000-000000000005',
    '1.2.3-test',
    '74000000-0000-4000-8000-000000000005',
    extensions.digest('duplicate-device-token', 'sha256'),
    'ce-token',
    statement_timestamp() + interval '90 days',
    statement_timestamp()
  );
  if result_count <> 0 then
    raise exception 'a consumed Desktop Agent pairing code must not be reused';
  end if;

  if (
    select count(*)
    from public.device_tokens
    where
      id = '74000000-0000-4000-8000-000000000004'
      and device_id = '73000000-0000-4000-8000-000000000004'
      and tenant_id = '72000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'atomic pairing must persist exactly one hashed device token';
  end if;

  select count(*) into result_count
  from public.record_agent_heartbeat(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000004',
    '1.2.4-test',
    true,
    '{"folderAliasCount":1}',
    statement_timestamp()
  );
  if result_count <> 1 then
    raise exception 'a paired Desktop Agent heartbeat must be recorded';
  end if;

  if (
    select count(*)
    from public.device_heartbeats
    where
      device_id = '73000000-0000-4000-8000-000000000004'
      and tenant_id = '72000000-0000-4000-8000-000000000001'
      and executor_running
  ) <> 1 then
    raise exception 'heartbeat metadata must be persisted for the paired device';
  end if;

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
      '77000000-0000-4000-8000-000000000003',
      '72000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000001',
      'queued',
      'agent-run-revoke-active'
    ),
    (
      '77000000-0000-4000-8000-000000000004',
      '72000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000001',
      'queued',
      'agent-run-revoke-after-finish'
    );

  insert into public.workflow_run_steps (
    tenant_id,
    workflow_run_id,
    node_id,
    node_type,
    status,
    attempt
  )
  values
    (
      '72000000-0000-4000-8000-000000000001',
      '77000000-0000-4000-8000-000000000003',
      'revoke-active-step',
      'excel.read',
      'pending',
      1
    ),
    (
      '72000000-0000-4000-8000-000000000001',
      '77000000-0000-4000-8000-000000000004',
      'revoke-finished-step',
      'excel.read',
      'pending',
      1
    );

  insert into public.agent_jobs (
    id,
    tenant_id,
    device_id,
    workflow_run_id,
    payload,
    idempotency_key,
    status,
    completed_at
  )
  values
    (
      '78000000-0000-4000-8000-000000000004',
      '72000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000004',
      '77000000-0000-4000-8000-000000000003',
      '{"workflow":{"schemaVersion":1}}',
      'agent-job-revoke',
      'pending',
      null
    ),
    (
      '78000000-0000-4000-8000-000000000006',
      '72000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '77000000-0000-4000-8000-000000000003',
      '{"workflow":{"schemaVersion":1}}',
      'agent-job-revoke-sibling',
      'pending',
      null
    ),
    (
      '78000000-0000-4000-8000-000000000007',
      '72000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000004',
      '77000000-0000-4000-8000-000000000004',
      '{"workflow":{"schemaVersion":1}}',
      'agent-job-finished-before-revoke',
      'succeeded',
      statement_timestamp()
    );

  begin
    perform public.revoke_agent_device_v2(
      '72000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000004',
      '71000000-0000-4000-8000-000000000002',
      statement_timestamp()
    );
    raise exception 'a cross-Tenant actor unexpectedly revoked the Desktop Agent';
  exception
    when insufficient_privilege then
      null;
  end;

  if not public.revoke_agent_device_v2(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    statement_timestamp()
  ) then
    raise exception 'the paired Desktop Agent must be revocable';
  end if;

  if exists (
    select 1
    from public.agent_jobs
    where workflow_run_id in (
      '77000000-0000-4000-8000-000000000003',
      '77000000-0000-4000-8000-000000000004'
    )
      and status in ('pending', 'claimed', 'running')
  ) then
    raise exception 'revocation must cancel every active Job for an affected Run';
  end if;

  if (
    select status
    from public.agent_jobs
    where id = '78000000-0000-4000-8000-000000000007'
  ) <> 'succeeded' then
    raise exception 'revocation must not rewrite an already terminal Job result';
  end if;

  if (
    select count(*)
    from public.workflow_runs
    where id in (
      '77000000-0000-4000-8000-000000000003',
      '77000000-0000-4000-8000-000000000004'
    )
      and status = 'cancelled'
  ) <> 2 then
    raise exception 'revocation must converge active Runs even after a Job result committed';
  end if;

  if exists (
    select 1
    from public.workflow_run_steps
    where workflow_run_id in (
      '77000000-0000-4000-8000-000000000003',
      '77000000-0000-4000-8000-000000000004'
    )
      and status in ('pending', 'running')
  ) then
    raise exception 'revocation must converge pending and running steps to cancelled';
  end if;

  begin
    insert into public.agent_jobs (
      id,
      tenant_id,
      device_id,
      workflow_run_id,
      payload,
      idempotency_key
    )
    values (
      '78000000-0000-4000-8000-000000000008',
      '72000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000004',
      '77000000-0000-4000-8000-000000000003',
      '{"workflow":{"schemaVersion":1}}',
      'agent-job-after-revoke'
    );
    raise exception 'a revoked Desktop Agent unexpectedly accepted a new Job';
  exception
    when check_violation then
      null;
  end;

  begin
    update public.devices
    set status = 'online', revoked_at = null
    where id = '73000000-0000-4000-8000-000000000004';
    raise exception 'a revoked Desktop Agent unexpectedly reactivated';
  exception
    when check_violation then
      null;
  end;

  if (
    select count(*)
    from public.audit_logs
    where tenant_id = '72000000-0000-4000-8000-000000000001'
      and actor_user_id = '71000000-0000-4000-8000-000000000001'
      and action = 'device.revoked'
      and resource_id = '73000000-0000-4000-8000-000000000004'
  ) <> 1 then
    raise exception 'revocation must create one actor-bound device audit event';
  end if;

  if (
    select count(*)
    from public.audit_logs
    where tenant_id = '72000000-0000-4000-8000-000000000001'
      and actor_user_id = '71000000-0000-4000-8000-000000000001'
      and action = 'run.cancelled'
      and resource_id in (
        '77000000-0000-4000-8000-000000000003',
        '77000000-0000-4000-8000-000000000004'
      )
  ) <> 2 then
    raise exception 'revocation must audit every affected Run cancellation';
  end if;

  if (
    select count(*)
    from public.device_tokens
    where
      id = '74000000-0000-4000-8000-000000000004'
      and revoked_at is not null
  ) <> 1 then
    raise exception 'revocation must revoke the Desktop Agent token';
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
