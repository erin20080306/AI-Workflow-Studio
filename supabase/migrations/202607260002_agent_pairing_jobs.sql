-- Device pairing secrets and atomic Agent Job operations.
-- Agent-facing APIs call these functions only through the server service role.

create table public.device_pairing_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  device_name text not null check (char_length(device_name) between 1 and 120),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index device_pairing_codes_expiry_idx
  on public.device_pairing_codes (expires_at)
  where consumed_at is null;

alter table public.device_pairing_codes enable row level security;

alter table public.agent_job_events
  add column event_key uuid;

create unique index agent_job_events_idempotency_idx
  on public.agent_job_events (tenant_id, agent_job_id, event_key)
  where event_key is not null;

create function public.claim_agent_job(
  requested_tenant_id uuid,
  requested_device_id uuid,
  requested_job_id uuid,
  requested_claim_token_hash bytea,
  requested_lease_seconds integer
)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if octet_length(requested_claim_token_hash) <> 32 then
    raise exception 'invalid claim token hash';
  end if;
  if requested_lease_seconds < 30 or requested_lease_seconds > 120 then
    raise exception 'invalid lease duration';
  end if;

  return query
  update public.agent_jobs
  set
    status = 'claimed',
    claimed_at = statement_timestamp(),
    leased_until = statement_timestamp() + make_interval(secs => requested_lease_seconds),
    claim_token_hash = requested_claim_token_hash,
    attempt = attempt + 1,
    updated_at = statement_timestamp()
  where
    id = requested_job_id
    and tenant_id = requested_tenant_id
    and device_id = requested_device_id
    and available_at <= statement_timestamp()
    and attempt < max_attempts
    and (
      status = 'pending'
      or (
        status in ('claimed', 'running')
        and leased_until <= statement_timestamp()
      )
    )
  returning public.agent_jobs.*;
end;
$$;

create function public.renew_agent_job_lease(
  requested_tenant_id uuid,
  requested_device_id uuid,
  requested_job_id uuid,
  requested_claim_token_hash bytea,
  requested_lease_seconds integer
)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if octet_length(requested_claim_token_hash) <> 32 then
    raise exception 'invalid claim token hash';
  end if;
  if requested_lease_seconds < 30 or requested_lease_seconds > 120 then
    raise exception 'invalid lease duration';
  end if;

  return query
  update public.agent_jobs
  set
    status = 'running',
    leased_until = statement_timestamp() + make_interval(secs => requested_lease_seconds),
    updated_at = statement_timestamp()
  where
    id = requested_job_id
    and tenant_id = requested_tenant_id
    and device_id = requested_device_id
    and status in ('claimed', 'running')
    and leased_until > statement_timestamp()
    and claim_token_hash = requested_claim_token_hash
  returning public.agent_jobs.*;
end;
$$;

create function public.record_agent_job_progress(
  requested_tenant_id uuid,
  requested_device_id uuid,
  requested_job_id uuid,
  requested_claim_token_hash bytea,
  requested_event_key uuid,
  requested_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_row_count integer;
begin
  if jsonb_typeof(requested_payload) <> 'object' then
    raise exception 'progress payload must be an object';
  end if;
  update public.agent_jobs
  set status = 'running', updated_at = statement_timestamp()
  where
    id = requested_job_id
    and tenant_id = requested_tenant_id
    and device_id = requested_device_id
    and status in ('claimed', 'running')
    and leased_until > statement_timestamp()
    and claim_token_hash = requested_claim_token_hash;

  if not found then
    return false;
  end if;

  insert into public.agent_job_events (
    tenant_id,
    agent_job_id,
    event_type,
    event_key,
    payload
  )
  values (
    requested_tenant_id,
    requested_job_id,
    'progress',
    requested_event_key,
    requested_payload
  )
  on conflict (tenant_id, agent_job_id, event_key) where event_key is not null
  do nothing;

  get diagnostics inserted_row_count = row_count;

  return inserted_row_count > 0;
end;
$$;

create function public.finish_agent_job(
  requested_tenant_id uuid,
  requested_device_id uuid,
  requested_job_id uuid,
  requested_claim_token_hash bytea,
  requested_event_key uuid,
  requested_status public.job_status,
  requested_payload jsonb
)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_status not in ('succeeded', 'failed') then
    raise exception 'invalid terminal job status';
  end if;
  if jsonb_typeof(requested_payload) <> 'object' then
    raise exception 'terminal payload must be an object';
  end if;

  perform 1
  from public.agent_jobs
  where
    id = requested_job_id
    and tenant_id = requested_tenant_id
    and device_id = requested_device_id
    and status in ('claimed', 'running')
    and leased_until > statement_timestamp()
    and claim_token_hash = requested_claim_token_hash
  for update;

  if not found then
    return query
    select jobs.*
    from public.agent_jobs as jobs
    where
      jobs.id = requested_job_id
      and jobs.tenant_id = requested_tenant_id
      and jobs.device_id = requested_device_id
      and jobs.status = requested_status
      and exists (
        select 1
        from public.agent_job_events as events
        where
          events.tenant_id = requested_tenant_id
          and events.agent_job_id = requested_job_id
          and events.event_key = requested_event_key
      );
    return;
  end if;

  insert into public.agent_job_events (
    tenant_id,
    agent_job_id,
    event_type,
    event_key,
    payload
  )
  values (
    requested_tenant_id,
    requested_job_id,
    case when requested_status = 'succeeded' then 'completed' else 'failed' end,
    requested_event_key,
    requested_payload
  )
  on conflict (tenant_id, agent_job_id, event_key) where event_key is not null
  do nothing;

  return query
  update public.agent_jobs
  set
    status = requested_status,
    leased_until = null,
    completed_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where
    id = requested_job_id
    and tenant_id = requested_tenant_id
    and device_id = requested_device_id
    and status in ('claimed', 'running')
  returning public.agent_jobs.*;
end;
$$;

revoke all on table public.device_pairing_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.device_pairing_codes to service_role;

revoke all on function public.claim_agent_job(uuid, uuid, uuid, bytea, integer)
  from public, anon, authenticated;
revoke all on function public.renew_agent_job_lease(uuid, uuid, uuid, bytea, integer)
  from public, anon, authenticated;
revoke all on function public.record_agent_job_progress(uuid, uuid, uuid, bytea, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.finish_agent_job(
  uuid,
  uuid,
  uuid,
  bytea,
  uuid,
  public.job_status,
  jsonb
) from public, anon, authenticated;

grant execute on function public.claim_agent_job(uuid, uuid, uuid, bytea, integer)
  to service_role;
grant execute on function public.renew_agent_job_lease(uuid, uuid, uuid, bytea, integer)
  to service_role;
grant execute on function public.record_agent_job_progress(uuid, uuid, uuid, bytea, uuid, jsonb)
  to service_role;
grant execute on function public.finish_agent_job(
  uuid,
  uuid,
  uuid,
  bytea,
  uuid,
  public.job_status,
  jsonb
) to service_role;
