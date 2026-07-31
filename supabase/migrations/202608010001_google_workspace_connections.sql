-- Encrypted Google Workspace OAuth credentials. Only server-side service-role code may
-- access this table; authenticated browser clients must never receive ciphertext.

create table public.google_workspace_connections (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  scopes text[] not null default '{}'::text[] check (cardinality(scopes) <= 40),
  status text not null default 'active'
    check (status in ('active', 'error', 'expired', 'revoked')),
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamp with time zone,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 120),
  last_health_check_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (tenant_id, id),
  check (
    status <> 'active'
    or (encrypted_access_token is not null and encrypted_refresh_token is not null)
  ),
  check (
    status <> 'revoked'
    or (encrypted_access_token is null and encrypted_refresh_token is null)
  )
);

create index google_workspace_connections_tenant_created_idx
  on public.google_workspace_connections (tenant_id, created_at desc);

alter table public.google_workspace_connections enable row level security;

revoke all on public.google_workspace_connections from public, anon, authenticated;
grant all on public.google_workspace_connections to service_role;
