-- Minimal Supabase Auth and role surface for migration tests on stock PostgreSQL.

create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

-- Minimal private Storage bucket metadata used by immutable migration tests.
-- Hosted Supabase provides the complete storage schema and API implementation.
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to service_role;
grant select on storage.buckets to service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
