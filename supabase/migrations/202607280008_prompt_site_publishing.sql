-- Phase 30: private prompt conversations and immutable, explicitly approved site releases.

create table public.website_brief_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  role text not null check (role in ('assistant', 'user')),
  kind text not null check (kind in ('prompt', 'question', 'answer', 'ready')),
  step text check (
    step is null
    or step in ('purpose', 'audience', 'pages', 'brandDirection', 'content', 'callsToAction')
  ),
  body text not null check (char_length(body) between 1 and 6000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade
);

create index website_brief_messages_tenant_project_created_idx
  on public.website_brief_messages (tenant_id, project_id, created_at, id);

alter table public.website_brief_messages enable row level security;

create policy website_brief_message_member_select
  on public.website_brief_messages
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_brief_messages from public, anon, authenticated;
grant select on public.website_brief_messages to authenticated;
grant all on public.website_brief_messages to service_role;

create function public.audit_website_brief_message()
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
    new.created_by,
    'website_brief.' || new.kind,
    'website_project',
    new.project_id,
    new.project_id,
    jsonb_build_object(
      'kind', new.kind,
      'role', new.role,
      'step', new.step
    )
  );
  return new;
end;
$$;

create trigger audit_website_brief_message_insert
after insert on public.website_brief_messages
for each row execute function public.audit_website_brief_message();

create table public.website_publications (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  spec_version integer not null check (spec_version > 0),
  slug text not null check (
    char_length(slug) between 3 and 96
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  status text not null default 'active' check (status in ('active', 'superseded')),
  published_by uuid not null references auth.users (id) on delete restrict,
  published_at timestamp with time zone not null default now(),
  superseded_at timestamp with time zone,
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  foreign key (project_id, spec_version)
    references public.website_specs (project_id, version_number)
    on delete restrict,
  check (
    (status = 'active' and superseded_at is null)
    or (status = 'superseded' and superseded_at is not null)
  )
);

create unique index website_publications_one_active_project_idx
  on public.website_publications (project_id)
  where status = 'active';

create unique index website_publications_one_active_slug_idx
  on public.website_publications (slug)
  where status = 'active';

create index website_publications_tenant_project_time_idx
  on public.website_publications (tenant_id, project_id, published_at desc);

alter table public.website_publications enable row level security;

create policy website_publication_member_select
  on public.website_publications
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_publications from public, anon, authenticated;
grant select on public.website_publications to authenticated;
grant all on public.website_publications to service_role;

create function public.publish_website(
  actor_user_id uuid,
  target_tenant_id uuid,
  target_project_id uuid,
  target_spec_version integer
)
returns public.website_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_slug text;
  public_slug text;
  publication public.website_publications;
begin
  if target_spec_version < 1 then
    raise exception 'WEBSITE_INVALID_VERSION';
  end if;

  if not exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = actor_user_id
      and role <> 'viewer'
  ) then
    raise exception 'WEBSITE_PUBLISH_FORBIDDEN';
  end if;

  select slug
    into project_slug
  from public.website_projects
  where id = target_project_id
    and tenant_id = target_tenant_id
    and status = 'draft'
  for update;

  if project_slug is null then
    raise exception 'WEBSITE_PROJECT_NOT_PUBLISHABLE';
  end if;

  if not exists (
    select 1
    from public.website_specs
    where project_id = target_project_id
      and tenant_id = target_tenant_id
      and version_number = target_spec_version
  ) then
    raise exception 'WEBSITE_SPEC_NOT_FOUND';
  end if;

  public_slug := project_slug || '-' || substr(replace(target_project_id::text, '-', ''), 1, 8);

  update public.website_publications
  set
    status = 'superseded',
    superseded_at = now()
  where project_id = target_project_id
    and tenant_id = target_tenant_id
    and status = 'active';

  insert into public.website_publications (
    tenant_id,
    project_id,
    spec_version,
    slug,
    published_by
  )
  values (
    target_tenant_id,
    target_project_id,
    target_spec_version,
    public_slug,
    actor_user_id
  )
  returning * into publication;

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
    'website_publication.published',
    'website_publication',
    publication.id,
    target_project_id,
    jsonb_build_object(
      'projectId', target_project_id,
      'slug', public_slug,
      'version', target_spec_version
    )
  );

  return publication;
end;
$$;

revoke all on function public.publish_website(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.publish_website(uuid, uuid, uuid, integer)
  to service_role;
