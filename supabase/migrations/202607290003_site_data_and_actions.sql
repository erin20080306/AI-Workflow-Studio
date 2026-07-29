-- Phase 44: schema-bound site collections, forms, and safe server actions.
-- All mutations remain behind validated server routes. No executable customer
-- code, arbitrary SQL, or provider credential is stored or executed here.

create type public.website_data_action_type as enum (
  'create-record',
  'update-record',
  'delete-record'
);

create type public.website_data_workflow_trigger as enum (
  'none',
  'audit-record-created'
);

create table public.website_data_collections (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  collection_key text not null check (
    char_length(collection_key) between 2 and 48
    and collection_key ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  name text not null check (char_length(name) between 1 and 80),
  fields jsonb not null check (
    jsonb_typeof(fields) = 'array'
    and jsonb_array_length(fields) between 1 and 24
    and octet_length(fields::text) <= 32000
  ),
  reviewed_at timestamp with time zone not null default now(),
  reviewed_by uuid not null references auth.users (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (project_id, collection_key),
  unique (id, tenant_id)
);

create index website_data_collections_project_idx
  on public.website_data_collections (project_id, updated_at desc);

create trigger set_website_data_collections_updated_at
before update on public.website_data_collections
for each row execute function public.set_updated_at();

create table public.website_data_forms (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  collection_id uuid not null,
  form_key text not null check (
    char_length(form_key) between 2 and 48
    and form_key ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  page_slug text not null check (
    char_length(page_slug) between 1 and 80
    and page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  title text not null check (char_length(title) between 1 and 120),
  field_keys jsonb not null check (
    jsonb_typeof(field_keys) = 'array'
    and jsonb_array_length(field_keys) between 1 and 24
    and octet_length(field_keys::text) <= 4000
  ),
  submit_label text not null check (char_length(submit_label) between 1 and 60),
  success_message text not null check (char_length(success_message) between 1 and 240),
  required_role public.website_site_role,
  workflow_trigger public.website_data_workflow_trigger not null default 'none',
  active boolean not null default false,
  reviewed_at timestamp with time zone not null default now(),
  reviewed_by uuid not null references auth.users (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  foreign key (collection_id, tenant_id)
    references public.website_data_collections (id, tenant_id)
    on delete cascade,
  unique (project_id, form_key),
  unique (id, tenant_id)
);

create index website_data_forms_project_page_active_idx
  on public.website_data_forms (project_id, page_slug, active, updated_at desc);

create trigger set_website_data_forms_updated_at
before update on public.website_data_forms
for each row execute function public.set_updated_at();

create table public.website_data_records (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  collection_id uuid not null,
  owner_site_user_id uuid references auth.users (id) on delete set null,
  values jsonb not null check (
    jsonb_typeof(values) = 'object'
    and octet_length(values::text) <= 64000
  ),
  version integer not null default 1 check (version > 0),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  foreign key (collection_id, tenant_id)
    references public.website_data_collections (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id)
);

create index website_data_records_collection_created_idx
  on public.website_data_records (collection_id, created_at desc);

create index website_data_records_owner_idx
  on public.website_data_records (project_id, owner_site_user_id, updated_at desc)
  where owner_site_user_id is not null;

create trigger set_website_data_records_updated_at
before update on public.website_data_records
for each row execute function public.set_updated_at();

create table public.website_data_action_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  collection_id uuid not null,
  record_id uuid,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_site_user_id uuid references auth.users (id) on delete set null,
  action public.website_data_action_type not null,
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  workflow_trigger public.website_data_workflow_trigger not null default 'none',
  status text not null default 'succeeded' check (status = 'succeeded'),
  result_snapshot jsonb not null check (
    jsonb_typeof(result_snapshot) = 'object'
    and octet_length(result_snapshot::text) <= 64000
  ),
  created_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  foreign key (collection_id, tenant_id)
    references public.website_data_collections (id, tenant_id)
    on delete cascade,
  unique (project_id, idempotency_key),
  unique (id, tenant_id)
);

create index website_data_action_runs_project_created_idx
  on public.website_data_action_runs (project_id, created_at desc);

alter table public.website_data_collections enable row level security;
alter table public.website_data_forms enable row level security;
alter table public.website_data_records enable row level security;
alter table public.website_data_action_runs enable row level security;

create policy website_data_collections_member_select
  on public.website_data_collections
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy website_data_forms_member_select
  on public.website_data_forms
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy website_data_records_member_select
  on public.website_data_records
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy website_data_action_runs_member_select
  on public.website_data_action_runs
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_data_collections from public, anon, authenticated;
revoke all on public.website_data_forms from public, anon, authenticated;
revoke all on public.website_data_records from public, anon, authenticated;
revoke all on public.website_data_action_runs from public, anon, authenticated;
grant select on public.website_data_collections to authenticated;
grant select on public.website_data_forms to authenticated;
grant select on public.website_data_records to authenticated;
grant select on public.website_data_action_runs to authenticated;
grant all on public.website_data_collections to service_role;
grant all on public.website_data_forms to service_role;
grant all on public.website_data_records to service_role;
grant all on public.website_data_action_runs to service_role;

create function public.enforce_website_data_definition_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  quota_limit integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.project_id::text || ':' || tg_table_name, 44)
  );
  quota_limit := 12;
  if tg_table_name = 'website_data_collections' then
    select count(*) into current_count
    from public.website_data_collections
    where project_id = new.project_id;
  elsif tg_table_name = 'website_data_forms' then
    select count(*) into current_count
    from public.website_data_forms
    where project_id = new.project_id;
  else
    raise exception 'Unsupported website data definition table';
  end if;
  if current_count >= quota_limit then
    raise exception 'Website data definition quota exceeded';
  end if;
  return new;
end;
$$;

create trigger enforce_website_data_collection_quota
before insert on public.website_data_collections
for each row execute function public.enforce_website_data_definition_quota();

create trigger enforce_website_data_form_quota
before insert on public.website_data_forms
for each row execute function public.enforce_website_data_definition_quota();

create function public.execute_website_data_action(
  target_tenant_id uuid,
  target_project_id uuid,
  target_collection_key text,
  action_name public.website_data_action_type,
  action_idempotency_key uuid,
  action_values jsonb,
  workspace_actor_user_id uuid default null,
  site_actor_user_id uuid default null,
  target_record_id uuid default null,
  target_expected_version integer default null,
  deletion_confirmed boolean default false,
  action_workflow_trigger public.website_data_workflow_trigger default 'none'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_hash text;
  collection_row public.website_data_collections%rowtype;
  current_record public.website_data_records%rowtype;
  existing_action public.website_data_action_runs%rowtype;
  result_record public.website_data_records%rowtype;
  result_value jsonb;
  record_count integer;
begin
  if action_values is null or jsonb_typeof(action_values) <> 'object' then
    raise exception 'Action values must be an object';
  end if;
  if octet_length(action_values::text) > 64000 then
    raise exception 'Action values exceed the record boundary';
  end if;
  if action_name <> 'create-record' and target_record_id is null then
    raise exception 'A target record is required';
  end if;
  if action_name = 'delete-record' and not deletion_confirmed then
    raise exception 'Deletion requires explicit confirmation';
  end if;
  if action_name <> 'create-record' and action_workflow_trigger <> 'none' then
    raise exception 'Only create actions may emit an allowlisted workflow trigger';
  end if;

  action_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        action_name::text || ':' ||
        target_collection_key || ':' ||
        coalesce(target_record_id::text, '') || ':' ||
        coalesce(target_expected_version::text, '') || ':' ||
        action_values::text || ':' ||
        action_workflow_trigger::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into existing_action
  from public.website_data_action_runs
  where project_id = target_project_id
    and idempotency_key = action_idempotency_key;

  if found then
    if existing_action.tenant_id <> target_tenant_id
      or existing_action.request_hash <> action_hash
    then
      raise exception 'Idempotency key is already bound to another action';
    end if;
    return existing_action.result_snapshot;
  end if;

  if not exists (
    select 1
    from public.website_projects
    where id = target_project_id
      and tenant_id = target_tenant_id
  ) then
    raise exception 'Website project not found';
  end if;

  if workspace_actor_user_id is not null and not exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = workspace_actor_user_id
      and role in ('owner', 'admin', 'editor')
  ) then
    raise exception 'Workspace actor cannot mutate website data';
  end if;

  if site_actor_user_id is not null and not exists (
    select 1
    from public.website_site_memberships
    where tenant_id = target_tenant_id
      and project_id = target_project_id
      and user_id = site_actor_user_id
      and status = 'active'
  ) then
    raise exception 'Site actor cannot mutate website data';
  end if;

  select * into collection_row
  from public.website_data_collections
  where tenant_id = target_tenant_id
    and project_id = target_project_id
    and collection_key = target_collection_key;
  if not found then
    raise exception 'Website collection not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_project_id::text || ':records', 44)
  );

  if action_name = 'create-record' then
    select count(*) into record_count
    from public.website_data_records
    where project_id = target_project_id;
    if record_count >= 5000 then
      raise exception 'Website record quota exceeded';
    end if;
    insert into public.website_data_records (
      tenant_id,
      project_id,
      collection_id,
      owner_site_user_id,
      values
    )
    values (
      target_tenant_id,
      target_project_id,
      collection_row.id,
      site_actor_user_id,
      action_values
    )
    returning * into result_record;
  else
    select * into current_record
    from public.website_data_records
    where tenant_id = target_tenant_id
      and project_id = target_project_id
      and collection_id = collection_row.id
      and id = target_record_id
    for update;
    if not found then
      raise exception 'Website record not found';
    end if;
    if target_expected_version is null
      or current_record.version <> target_expected_version
    then
      raise exception 'Website record version conflict';
    end if;
    if action_name = 'update-record' then
      update public.website_data_records
      set
        values = action_values,
        version = version + 1
      where id = current_record.id
      returning * into result_record;
    else
      result_record := current_record;
      delete from public.website_data_records where id = current_record.id;
    end if;
  end if;

  result_value := jsonb_build_object(
    'collectionKey', collection_row.collection_key,
    'createdAt', result_record.created_at,
    'id', result_record.id,
    'ownerSiteUserId', result_record.owner_site_user_id,
    'projectId', result_record.project_id,
    'tenantId', result_record.tenant_id,
    'updatedAt', result_record.updated_at,
    'values', result_record.values,
    'version', result_record.version
  );

  insert into public.website_data_action_runs (
    tenant_id,
    project_id,
    collection_id,
    record_id,
    actor_user_id,
    actor_site_user_id,
    action,
    idempotency_key,
    request_hash,
    workflow_trigger,
    result_snapshot
  )
  values (
    target_tenant_id,
    target_project_id,
    collection_row.id,
    result_record.id,
    workspace_actor_user_id,
    site_actor_user_id,
    action_name,
    action_idempotency_key,
    action_hash,
    action_workflow_trigger,
    result_value
  );

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    correlation_id,
    metadata
  )
  values (
    target_tenant_id,
    workspace_actor_user_id,
    case action_name
      when 'create-record' then 'website_data.record_created'
      when 'update-record' then 'website_data.record_updated'
      else 'website_data.record_deleted'
    end,
    'website_data_record',
    result_record.id,
    target_project_id,
    jsonb_build_object(
      'collectionKey', collection_row.collection_key,
      'siteUserAuthenticated', site_actor_user_id is not null,
      'version', result_record.version,
      'workflowTrigger', action_workflow_trigger
    )
  );

  return result_value;
end;
$$;

revoke all on function public.execute_website_data_action(
  uuid,
  uuid,
  text,
  public.website_data_action_type,
  uuid,
  jsonb,
  uuid,
  uuid,
  uuid,
  integer,
  boolean,
  public.website_data_workflow_trigger
) from public, anon, authenticated;

grant execute on function public.execute_website_data_action(
  uuid,
  uuid,
  text,
  public.website_data_action_type,
  uuid,
  jsonb,
  uuid,
  uuid,
  uuid,
  integer,
  boolean,
  public.website_data_workflow_trigger
) to service_role;
