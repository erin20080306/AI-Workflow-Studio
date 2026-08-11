-- Phase 47: structured storefront orders with a fulfillment lifecycle.
-- Orders are captured from the public checkout, stored Tenant-scoped with
-- server-authoritative pricing, and their status is only changed through the
-- validated website admin route. Prices are never trusted from the browser.

create table public.website_storefront_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  page_slug text not null check (
    char_length(page_slug) between 1 and 80
    and page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  buyer_name text not null check (char_length(buyer_name) between 1 and 120),
  buyer_email text not null check (char_length(buyer_email) between 3 and 254),
  items jsonb not null,
  currency text not null default '' check (char_length(currency) <= 8),
  subtotal numeric not null default 0 check (subtotal >= 0 and subtotal <= 1000000000000),
  item_count integer not null check (item_count between 1 and 50000),
  status text not null default 'pending' check (
    status in ('pending', 'paid', 'shipped', 'completed', 'cancelled')
  ),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (id, tenant_id),
  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50)
);

create index website_storefront_orders_project_status_created_idx
  on public.website_storefront_orders (project_id, status, created_at desc);

create index website_storefront_orders_rate_limit_idx
  on public.website_storefront_orders (project_id, lower(buyer_email), created_at desc);

create trigger set_website_storefront_orders_updated_at
before update on public.website_storefront_orders
for each row execute function public.set_updated_at();

alter table public.website_storefront_orders enable row level security;

create policy website_storefront_order_member_select
  on public.website_storefront_orders
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_storefront_orders from public, anon, authenticated;
grant select on public.website_storefront_orders to authenticated;
grant all on public.website_storefront_orders to service_role;

create function public.audit_website_storefront_order()
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
    case when tg_op = 'INSERT'
      then 'website_order.received'
      else 'website_order.status_updated'
    end,
    'website_storefront_order',
    new.id,
    new.project_id,
    jsonb_build_object(
      'pageSlug', new.page_slug,
      'status', new.status,
      'itemCount', new.item_count
    )
  );
  return new;
end;
$$;

create trigger audit_website_storefront_order_change
after insert or update of status on public.website_storefront_orders
for each row execute function public.audit_website_storefront_order();
