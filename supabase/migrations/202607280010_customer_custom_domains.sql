-- Phase 36: globally unique, Tenant-scoped custom-domain claims.

create table public.website_custom_domains (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  hostname text not null check (
    char_length(hostname) between 4 and 253
    and hostname = lower(hostname)
    and hostname !~ '[/:*[:space:]]'
    and hostname ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
  ),
  status text not null check (
    status in ('active', 'disabled', 'failed', 'pending_dns', 'pending_ownership')
  ),
  ownership_verified boolean not null default false,
  routing_verified boolean not null default false,
  dns_records jsonb not null default '[]'::jsonb check (jsonb_typeof(dns_records) = 'array'),
  provider text not null default 'vercel' check (provider = 'vercel'),
  last_error_code text check (
    last_error_code is null
    or (
      char_length(last_error_code) between 1 and 120
      and last_error_code ~ '^[A-Z0-9_]+$'
    )
  ),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_checked_at timestamp with time zone,
  activated_at timestamp with time zone,
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  check (
    (status = 'active' and ownership_verified and routing_verified and activated_at is not null)
    or (status <> 'active' and activated_at is null)
  )
);

create unique index website_custom_domains_hostname_idx
  on public.website_custom_domains (hostname);

create index website_custom_domains_tenant_project_idx
  on public.website_custom_domains (tenant_id, project_id, created_at desc);

create index website_custom_domains_active_hostname_idx
  on public.website_custom_domains (hostname)
  where status = 'active' and ownership_verified and routing_verified;

alter table public.website_custom_domains enable row level security;

create policy website_custom_domain_member_select
  on public.website_custom_domains
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_custom_domains from public, anon, authenticated;
grant select on public.website_custom_domains to authenticated;
grant all on public.website_custom_domains to service_role;
