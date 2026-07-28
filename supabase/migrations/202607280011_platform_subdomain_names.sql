-- Phase 36 replacement: customer-selected labels on the existing platform wildcard.

create function public.publish_website_with_slug(
  actor_user_id uuid,
  target_tenant_id uuid,
  target_project_id uuid,
  target_spec_version integer,
  requested_slug text
)
returns public.website_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication public.website_publications;
begin
  if target_spec_version < 1 then
    raise exception 'WEBSITE_INVALID_VERSION';
  end if;

  if requested_slug is null
    or char_length(requested_slug) not between 3 and 63
    or requested_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or requested_slug = any (
      array[
        'admin',
        'api',
        'app',
        'auth',
        'billing',
        'cdn',
        'dashboard',
        'docs',
        'help',
        'login',
        'mail',
        'register',
        'sites',
        'static',
        'status',
        'support',
        'www'
      ]
    )
  then
    raise exception 'WEBSITE_SITE_SLUG_INVALID';
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

  perform 1
  from public.website_projects
  where id = target_project_id
    and tenant_id = target_tenant_id
    and status = 'draft'
  for update;

  if not found then
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

  if exists (
    select 1
    from public.website_publications
    where slug = requested_slug
      and status = 'active'
      and project_id <> target_project_id
  ) then
    raise exception 'WEBSITE_SITE_SLUG_UNAVAILABLE';
  end if;

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
    requested_slug,
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
      'slug', requested_slug,
      'version', target_spec_version
    )
  );

  return publication;
end;
$$;

revoke all on function public.publish_website_with_slug(uuid, uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.publish_website_with_slug(uuid, uuid, uuid, integer, text)
  to service_role;
