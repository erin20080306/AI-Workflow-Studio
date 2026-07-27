-- Raise the bounded UTF-8 assistant source limit from 64 KiB to 1 MiB.
-- Model context remains independently capped by the server-side tool registry.

do $$
declare
  legacy_constraint record;
begin
  for legacy_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.ai_attachments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%65536%'
  loop
    execute format(
      'alter table public.ai_attachments drop constraint %I',
      legacy_constraint.conname
    );
  end loop;
end;
$$;

alter table public.ai_attachments
  add constraint ai_attachments_byte_size_check
    check (byte_size between 1 and 1048576),
  add constraint ai_attachments_content_check
    check (
      octet_length(content) = byte_size
      and octet_length(content) <= 1048576
    );
