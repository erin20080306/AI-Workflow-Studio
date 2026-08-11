-- Phase 47: live storefront inventory ledger.
-- Tracks units sold per product SKU so a published storefront can show
-- "remaining = published stock - sold" and reject oversell at checkout. The
-- ledger is only mutated by validated server routes (service_role).

create table public.website_inventory (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  sku text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$'),
  sold integer not null default 0 check (sold >= 0 and sold <= 1000000000),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  foreign key (project_id, tenant_id)
    references public.website_projects (id, tenant_id)
    on delete cascade,
  unique (project_id, sku)
);

create trigger set_website_inventory_updated_at
before update on public.website_inventory
for each row execute function public.set_updated_at();

alter table public.website_inventory enable row level security;

create policy website_inventory_member_select
  on public.website_inventory
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.website_inventory from public, anon, authenticated;
grant select on public.website_inventory to authenticated;
grant all on public.website_inventory to service_role;

-- Atomically reserve stock for every line of one order, or fail the whole order.
-- Each line carries its own published stock limit; the function raises when any
-- line would exceed remaining stock, rolling back all reservations in the call.
create function public.website_reserve_order_stock(
  p_tenant uuid,
  p_project uuid,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_sku text;
  v_qty integer;
  v_limit integer;
begin
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sku := v_line->>'sku';
    v_qty := (v_line->>'quantity')::integer;
    v_limit := (v_line->>'stock')::integer;
    if v_sku is null or v_qty < 1 or v_limit < 0 or v_qty > v_limit then
      raise exception 'insufficient stock for %', v_sku using errcode = '23514';
    end if;
    insert into public.website_inventory (tenant_id, project_id, sku, sold)
      values (p_tenant, p_project, v_sku, v_qty)
      on conflict (project_id, sku) do update
        set sold = public.website_inventory.sold + v_qty
        where public.website_inventory.sold + v_qty <= v_limit;
    if not found then
      raise exception 'insufficient stock for %', v_sku using errcode = '23514';
    end if;
  end loop;
end;
$$;

revoke all on function public.website_reserve_order_stock(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.website_reserve_order_stock(uuid, uuid, jsonb)
  to service_role;

-- Return reserved units to stock (e.g. when an order is cancelled).
create function public.website_release_order_stock(
  p_tenant uuid,
  p_project uuid,
  p_sku text,
  p_qty integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.website_inventory
    set sold = greatest(0, sold - p_qty)
    where tenant_id = p_tenant and project_id = p_project and sku = p_sku;
end;
$$;

revoke all on function public.website_release_order_stock(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.website_release_order_stock(uuid, uuid, text, integer)
  to service_role;
