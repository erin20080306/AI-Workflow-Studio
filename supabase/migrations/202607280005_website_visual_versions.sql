-- Reversible Website Studio editing metadata.
-- Every edit creates a new validated website_specs row; prior specs stay immutable.

alter table public.website_specs
  add column version_name text not null default 'Initial generation'
    check (char_length(version_name) between 1 and 80),
  add column change_summary text not null default ''
    check (char_length(change_summary) <= 300),
  add column source text not null default 'generated'
    check (source in ('direct', 'generated', 'natural-language', 'restore')),
  add column parent_version_number integer
    check (parent_version_number is null or parent_version_number > 0),
  add column restored_from_version integer
    check (restored_from_version is null or restored_from_version > 0);

alter table public.website_specs
  add constraint website_specs_parent_version_fk
    foreign key (project_id, parent_version_number)
    references public.website_specs (project_id, version_number)
    on delete restrict,
  add constraint website_specs_restored_version_fk
    foreign key (project_id, restored_from_version)
    references public.website_specs (project_id, version_number)
    on delete restrict;

create index website_specs_tenant_project_created_idx
  on public.website_specs (tenant_id, project_id, created_at desc);

create function public.audit_website_spec_version()
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
    'website_spec.' || new.source,
    'website_spec',
    new.project_id,
    new.project_id,
    jsonb_build_object(
      'attempts', new.attempts,
      'model', new.model,
      'parentVersion', new.parent_version_number,
      'provider', new.provider,
      'restoredFromVersion', new.restored_from_version,
      'schemaVersion', new.schema_version,
      'source', new.source,
      'version', new.version_number,
      'versionName', new.version_name
    )
  );
  return new;
end;
$$;

create trigger audit_website_spec_version_insert
after insert on public.website_specs
for each row execute function public.audit_website_spec_version();
