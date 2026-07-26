-- AI Workflow Studio initial multi-tenant platform schema.
-- This migration is immutable after publication.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.device_status as enum ('pairing', 'online', 'offline', 'revoked');
create type public.connection_provider as enum ('google_sheets');
create type public.connection_status as enum ('active', 'expired', 'revoked', 'error');
create type public.workflow_status as enum ('draft', 'active', 'disabled', 'archived');
create type public.run_status as enum (
  'pending',
  'awaiting_approval',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out'
);
create type public.step_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
  'timed_out'
);
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'expired');
create type public.job_status as enum (
  'pending',
  'claimed',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'expired'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  avatar_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.tenants (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 3 and 63
  ),
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, owner_user_id)
);

create table public.memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (tenant_id, user_id),
  unique (id, tenant_id)
);

create table public.devices (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  paired_by uuid not null references auth.users (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  status public.device_status not null default 'pairing',
  agent_version text,
  privacy_mode boolean not null default true,
  last_seen_at timestamp with time zone,
  paired_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, tenant_id),
  check ((status = 'revoked') = (revoked_at is not null))
);

create table public.device_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  device_id uuid not null,
  token_hash bytea not null unique,
  token_hint text not null check (char_length(token_hint) between 4 and 16),
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (device_id, tenant_id)
    references public.devices (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id)
);

create table public.device_heartbeats (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  device_id uuid not null,
  agent_version text not null,
  executor_running boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamp with time zone not null default now(),
  foreign key (device_id, tenant_id)
    references public.devices (id, tenant_id)
    on delete cascade
);

create table public.folder_aliases (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  device_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  permission_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(permission_summary) = 'object'),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (device_id, tenant_id)
    references public.devices (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id),
  unique (tenant_id, device_id, display_name)
);

create table public.connections (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  provider public.connection_provider not null,
  name text not null check (char_length(name) between 1 and 120),
  status public.connection_status not null default 'active',
  encrypted_access_token bytea,
  encrypted_refresh_token bytea,
  token_expires_at timestamp with time zone,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  last_health_check_at timestamp with time zone,
  last_error_code text,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, provider, name)
);

create table public.ai_provider_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  provider text not null check (provider in ('openai', 'anthropic', 'gemini', 'mock')),
  enabled boolean not null default false,
  encrypted_api_key bytea,
  model text,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, provider)
);

create table public.workflows (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status public.workflow_status not null default 'draft',
  active_version_id uuid,
  execution_target jsonb not null default '{}'::jsonb
    check (jsonb_typeof(execution_target) = 'object'),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, tenant_id)
);

create table public.workflow_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  workflow_id uuid not null,
  version integer not null check (version > 0),
  schema_version integer not null check (schema_version > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  validation_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(validation_summary) = 'object'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  foreign key (workflow_id, tenant_id)
    references public.workflows (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id),
  unique (id, workflow_id, tenant_id),
  unique (workflow_id, version)
);

alter table public.workflows
  add constraint workflows_active_version_tenant_fk
  foreign key (active_version_id, id, tenant_id)
  references public.workflow_versions (id, workflow_id, tenant_id)
  deferrable initially deferred;

create table public.workflow_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  workflow_id uuid not null,
  workflow_version_id uuid not null,
  triggered_by uuid references auth.users (id) on delete set null,
  status public.run_status not null default 'pending',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  dry_run boolean not null default false,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_code text,
  error_message text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (workflow_id, tenant_id)
    references public.workflows (id, tenant_id)
    on delete restrict,
  foreign key (workflow_version_id, workflow_id, tenant_id)
    references public.workflow_versions (id, workflow_id, tenant_id)
    on delete restrict,
  unique (id, tenant_id),
  unique (tenant_id, idempotency_key),
  check (completed_at is null or started_at is not null),
  check (
    status not in ('succeeded', 'failed', 'cancelled', 'timed_out')
    or completed_at is not null
  )
);

