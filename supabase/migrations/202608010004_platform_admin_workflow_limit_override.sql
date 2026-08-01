-- Active platform administrators need to create and run bounded workflows for
-- production acceptance and customer support even when the current Tenant has
-- reached its Store subscription allowance. Ordinary members remain subject to
-- every workflow, Run, device, and member limit.

create or replace function public.enforce_tenant_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  allowed_count integer;
  current_count bigint;
  limit_name text;
  plan public.billing_plans;
begin
  case tg_table_name
    when 'workflows' then
      if exists (select 1 from public.workflows where id = new.id) then
        return new;
      end if;
      actor_id := new.created_by;
    when 'workflow_runs' then
      if exists (
        select 1
        from public.workflow_runs
        where tenant_id = new.tenant_id
          and idempotency_key = new.idempotency_key
      ) then
        return new;
      end if;
      actor_id := new.triggered_by;
    when 'devices' then
      if exists (select 1 from public.devices where id = new.id) then
        return new;
      end if;
    when 'memberships' then
      if exists (
        select 1
        from public.memberships
        where tenant_id = new.tenant_id
          and user_id = new.user_id
      ) then
        return new;
      end if;
    else
      raise exception using
        errcode = '22023',
        message = 'Unsupported subscription limit target';
  end case;

  if actor_id is not null and exists (
    select 1
    from public.platform_admins
    where user_id = actor_id
      and active
  ) then
    return new;
  end if;

  plan := public.effective_billing_plan(new.tenant_id);

  case tg_table_name
    when 'workflows' then
      select count(*) into current_count
      from public.workflows
      where tenant_id = new.tenant_id
        and status <> 'archived';
      limit_name := 'workflow';
      allowed_count := plan.workflow_limit;
    when 'workflow_runs' then
      select count(*) into current_count
      from public.workflow_runs
      where tenant_id = new.tenant_id
        and created_at >= date_trunc('month', now());
      limit_name := 'monthly run';
      allowed_count := plan.monthly_run_limit;
    when 'devices' then
      select count(*) into current_count
      from public.devices
      where tenant_id = new.tenant_id
        and status <> 'revoked';
      limit_name := 'device';
      allowed_count := plan.device_limit;
    when 'memberships' then
      select count(*) into current_count
      from public.memberships
      where tenant_id = new.tenant_id;
      limit_name := 'member';
      allowed_count := plan.member_limit;
  end case;

  if current_count >= allowed_count then
    raise exception using
      errcode = '23514',
      message = format('%s plan %s limit reached', plan.code, limit_name);
  end if;

  return new;
end;
$$;
