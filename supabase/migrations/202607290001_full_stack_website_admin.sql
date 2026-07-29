-- Phase 42: safe full-stack website administration.
-- Website content and visitor submissions remain Tenant-scoped and all
-- mutations stay behind validated server routes.

create table public.website_content_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  content_key text not null check (
    char_length(content_key) between 2 and 80
    and content_key ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  page_slug text not null check (
    char_length(page_slug) between 1 and 80
    and page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 8000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id),
  unique (project_id, content_key)
);

create index website_content_entries_project_page_status_idx
  on public.website_content_entries (project_id, page_slug, status, updated_at desc);

create trigger set_website_content_entries_updated_at
before update on public.website_content_entries
for each row execute function public.set_updated_at();

alter table public.website_content_entries enable row level security;

create policy website_content_entry_member_select
  on public.website_content_entries
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_content_entries from public, anon, authenticated;
grant select on public.website_content_entries to authenticated;
grant all on public.website_content_entries to service_role;

create table public.website_form_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  form_key text not null default 'contact' check (form_key = 'contact'),
  page_slug text not null check (
    char_length(page_slug) between 1 and 80
    and page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  subject text not null default '' check (char_length(subject) <= 160),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id)
);

create index website_form_submissions_project_status_created_idx
  on public.website_form_submissions (project_id, status, created_at desc);

create index website_form_submissions_rate_limit_idx
  on public.website_form_submissions (project_id, lower(email), created_at desc);

create trigger set_website_form_submissions_updated_at
before update on public.website_form_submissions
for each row execute function public.set_updated_at();

alter table public.website_form_submissions enable row level security;

create policy website_form_submission_member_select
  on public.website_form_submissions
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_form_submissions from public, anon, authenticated;
grant select on public.website_form_submissions to authenticated;
grant all on public.website_form_submissions to service_role;

create function public.audit_website_content_entry()
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
      then 'website_content.created'
      else 'website_content.updated'
    end,
    'website_content_entry',
    new.id,
    new.project_id,
    jsonb_build_object(
      'contentKey', new.content_key,
      'pageSlug', new.page_slug,
      'status', new.status
    )
  );
  return new;
end;
$$;

create trigger audit_website_content_entry_change
after insert or update on public.website_content_entries
for each row execute function public.audit_website_content_entry();

create function public.audit_website_form_submission()
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
    null,
    'website_form.received',
    'website_form_submission',
    new.id,
    new.project_id,
    jsonb_build_object(
      'formKey', new.form_key,
      'pageSlug', new.page_slug,
      'status', new.status
    )
  );
  return new;
end;
$$;

create trigger audit_website_form_submission_insert
after insert on public.website_form_submissions
for each row execute function public.audit_website_form_submission();