create table public.workflow_run_steps (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  workflow_run_id uuid not null,
  node_id text not null check (char_length(node_id) between 1 and 120),
  node_type text not null check (char_length(node_type) between 1 and 120),
  status public.step_status not null default 'pending',
  attempt integer not null default 1 check (attempt > 0),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  input_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_summary) = 'object'),
  output_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(output_summary) = 'object'),
  processed_file_count integer not null default 0 check (processed_file_count >= 0),
  processed_row_count bigint not null default 0 check (processed_row_count >= 0),
  error_code text,
  error_message text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (workflow_run_id, tenant_id)
    references public.workflow_runs (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id),
  unique (workflow_run_id, node_id, attempt)
);

create table public.workflow_approvals (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workflow_version_id uuid not null,
  workflow_run_id uuid,
  requested_by uuid not null references auth.users (id) on delete restrict,
  resolved_by uuid references auth.users (id) on delete set null,
  status public.approval_status not null default 'pending',
  risk_summary jsonb not null check (jsonb_typeof(risk_summary) = 'object'),
  expires_at timestamp with time zone,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (workflow_version_id, tenant_id)
    references public.workflow_versions (id, tenant_id)
    on delete cascade,
  foreign key (workflow_run_id, tenant_id)
    references public.workflow_runs (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id),
  check ((status = 'pending') = (resolved_at is null))
);

create table public.agent_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  device_id uuid not null,
  workflow_run_id uuid not null,
  status public.job_status not null default 'pending',
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  claimed_at timestamp with time zone,
  leased_until timestamp with time zone,
  claim_token_hash bytea,
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  available_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (device_id, tenant_id)
    references public.devices (id, tenant_id)
    on delete restrict,
  foreign key (workflow_run_id, tenant_id)
    references public.workflow_runs (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id),
  unique (tenant_id, idempotency_key),
  check (
    (status in ('claimed', 'running')) = (claimed_at is not null)
    or status in ('succeeded', 'failed', 'cancelled', 'expired')
  ),
  check (leased_until is null or claimed_at is not null)
);

create table public.agent_job_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  agent_job_id uuid not null,
  event_type text not null check (char_length(event_type) between 1 and 80),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamp with time zone not null default now(),
  foreign key (agent_job_id, tenant_id)
    references public.agent_jobs (id, tenant_id)
    on delete cascade
);

create table public.column_mapping_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  normalized_source text not null check (char_length(normalized_source) between 1 and 200),
  target_field text not null check (char_length(target_field) between 1 and 200),
  synonyms text[] not null default '{}'::text[],
  confidence numeric(4, 3) not null default 1 check (confidence between 0 and 1),
  approved boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, normalized_source, target_field)
);

