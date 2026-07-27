-- Versioned, tenant-isolated Website Specs generated from validated briefs.
-- Specs contain only registered component JSON; no executable source is stored.

create table public.website_specs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  version_number integer not null default 1 check (version_number > 0),
  schema_version smallint not null check (schema_version = 1),
  provider text not null check (provider in ('anthropic', 'gemini', 'mock', 'openai')),
  model text not null check (char_length(model) between 1 and 120),
  attempts smallint not null check (attempts between 1 and 3),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  unique (id, tenant_id),
  unique (project_id, version_number),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade
);

create index website_specs_tenant_project_version_idx
  on public.website_specs (tenant_id, project_id, version_number desc);

alter table public.website_specs enable row level security;

create policy website_spec_member_select
  on public.website_specs
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_specs from public, anon, authenticated;
grant select on public.website_specs to authenticated;
grant all on public.website_specs to service_role;
