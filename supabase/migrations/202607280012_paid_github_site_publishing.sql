-- Phase 38: revocable GitHub App connections and idempotent paid website pushes.

create table public.website_github_connections (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  installation_id bigint not null check (installation_id > 0),
  account_login text not null check (char_length(account_login) between 1 and 100),
  account_type text not null check (account_type in ('Organization', 'User')),
  connected_by uuid not null references auth.users (id) on delete restrict,
  connected_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  revoked_at timestamp with time zone,
  unique (id, tenant_id)
);

create unique index website_github_connections_active_installation_idx
  on public.website_github_connections (tenant_id, installation_id)
  where revoked_at is null;

create index website_github_connections_tenant_time_idx
  on public.website_github_connections (tenant_id, connected_at desc);

create trigger set_website_github_connections_updated_at
before update on public.website_github_connections
for each row execute function public.set_updated_at();

create table public.website_github_publications (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  spec_version integer not null check (spec_version > 0),
  connection_id uuid not null,
  repository_id bigint not null check (repository_id > 0),
  repository_full_name text not null check (
    char_length(repository_full_name) between 3 and 220
    and repository_full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
  ),
  branch text not null check (
    char_length(branch) between 22 and 96
    and branch ~ '^ai-workflow-studio/[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  idempotency_key uuid not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  tree_sha text check (tree_sha is null or tree_sha ~ '^[a-f0-9]{40}$'),
  commit_sha text check (commit_sha is null or commit_sha ~ '^[a-f0-9]{40}$'),
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  started_by uuid not null references auth.users (id) on delete restrict,
  started_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  foreign key (project_id, spec_version)
    references public.website_specs (project_id, version_number)
    on delete restrict,
  foreign key (connection_id, tenant_id)
    references public.website_github_connections (id, tenant_id)
    on delete restrict,
  unique (tenant_id, idempotency_key),
  check (
    (status = 'pending' and completed_at is null and commit_sha is null and tree_sha is null)
    or (
      status = 'succeeded'
      and completed_at is not null
      and commit_sha is not null
      and tree_sha is not null
      and error_code is null
    )
    or (
      status = 'failed'
      and completed_at is not null
      and commit_sha is null
      and tree_sha is null
      and error_code is not null
    )
  )
);

create index website_github_publications_project_time_idx
  on public.website_github_publications (tenant_id, project_id, started_at desc);

alter table public.website_github_connections enable row level security;
alter table public.website_github_publications enable row level security;

revoke all on public.website_github_connections from public, anon, authenticated;
revoke all on public.website_github_publications from public, anon, authenticated;
grant all on public.website_github_connections to service_role;
grant all on public.website_github_publications to service_role;
