-- Private AI conversation images plus an explicit tenant-scoped conversation deletion path.
-- Prompts remain outside image metadata, storage paths, and audit rows.

alter table public.ai_conversations
  drop constraint ai_conversations_mode_check,
  add constraint ai_conversations_mode_check
    check (mode in ('ask', 'image', 'plan'));

create table public.ai_image_artifacts (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  provider text not null check (provider in ('gemini', 'mock', 'openai')),
  model text not null check (
    char_length(model) between 2 and 120
    and model ~ '^[A-Za-z0-9._:-]+$'
  ),
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
  created_at timestamp with time zone not null default now(),
  unique (id, tenant_id, conversation_id),
  unique (storage_path),
  foreign key (conversation_id, tenant_id)
    references public.ai_conversations (id, tenant_id)
    on delete cascade
);

create index ai_image_artifacts_conversation_created_idx
  on public.ai_image_artifacts (tenant_id, conversation_id, created_at desc);

alter table public.ai_image_artifacts enable row level security;

create policy ai_image_artifact_member_select
  on public.ai_image_artifacts
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.ai_image_artifacts from public, anon, authenticated;
grant select on public.ai_image_artifacts to authenticated;
grant all on public.ai_image_artifacts to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'assistant-images',
  'assistant-images',
  false,
  8000000,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.audit_ai_image_artifact()
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
    'assistant_image.generated',
    'assistant_image',
    new.id,
    new.conversation_id,
    jsonb_build_object(
      'byteSize', new.byte_size,
      'height', new.height,
      'mimeType', new.mime_type,
      'model', new.model,
      'provider', new.provider,
      'width', new.width
    )
  );
  return new;
end;
$$;

create trigger audit_ai_image_artifact_insert
after insert on public.ai_image_artifacts
for each row execute function public.audit_ai_image_artifact();

create function public.delete_ai_conversation(
  actor_id uuid,
  target_tenant_id uuid,
  target_conversation_id uuid
)
returns table (storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  attachment_count bigint;
  artifact_count bigint;
  image_count bigint;
  message_count bigint;
begin
  if not exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = actor_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'ASSISTANT_TENANT_ACCESS_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.ai_conversations
    where id = target_conversation_id
      and tenant_id = target_tenant_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'ASSISTANT_CONVERSATION_NOT_FOUND';
  end if;

  select count(*) into attachment_count
  from public.ai_attachments
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  select count(*) into artifact_count
  from public.ai_artifacts
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  select count(*) into image_count
  from public.ai_image_artifacts
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  select count(*) into message_count
  from public.ai_messages
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;

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
    target_tenant_id,
    actor_id,
    'assistant_conversation.deleted',
    'assistant_conversation',
    target_conversation_id,
    target_conversation_id,
    jsonb_build_object(
      'attachmentCount', attachment_count,
      'artifactCount', artifact_count,
      'imageCount', image_count,
      'messageCount', message_count
    )
  );

  return query
  select image.storage_path
  from public.ai_image_artifacts as image
  where image.tenant_id = target_tenant_id
    and image.conversation_id = target_conversation_id;

  delete from public.ai_artifact_sources
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  delete from public.ai_message_sources
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  delete from public.ai_tool_results
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  delete from public.ai_artifacts
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  delete from public.ai_attachments
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  delete from public.ai_image_artifacts
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  delete from public.ai_messages
  where tenant_id = target_tenant_id
    and conversation_id = target_conversation_id;
  delete from public.ai_conversations
  where tenant_id = target_tenant_id
    and id = target_conversation_id;
end;
$$;

revoke all on function public.audit_ai_image_artifact() from public, anon, authenticated;
revoke all on function public.delete_ai_conversation(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.audit_ai_image_artifact() to service_role;
grant execute on function public.delete_ai_conversation(uuid, uuid, uuid) to service_role;
