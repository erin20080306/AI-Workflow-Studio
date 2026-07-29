-- Phase 40: server-only, non-secret website integration readiness plans.

create table public.website_integration_plans (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  kind text not null check (kind in ('analytics', 'api', 'contact', 'payment')),
  provider text not null check (
    (
      kind = 'analytics'
      and provider = 'vercel-web-analytics'
    )
    or (
      kind = 'api'
      and provider = 'supabase-edge-function'
    )
    or (
      kind = 'contact'
      and provider = 'resend-contact'
    )
    or (
      kind = 'payment'
      and provider = 'stripe-checkout'
    )
  ),
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  status text not null default 'draft' check (
    status in ('draft', 'ready_for_test', 'test_accepted')
  ),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (project_id, kind),
  check (
    (
      status = 'test_accepted'
      and confirmed_by is not null
      and confirmed_at is not null
    )
    or (
      status <> 'test_accepted'
      and confirmed_by is null
      and confirmed_at is null
    )
  )
);

create index website_integration_plans_tenant_project_idx
  on public.website_integration_plans (tenant_id, project_id, updated_at desc);

create trigger set_website_integration_plans_updated_at
before update on public.website_integration_plans
for each row execute function public.set_updated_at();

alter table public.website_integration_plans enable row level security;

revoke all on public.website_integration_plans from public, anon, authenticated;
grant all on public.website_integration_plans to service_role;
