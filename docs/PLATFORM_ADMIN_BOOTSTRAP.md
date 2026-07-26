# Platform administrator bootstrap

Platform administration is separate from tenant roles. A user does not become a
platform administrator by registering, owning a workspace, changing profile
metadata, or knowing an administrator handle.

## Prerequisites

1. Deploy the latest Supabase migrations.
2. Register the intended administrator through the normal Auth flow and confirm
   the email address.
3. Copy that user's immutable Auth UUID from the protected Supabase dashboard.
4. Keep the service-role key and SQL editor access restricted to trusted
   operators.

Never place an email address, password, access token, or service-role key in the
repository, migration, seed, client bundle, or support message.

## Grant the first administrator

Run the following manually in the protected Supabase SQL editor. Replace both
placeholders and retain the transaction so a missing Auth user cannot create a
partial grant.

```sql
begin;

do $$
declare
  target_user_id uuid := '<AUTH_USER_UUID>';
begin
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'The verified Auth user does not exist';
  end if;

  insert into public.platform_admins (
    user_id,
    handle,
    role,
    active,
    grant_reason
  )
  values (
    target_user_id,
    '<LOWERCASE_ADMIN_HANDLE>',
    'super_admin',
    true,
    'Initial production platform administrator bootstrap'
  );
end;
$$;

commit;
```

The handle must be 3–40 lowercase letters, numbers, underscores, or hyphens. It
is an identifier, not a login secret. Authentication still uses Supabase Auth.

## Verify and revoke

Sign in normally, open `/admin`, and confirm that tenant data is available
without exposing Auth secrets. Review `platform_admin_audit_logs` after every
plan change.

To revoke access, set `active = false` using the protected SQL editor. Do not
delete audit records, reuse another person's Auth UUID, or grant platform access
through tenant membership.
