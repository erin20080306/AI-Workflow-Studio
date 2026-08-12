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

-- Tighten the Free tier catalog (AI budget, source bytes, tool calls, and the
-- model tier live in packages/shared plans; billing_plans holds these fields).
update public.billing_plans
  set workflow_limit = 2, monthly_run_limit = 50
  where code = 'free';
