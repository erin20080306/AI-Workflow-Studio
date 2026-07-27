-- Private, quota-controlled Website Studio image assets.
-- Model prompts never enter this table, storage metadata, or operational audit rows.

alter table public.website_specs
  drop constraint website_specs_source_check,
  add constraint website_specs_source_check
    check (source in ('asset-generation', 'direct', 'generated', 'natural-language', 'restore'));

alter table public.usage_budget_reservations
  drop constraint usage_budget_reservations_operation_check,
  add constraint usage_budget_reservations_operation_check
    check (operation in (
      'chat',
      'website_generation',
      'website_image_generation',
      'workflow_plan'
    ));

create or replace function public.reserve_tenant_usage_budget(
  actor_id uuid,
  target_tenant_id uuid,
  target_provider text,
  target_operation text,
  target_maximum_cost_microunits bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_reserved bigint;
  current_usage bigint;
  effective_plan public.billing_plans;
  period_start timestamp with time zone;
  recent_requests bigint;
  reservation_id uuid;
begin
  if not exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'USAGE_TENANT_ACCESS_REQUIRED';
  end if;
  if target_provider not in ('anthropic', 'gemini', 'mock', 'openai')
    or target_operation not in (
      'chat',
      'website_generation',
      'website_image_generation',
      'workflow_plan'
    )
    or target_maximum_cost_microunits < 0
  then
    raise exception using errcode = '22023', message = 'USAGE_RESERVATION_INVALID';
  end if;

  perform 1
  from public.tenant_subscriptions
  where tenant_id = target_tenant_id
  for update;

  update public.usage_budget_reservations
  set status = 'expired'
  where tenant_id = target_tenant_id
    and status = 'active'
    and expires_at <= now();

  effective_plan := public.effective_billing_plan(target_tenant_id);
  select current_period_start into period_start
  from public.tenant_subscriptions
  where tenant_id = target_tenant_id;
  period_start := greatest(period_start, date_trunc('month', now()));

  select count(*) into recent_requests
  from public.usage_budget_reservations
  where tenant_id = target_tenant_id
    and created_at > now() - interval '1 minute';

  if recent_requests >= effective_plan.ai_requests_per_minute then
    raise exception using errcode = 'P0001', message = 'USAGE_RATE_LIMIT_EXCEEDED';
  end if;

  select coalesce(sum(cost_microunits), 0) into current_usage
  from public.usage_records
  where tenant_id = target_tenant_id
    and occurred_at >= period_start;

  select coalesce(sum(reservation.maximum_cost_microunits), 0) into active_reserved
  from public.usage_budget_reservations as reservation
  where reservation.tenant_id = target_tenant_id
    and reservation.status = 'active'
    and reservation.expires_at > now();

  if current_usage + active_reserved + target_maximum_cost_microunits
    > effective_plan.monthly_ai_cost_budget_microunits
  then
    raise exception using errcode = 'P0001', message = 'USAGE_BUDGET_EXCEEDED';
  end if;

  insert into public.usage_budget_reservations (
    tenant_id,
    actor_user_id,
    provider,
    operation,
    maximum_cost_microunits
  )
  values (
    target_tenant_id,
    actor_id,
    target_provider,
    target_operation,
    target_maximum_cost_microunits
  )
  returning id into reservation_id;

  return reservation_id;
end;
$$;

create table public.website_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  spec_asset_id text not null check (
    char_length(spec_asset_id) between 1 and 80
    and spec_asset_id ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  provider text not null check (provider in ('gemini', 'mock', 'openai')),
  model text not null check (
    char_length(model) between 2 and 120
    and model ~ '^[A-Za-z0-9._:-]+$'
  ),
  role text not null check (role in ('hero', 'illustration', 'portrait')),
  alt text not null check (char_length(alt) between 1 and 180),
  mime_type text not null check (mime_type = 'image/png'),
  byte_size integer not null check (byte_size between 33 and 8000000),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  storage_path text not null check (
    char_length(storage_path) between 10 and 300
    and storage_path !~ '(^|/)\.\.(/|$)'
  ),
  prompt_hash text not null check (prompt_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  unique (id, tenant_id),
  unique (project_id, spec_asset_id),
  unique (storage_path),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade
);

create index website_assets_tenant_project_created_idx
  on public.website_assets (tenant_id, project_id, created_at desc);

alter table public.website_assets enable row level security;

create policy website_asset_member_select
  on public.website_assets
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_assets from public, anon, authenticated;
grant select on public.website_assets to authenticated;
grant all on public.website_assets to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'website-assets',
  'website-assets',
  false,
  8000000,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.audit_website_asset()
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
    'website_asset.generated',
    'website_asset',
    new.id,
    new.project_id,
    jsonb_build_object(
      'byteSize', new.byte_size,
      'height', new.height,
      'mimeType', new.mime_type,
      'model', new.model,
      'provider', new.provider,
      'role', new.role,
      'specAssetId', new.spec_asset_id,
      'width', new.width
    )
  );
  return new;
end;
$$;

create trigger audit_website_asset_insert
after insert on public.website_assets
for each row execute function public.audit_website_asset();

revoke all on function public.audit_website_asset() from public, anon, authenticated;
grant execute on function public.audit_website_asset() to service_role;