create table public.usage_records (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  provider text not null,
  operation text not null,
  input_units bigint not null default 0 check (input_units >= 0),
  output_units bigint not null default 0 check (output_units >= 0),
  cost_microunits bigint not null default 0 check (cost_microunits >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamp with time zone not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_device_id uuid,
  action text not null check (char_length(action) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 120),
  resource_id uuid,
  correlation_id uuid not null default extensions.gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  ip_hash bytea,
  created_at timestamp with time zone not null default now(),
  foreign key (actor_device_id, tenant_id)
    references public.devices (id, tenant_id)
    on delete set null
);

create index memberships_user_id_idx on public.memberships (user_id);
create index devices_tenant_status_idx on public.devices (tenant_id, status);
create index device_heartbeats_device_time_idx
  on public.device_heartbeats (device_id, occurred_at desc);
create index folder_aliases_tenant_device_idx on public.folder_aliases (tenant_id, device_id);
create index connections_tenant_status_idx on public.connections (tenant_id, status);
create index workflows_tenant_status_idx on public.workflows (tenant_id, status);
create index workflow_versions_workflow_created_idx
  on public.workflow_versions (workflow_id, created_at desc);
create index workflow_runs_tenant_status_created_idx
  on public.workflow_runs (tenant_id, status, created_at desc);
create index workflow_run_steps_run_status_idx
  on public.workflow_run_steps (workflow_run_id, status);
create index workflow_approvals_tenant_status_idx
  on public.workflow_approvals (tenant_id, status, created_at desc);
create index agent_jobs_device_status_available_idx
  on public.agent_jobs (device_id, status, available_at);
create index agent_jobs_lease_idx
  on public.agent_jobs (status, leased_until)
  where status in ('claimed', 'running');
create index agent_job_events_job_created_idx
  on public.agent_job_events (agent_job_id, created_at);
create index column_mapping_rules_tenant_source_idx
  on public.column_mapping_rules (tenant_id, normalized_source);
create index usage_records_tenant_time_idx
  on public.usage_records (tenant_id, occurred_at desc);
create index audit_logs_tenant_time_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_correlation_idx on public.audit_logs (correlation_id);

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'tenants',
    'memberships',
    'devices',
    'device_tokens',
    'folder_aliases',
    'connections',
    'ai_provider_settings',
    'workflows',
    'workflow_runs',
    'workflow_run_steps',
    'workflow_approvals',
    'agent_jobs',
    'column_mapping_rules'
  ]
  loop
    execute format(
      'create trigger set_%1$I_updated_at before update on public.%1$I '
      'for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create function public.protect_tenant_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.tenants
    where id = old.tenant_id
      and owner_user_id = old.user_id
  ) then
    if tg_op = 'DELETE'
      or new.tenant_id <> old.tenant_id
      or new.user_id <> old.user_id
      or new.role <> 'owner' then
      raise exception using
        errcode = '23514',
        message = 'Tenant owner membership must remain an owner';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger protect_tenant_owner_membership
  before update or delete on public.memberships
  for each row execute function public.protect_tenant_owner_membership();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
  );
$$;

create function public.has_tenant_role(
  target_tenant_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

create function public.current_tenant_role(target_tenant_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.memberships
  where tenant_id = target_tenant_id
    and user_id = auth.uid();
$$;

create function public.create_tenant(tenant_name text, tenant_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_name text := trim(tenant_name);
  normalized_slug text := lower(trim(tenant_slug));
  new_tenant_id uuid;
begin
  if caller_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if char_length(normalized_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Invalid tenant name';
  end if;

  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(normalized_slug) not between 3 and 63 then
    raise exception using errcode = '22023', message = 'Invalid tenant slug';
  end if;

  insert into public.tenants (name, slug, owner_user_id)
  values (normalized_name, normalized_slug, caller_id)
  returning id into new_tenant_id;

  insert into public.memberships (tenant_id, user_id, role)
  values (new_tenant_id, caller_id, 'owner');

  return new_tenant_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.devices enable row level security;
alter table public.device_tokens enable row level security;
alter table public.device_heartbeats enable row level security;
alter table public.folder_aliases enable row level security;
alter table public.connections enable row level security;
alter table public.ai_provider_settings enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_run_steps enable row level security;
alter table public.workflow_approvals enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.agent_job_events enable row level security;
alter table public.column_mapping_rules enable row level security;
alter table public.usage_records enable row level security;
alter table public.audit_logs enable row level security;

create policy profile_self_select
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profile_self_update
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy tenant_member_select
  on public.tenants
  for select
  to authenticated
  using (public.is_tenant_member(id));

create policy tenant_owner_update
  on public.tenants
  for update
  to authenticated
  using (public.has_tenant_role(id, array['owner']::public.app_role[]))
  with check (
    public.has_tenant_role(id, array['owner']::public.app_role[])
    and owner_user_id = auth.uid()
  );

create policy tenant_owner_delete
  on public.tenants
  for delete
  to authenticated
  using (public.has_tenant_role(id, array['owner']::public.app_role[]));

create policy membership_tenant_select
  on public.memberships
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy membership_owner_insert
  on public.memberships
  for insert
  to authenticated
  with check (public.has_tenant_role(tenant_id, array['owner']::public.app_role[]));

create policy membership_owner_update
  on public.memberships
  for update
  to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner']::public.app_role[]));

create policy membership_owner_delete
  on public.memberships
  for delete
  to authenticated
  using (
    public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and user_id <> auth.uid()
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'devices',
    'device_heartbeats',
    'folder_aliases',
    'workflows',
    'workflow_versions',
    'workflow_runs',
    'workflow_run_steps',
    'workflow_approvals',
    'agent_jobs',
    'agent_job_events',
    'column_mapping_rules'
  ]
  loop
    execute format(
      'create policy tenant_member_select on public.%I for select to authenticated '
      'using (public.is_tenant_member(tenant_id))',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['devices', 'folder_aliases']
  loop
    execute format(
      'create policy tenant_manager_insert on public.%I for insert to authenticated '
      'with check (public.has_tenant_role(tenant_id, '
      'array[''owner'', ''admin'']::public.app_role[]))',
      table_name
    );
    execute format(
      'create policy tenant_manager_update on public.%I for update to authenticated '
      'using (public.has_tenant_role(tenant_id, '
      'array[''owner'', ''admin'']::public.app_role[])) '
      'with check (public.has_tenant_role(tenant_id, '
      'array[''owner'', ''admin'']::public.app_role[]))',
      table_name
    );
    execute format(
      'create policy tenant_manager_delete on public.%I for delete to authenticated '
      'using (public.has_tenant_role(tenant_id, '
      'array[''owner'', ''admin'']::public.app_role[]))',
      table_name
    );
  end loop;
end;
$$;

create policy workflow_editor_insert
  on public.workflows
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
    and created_by = auth.uid()
  );

create policy workflow_editor_update
  on public.workflows
  for update
  to authenticated
  using (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
  )
  with check (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
  );

create policy workflow_owner_delete
  on public.workflows
  for delete
  to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[]));

create policy workflow_version_editor_insert
  on public.workflow_versions
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
    and created_by = auth.uid()
  );

create policy workflow_run_editor_insert
  on public.workflow_runs
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
    and triggered_by = auth.uid()
  );

