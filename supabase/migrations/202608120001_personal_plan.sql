-- Add the Personal (NT$99, single-device) plan and tighten the Free tier
-- catalog fields to match the updated entitlements in packages/shared plans.

alter table public.billing_plans drop constraint billing_plans_code_check;
alter table public.billing_plans
  add constraint billing_plans_code_check
  check (code in ('free', 'personal', 'pro', 'team', 'business'));

-- Open display_order 2 for Personal without colliding with the unique index:
-- shift the existing paid plans to a temporary high range, then reseat them.
update public.billing_plans set display_order = display_order + 10 where display_order >= 2;

insert into public.billing_plans (
  code,
  name_zh_hant,
  name_en,
  monthly_price_twd,
  yearly_price_twd,
  workflow_limit,
  monthly_run_limit,
  device_limit,
  member_limit,
  audit_retention_days,
  display_order
)
values ('personal', '個人版', 'Personal', 99, 990, 10, 800, 1, 1, 14, 2);

update public.billing_plans set display_order = 3 where code = 'pro';
update public.billing_plans set display_order = 4 where code = 'team';
update public.billing_plans set display_order = 5 where code = 'business';

-- Set Personal's AI/tier catalog fields (columns added by later migrations have
-- defaults, so the insert above left them at Free-tier values). DB-level usage
-- enforcement reads billing_plans, so these must match packages/shared plans.
update public.billing_plans
  set
    monthly_ai_cost_budget_microunits = 50000000,
    ai_requests_per_minute = 5,
    monthly_source_bytes = 209715200,
    monthly_tool_call_limit = 800,
    maximum_ai_model_tier = 'standard',
    maximum_ai_request_cost_microunits = 5000000
  where code = 'personal';

-- Tighten the Free tier catalog to match the updated Free entitlements.
update public.billing_plans
  set
    workflow_limit = 2,
    monthly_run_limit = 50,
    monthly_ai_cost_budget_microunits = 5000000,
    monthly_source_bytes = 10485760,
    monthly_tool_call_limit = 50
  where code = 'free';
