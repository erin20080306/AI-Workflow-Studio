-- Durable Google Sheets operation idempotency and server-only token boundary.
-- This migration is immutable after publication.

create type public.connection_operation_status as enum (
  'pending',
  'succeeded',
  'ambiguous',
  'failed'
);

create table public.connection_operations (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  connection_id uuid not null,
  operation_type text not null check (
    operation_type in (
      'google_sheets.append',
      'google_sheets.update',
      'google_sheets.sync'
    )
  ),
  idempotency_key text not null check (
    char_length(idempotency_key) between 8 and 200
    and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  request_hash bytea not null check (octet_length(request_hash) = 32),
  status public.connection_operation_status not null default 'pending',
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  last_error_code text check (
    last_error_code is null or char_length(last_error_code) between 1 and 120
  ),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  foreign key (connection_id, tenant_id)
    references public.connections (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id),
  unique (tenant_id, connection_id, idempotency_key),
  check (
    (status = 'succeeded') = (completed_at is not null)
    and (status <> 'succeeded' or result is not null)
  )
);

create index connection_operations_connection_status_idx
  on public.connection_operations (connection_id, status, created_at desc);

create trigger set_connection_operations_updated_at
  before update on public.connection_operations
  for each row execute function public.set_updated_at();

alter table public.connection_operations enable row level security;

create function public.claim_connection_operation(
  target_tenant_id uuid,
  target_connection_id uuid,
  target_operation_type text,
  target_idempotency_key text,
  target_request_hash bytea
)
returns table (
  operation_status public.connection_operation_status,
  stored_result jsonb,
  request_matches boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if octet_length(target_request_hash) <> 32 then
    raise exception using errcode = '22023', message = 'Invalid request hash';
  end if;

  insert into public.connection_operations (
    tenant_id,
    connection_id,
    operation_type,
    idempotency_key,
    request_hash
  )
  values (
    target_tenant_id,
    target_connection_id,
    target_operation_type,
    target_idempotency_key,
    target_request_hash
  )
  on conflict (tenant_id, connection_id, idempotency_key) do nothing;

  return query
  select
    operation.status,
    operation.result,
    operation.request_hash = target_request_hash
  from public.connection_operations operation
  where operation.tenant_id = target_tenant_id
    and operation.connection_id = target_connection_id
    and operation.idempotency_key = target_idempotency_key
  for update;
end;
$$;

create function public.finish_connection_operation(
  target_tenant_id uuid,
  target_connection_id uuid,
  target_idempotency_key text,
  target_request_hash bytea,
  target_status public.connection_operation_status,
  target_result jsonb default null,
  target_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_status not in ('succeeded', 'ambiguous', 'failed') then
    raise exception using errcode = '22023', message = 'Invalid terminal status';
  end if;
  if target_status = 'succeeded'
    and (target_result is null or jsonb_typeof(target_result) <> 'object') then
    raise exception using errcode = '22023', message = 'Success result is required';
  end if;

  update public.connection_operations
  set
    status = target_status,
    result = case when target_status = 'succeeded' then target_result else null end,
    last_error_code = target_error_code,
    completed_at = case when target_status = 'succeeded' then now() else null end
  where tenant_id = target_tenant_id
    and connection_id = target_connection_id
    and idempotency_key = target_idempotency_key
    and request_hash = target_request_hash
    and status = 'pending';

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Connection operation state conflict';
  end if;
end;
$$;

create function public.release_connection_operation(
  target_tenant_id uuid,
  target_connection_id uuid,
  target_idempotency_key text,
  target_request_hash bytea
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.connection_operations
  where tenant_id = target_tenant_id
    and connection_id = target_connection_id
    and idempotency_key = target_idempotency_key
    and request_hash = target_request_hash
    and status = 'pending';
end;
$$;

revoke all on public.connection_operations from anon, authenticated;
revoke all on function public.claim_connection_operation(
  uuid,
  uuid,
  text,
  text,
  bytea
) from public, anon, authenticated;
revoke all on function public.finish_connection_operation(
  uuid,
  uuid,
  text,
  bytea,
  public.connection_operation_status,
  jsonb,
  text
) from public, anon, authenticated;
revoke all on function public.release_connection_operation(
  uuid,
  uuid,
  text,
  bytea
) from public, anon, authenticated;

grant all on public.connection_operations to service_role;
grant execute on function public.claim_connection_operation(
  uuid,
  uuid,
  text,
  text,
  bytea
) to service_role;
grant execute on function public.finish_connection_operation(
  uuid,
  uuid,
  text,
  bytea,
  public.connection_operation_status,
  jsonb,
  text
) to service_role;
grant execute on function public.release_connection_operation(
  uuid,
  uuid,
  text,
  bytea
) to service_role;