create policy workflow_run_editor_update
  on public.workflow_runs
  for update
  to authenticated
  using (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
  )
  with check (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
  );

create policy workflow_approval_editor_insert
  on public.workflow_approvals
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
    and requested_by = auth.uid()
    and status = 'pending'
  );

create policy workflow_approval_manager_update
  on public.workflow_approvals
  for update
  to authenticated
  using (
    public.has_tenant_role(tenant_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.has_tenant_role(tenant_id, array['owner', 'admin']::public.app_role[])
    and resolved_by = auth.uid()
  );

create policy column_mapping_editor_insert
  on public.column_mapping_rules
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
    and created_by = auth.uid()
  );

create policy column_mapping_editor_update
  on public.column_mapping_rules
  for update
  to authenticated
  using (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
  )
  with check (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
  );

create policy column_mapping_editor_delete
  on public.column_mapping_rules
  for delete
  to authenticated
  using (
    public.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[]
    )
  );

create policy usage_manager_select
  on public.usage_records
  for select
  to authenticated
  using (
    public.has_tenant_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );

create policy audit_manager_select
  on public.audit_logs
  for select
  to authenticated
  using (
    public.has_tenant_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select, update, delete on public.tenants to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select on public.device_heartbeats to authenticated;
grant select, insert, update, delete on public.folder_aliases to authenticated;
grant select, insert, update, delete on public.workflows to authenticated;
grant select, insert on public.workflow_versions to authenticated;
grant select, insert, update on public.workflow_runs to authenticated;
grant select on public.workflow_run_steps to authenticated;
grant select, insert, update on public.workflow_approvals to authenticated;
grant select on public.agent_jobs, public.agent_job_events to authenticated;
grant select, insert, update, delete on public.column_mapping_rules to authenticated;
grant select on public.usage_records, public.audit_logs to authenticated;

grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.current_tenant_role(uuid) to authenticated;
grant execute on function public.create_tenant(text, text) to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
