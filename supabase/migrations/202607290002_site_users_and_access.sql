-- Phase 43: site-user identity, roles, and reviewed protected-page access.
-- Site membership is distinct from AI Workflow Studio workspace membership.

create type public.website_site_role as enum ('member', 'staff', 'manager');
create type public.website_site_member_status as enum ('active', 'suspended');

create table public.website_site_access_configs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  registration_enabled boolean not null default false,
  reviewed_at timestamp with time zone not null default now(),
  reviewed_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (project_id),
  unique (id, tenant_id)
);

create trigger set_website_site_access_configs_updated_at
before update on public.website_site_access_configs
for each row execute function public.set_updated_at();

create table public.website_site_page_access (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  page_slug text not null check (
    char_length(page_slug) between 1 and 80
    and page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  required_role public.website_site_role not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (project_id, page_slug),
  unique (id, tenant_id)
);

create index website_site_page_access_project_idx
  on public.website_site_page_access (project_id, page_slug);

create trigger set_website_site_page_access_updated_at
before update on public.website_site_page_access
for each row execute function public.set_updated_at();

create table public.website_site_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null check (
    email = lower(email)
    and char_length(email) between 3 and 254
  ),
  display_name text not null check (char_length(display_name) between 1 and 120),
  role public.website_site_role not null default 'member',
  status public.website_site_member_status not null default 'active',
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (project_id, user_id),
  unique (id, tenant_id)
);

create index website_site_memberships_project_role_status_idx
  on public.website_site_memberships (project_id, role, status, created_at);

create trigger set_website_site_memberships_updated_at
before update on public.website_site_memberships
for each row execute function public.set_updated_at();

alter table public.website_site_access_configs enable row level security;
alter table public.website_site_page_access enable row level security;
alter table public.website_site_memberships enable row level security;

create policy website_site_access_config_member_select
  on public.website_site_access_configs
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy website_site_page_access_member_select
  on public.website_site_page_access
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy website_site_membership_workspace_member_select
  on public.website_site_memberships
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_site_access_configs from public, anon, authenticated;
revoke all on public.website_site_page_access from public, anon, authenticated;
revoke all on public.website_site_memberships from public, anon, authenticated;
grant select on public.website_site_access_configs to authenticated;
grant select on public.website_site_page_access to authenticated;
grant select on public.website_site_memberships to authenticated;
grant all on public.website_site_access_configs to service_role;
grant all on public.website_site_page_access to service_role;
grant all on public.website_site_memberships to service_role;

create function public.replace_website_site_access(
  target_tenant_id uuid,
  target_project_id uuid,
  actor_user_id uuid,
  registration_is_enabled boolean,
  access_rules jsonb,
  actor_email text,
  actor_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_count integer;
begin
  if jsonb_typeof(access_rules) <> 'array' then
    raise exception 'Access rules must be an array';
  end if;

  if not exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = actor_user_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only a workspace owner or administrator can review site access';
  end if;

  if not exists (
    select 1
    from public.website_projects
    where id = target_project_id
      and tenant_id = target_tenant_id
  ) then
    raise exception 'Website project not found';
  end if;

  select count(*) into protected_count
  from jsonb_array_elements(access_rules) as item
  where
    jsonb_typeof(item) <> 'object'
    or coalesce(item ->> 'pageSlug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or coalesce(item ->> 'requiredRole', '') not in ('member', 'staff', 'manager');

  if protected_count > 0 then
    raise exception 'Access rules contain unsupported values';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(access_rules)
  ) <> (
    select count(distinct item ->> 'pageSlug')
    from jsonb_array_elements(access_rules) as item
  ) then
    raise exception 'Access-rule pages must be unique';
  end if;

  insert into public.website_site_access_configs (
    tenant_id,
    project_id,
    registration_enabled,
    reviewed_at,
    reviewed_by,
    updated_by
  )
  values (
    target_tenant_id,
    target_project_id,
    registration_is_enabled,
    now(),
    actor_user_id,
    actor_user_id
  )
  on conflict (project_id) do update set
    registration_enabled = excluded.registration_enabled,
    reviewed_at = excluded.reviewed_at,
    reviewed_by = excluded.reviewed_by,
    updated_by = excluded.updated_by;

  delete from public.website_site_page_access
  where tenant_id = target_tenant_id
    and project_id = target_project_id;

  insert into public.website_site_page_access (
    tenant_id,
    project_id,
    page_slug,
    required_role,
    created_by,
    updated_by
  )
  select
    target_tenant_id,
    target_project_id,
    item ->> 'pageSlug',
    (item ->> 'requiredRole')::public.website_site_role,
    actor_user_id,
    actor_user_id
  from jsonb_array_elements(access_rules) as item;

  insert into public.website_site_memberships (
    tenant_id,
    project_id,
    user_id,
    email,
    display_name,
    role,
    status,
    created_by,
    updated_by
  )
  values (
    target_tenant_id,
    target_project_id,
    actor_user_id,
    lower(actor_email),
    actor_display_name,
    'manager',
    'active',
    actor_user_id,
    actor_user_id
  )
  on conflict (project_id, user_id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    role = 'manager',
    status = 'active',
    updated_by = actor_user_id;

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
    actor_user_id,
    'website_access.reviewed',
    'website_project',
    target_project_id,
    target_project_id,
    jsonb_build_object(
      'registrationEnabled', registration_is_enabled,
      'protectedPages', jsonb_array_length(access_rules)
    )
  );
end;
$$;

revoke all on function public.replace_website_site_access(
  uuid,
  uuid,
  uuid,
  boolean,
  jsonb,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.replace_website_site_access(
  uuid,
  uuid,
  uuid,
  boolean,
  jsonb,
  text,
  text
) to service_role;

create function public.audit_website_site_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    new.tenant_id,
    new.updated_by,
    case when tg_op = 'INSERT'
      then 'website_site_member.created'
      else 'website_site_member.updated'
    end,
    'website_site_membership',
    new.id,
    new.project_id,
    jsonb_build_object(
      'role', new.role,
      'status', new.status
    )
  );
  return new;
end;
$$;

create trigger audit_website_site_membership_change
after insert or update on public.website_site_memberships
for each row execute function public.audit_website_site_membership();
