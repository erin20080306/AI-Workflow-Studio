-- Tenant-isolated Website Studio briefs.
-- All mutations remain behind authenticated server routes using service-role access.

create table public.website_projects (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null check (
    char_length(slug) between 2 and 80
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  status text not null default 'briefing'
    check (status in ('briefing', 'draft', 'archived')),
  brief jsonb not null default '{}'::jsonb
    check (jsonb_typeof(brief) = 'object'),
  brief_progress smallint not null default 0
    check (brief_progress between 0 and 6),
  brief_completed_at timestamp with time zone,
  draft_created_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, slug),
  check (
    (brief_progress = 6) = (brief_completed_at is not null)
  ),
  check (
    status <> 'draft'
    or (
      brief_progress = 6
      and brief_completed_at is not null
      and draft_created_at is not null
    )
  )
);

create index website_projects_tenant_status_updated_idx
  on public.website_projects (tenant_id, status, updated_at desc);

create trigger set_website_projects_updated_at
before update on public.website_projects
for each row execute function public.set_updated_at();

alter table public.website_projects enable row level security;

create policy website_project_member_select
  on public.website_projects
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_projects from public, anon, authenticated;
grant select on public.website_projects to authenticated;
grant all on public.website_projects to service_role;
