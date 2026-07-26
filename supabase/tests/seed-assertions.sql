do $$
begin
  if (select count(*) from public.tenants where slug = 'development-workspace') <> 1 then
    raise exception 'development tenant seed is not idempotent';
  end if;

  if not exists (
    select 1
    from public.memberships
    where tenant_id = '00000000-0000-0000-0000-000000001000'
      and user_id = '10000000-0000-0000-0000-000000000010'
      and role = 'owner'
  ) then
    raise exception 'development owner membership seed is missing';
  end if;

  if (select count(*) from public.devices where name = 'Mock Desktop Agent') <> 1 then
    raise exception 'development device seed is not idempotent';
  end if;

  if (
    select count(*)
    from public.workflows
    where name = 'Mock Excel consolidation'
  ) <> 1 then
    raise exception 'development workflow seed is not idempotent';
  end if;
end;
$$;
