-- Atomic production Desktop Agent pairing, heartbeat, and revocation.
-- Agent-facing APIs call these functions only through the server service role.

create function public.complete_agent_pairing(
  requested_code_hash bytea,
  requested_device_id uuid,
  requested_agent_version text,
  requested_token_id uuid,
  requested_token_hash bytea,
  requested_token_hint text,
  requested_token_expires_at timestamp with time zone,
  requested_now timestamp with time zone
)
returns setof public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.device_pairing_codes;
begin
  if octet_length(requested_code_hash) <> 32
    or octet_length(requested_token_hash) <> 32 then
    raise exception 'invalid agent credential hash';
  end if;

  update public.device_pairing_codes
  set consumed_at = requested_now
  where code_hash = requested_code_hash
    and consumed_at is null
    and expires_at > requested_now
  returning * into pairing;

  if pairing.id is null then
    return;
  end if;

  insert into public.devices (
    id,
    tenant_id,
    paired_by,
    name,
    status,
    agent_version,
    last_seen_at,
    paired_at
  )
  values (
    requested_device_id,
    pairing.tenant_id,
    pairing.created_by,
    pairing.device_name,
    'online',
    requested_agent_version,
    requested_now,
    requested_now
  );

  insert into public.device_tokens (
    id,
    tenant_id,
    device_id,
    token_hash,
    token_hint,
    expires_at,
    last_used_at
  )
  values (
    requested_token_id,
    pairing.tenant_id,
    requested_device_id,
    requested_token_hash,
    requested_token_hint,
    requested_token_expires_at,
    requested_now
  );

  return query
  select devices.*
  from public.devices as devices
  where devices.id = requested_device_id
    and devices.tenant_id = pairing.tenant_id;
end;
$$;

create function public.record_agent_heartbeat(
  requested_tenant_id uuid,
  requested_device_id uuid,
  requested_agent_version text,
  requested_executor_running boolean,
  requested_metadata jsonb,
  requested_occurred_at timestamp with time zone
)
returns setof public.devices
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(requested_metadata) <> 'object' then
    raise exception 'heartbeat metadata must be an object';
  end if;

  insert into public.device_heartbeats (
    tenant_id,
    device_id,
    agent_version,
    executor_running,
    metadata,
    occurred_at
  )
  select
    requested_tenant_id,
    requested_device_id,
    requested_agent_version,
    requested_executor_running,
    requested_metadata,
    requested_occurred_at
  where exists (
    select 1
    from public.devices
    where id = requested_device_id
      and tenant_id = requested_tenant_id
      and status <> 'revoked'
  );

  if not found then
    return;
  end if;

  return query
  update public.devices
  set
    agent_version = requested_agent_version,
    last_seen_at = requested_occurred_at,
    status = 'online',
    updated_at = requested_occurred_at
  where id = requested_device_id
    and tenant_id = requested_tenant_id
    and status <> 'revoked'
  returning public.devices.*;
end;
$$;

create function public.revoke_agent_device(
  requested_tenant_id uuid,
  requested_device_id uuid,
  requested_now timestamp with time zone
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.devices
  set
    status = 'revoked',
    revoked_at = requested_now,
    updated_at = requested_now
  where id = requested_device_id
    and tenant_id = requested_tenant_id
    and status <> 'revoked';

  if not found then
    return false;
  end if;

  update public.device_tokens
  set revoked_at = requested_now, updated_at = requested_now
  where device_id = requested_device_id
    and tenant_id = requested_tenant_id
    and revoked_at is null;

  update public.agent_jobs
  set
    status = 'cancelled',
    leased_until = null,
    completed_at = requested_now,
    updated_at = requested_now
  where device_id = requested_device_id
    and tenant_id = requested_tenant_id
    and status in ('pending', 'claimed', 'running');

  return true;
end;
$$;

revoke all on function public.complete_agent_pairing(
  bytea,
  uuid,
  text,
  uuid,
  bytea,
  text,
  timestamp with time zone,
  timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.record_agent_heartbeat(
  uuid,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.revoke_agent_device(
  uuid,
  uuid,
  timestamp with time zone
) from public, anon, authenticated;

grant execute on function public.complete_agent_pairing(
  bytea,
  uuid,
  text,
  uuid,
  bytea,
  text,
  timestamp with time zone,
  timestamp with time zone
) to service_role;
grant execute on function public.record_agent_heartbeat(
  uuid,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp with time zone
) to service_role;
grant execute on function public.revoke_agent_device(
  uuid,
  uuid,
  timestamp with time zone
) to service_role;
