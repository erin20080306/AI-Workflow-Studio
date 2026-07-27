-- Bounded assistant attachments, source links, tool results, and generated artifacts.
-- Raw content remains behind authenticated server routes and service-role-only writes.

alter table public.ai_messages
  add constraint ai_messages_id_tenant_conversation_key
  unique (id, tenant_id, conversation_id);

create table public.ai_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  filename text not null check (
    char_length(filename) between 1 and 180
    and filename !~ '[\r\n/\\]'
  ),
  mime_type text not null check (
    mime_type in ('application/json', 'text/csv', 'text/markdown', 'text/plain')
  ),
  byte_size integer not null check (byte_size between 1 and 65536),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  content text not null check (
    octet_length(content) = byte_size
    and octet_length(content) <= 65536
  ),
  created_at timestamp with time zone not null default now(),
  unique (id, tenant_id, conversation_id),
  foreign key (conversation_id, tenant_id)
    references public.ai_conversations (id, tenant_id)
    on delete cascade
);

create table public.ai_message_sources (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  attachment_id uuid not null,
  citation_label text not null check (citation_label ~ '^S[1-5]$'),
  created_at timestamp with time zone not null default now(),
  primary key (message_id, attachment_id),
  unique (message_id, citation_label),
  foreign key (message_id, tenant_id, conversation_id)
    references public.ai_messages (id, tenant_id, conversation_id)
    on delete cascade,
  foreign key (attachment_id, tenant_id, conversation_id)
    references public.ai_attachments (id, tenant_id, conversation_id)
    on delete restrict
);

create table public.ai_tool_results (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid,
  created_by uuid not null references auth.users (id) on delete restrict,
  tool_name text not null check (
    tool_name in ('artifact.create_markdown', 'source.prepare_context')
  ),
  tool_version integer not null check (tool_version = 1),
  status text not null check (status in ('failed', 'succeeded')),
  input_summary jsonb not null default '{}'::jsonb check (
    jsonb_typeof(input_summary) = 'object'
    and octet_length(input_summary::text) <= 32000
  ),
  output_summary jsonb not null default '{}'::jsonb check (
    jsonb_typeof(output_summary) = 'object'
    and octet_length(output_summary::text) <= 32000
  ),
  created_at timestamp with time zone not null default now(),
  foreign key (conversation_id, tenant_id)
    references public.ai_conversations (id, tenant_id)
    on delete cascade,
  foreign key (message_id, tenant_id, conversation_id)
    references public.ai_messages (id, tenant_id, conversation_id)
    on delete set null (message_id)
);

create table public.ai_artifacts (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  filename text not null check (
    char_length(filename) between 1 and 180
    and filename !~ '[\r\n/\\]'
    and filename ~ '\.md$'
  ),
  mime_type text not null default 'text/markdown' check (mime_type = 'text/markdown'),
  byte_size integer not null check (byte_size between 1 and 80000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  content text not null check (
    octet_length(content) = byte_size
    and octet_length(content) <= 80000
  ),
  created_at timestamp with time zone not null default now(),
  unique (id, tenant_id, conversation_id),
  foreign key (message_id, tenant_id, conversation_id)
    references public.ai_messages (id, tenant_id, conversation_id)
    on delete restrict
);

create table public.ai_artifact_sources (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  artifact_id uuid not null,
  attachment_id uuid not null,
  created_at timestamp with time zone not null default now(),
  primary key (artifact_id, attachment_id),
  foreign key (artifact_id, tenant_id, conversation_id)
    references public.ai_artifacts (id, tenant_id, conversation_id)
    on delete cascade,
  foreign key (attachment_id, tenant_id, conversation_id)
    references public.ai_attachments (id, tenant_id, conversation_id)
    on delete restrict
);

create index ai_attachments_conversation_time_idx
  on public.ai_attachments (tenant_id, conversation_id, created_at, id);
create index ai_message_sources_conversation_idx
  on public.ai_message_sources (tenant_id, conversation_id, message_id);
create index ai_tool_results_conversation_time_idx
  on public.ai_tool_results (tenant_id, conversation_id, created_at desc);
create index ai_artifacts_conversation_time_idx
  on public.ai_artifacts (tenant_id, conversation_id, created_at desc);
create index ai_artifact_sources_conversation_idx
  on public.ai_artifact_sources (tenant_id, conversation_id, artifact_id);

alter table public.ai_attachments enable row level security;
alter table public.ai_message_sources enable row level security;
alter table public.ai_tool_results enable row level security;
alter table public.ai_artifacts enable row level security;
alter table public.ai_artifact_sources enable row level security;

revoke all on
  public.ai_attachments,
  public.ai_message_sources,
  public.ai_tool_results,
  public.ai_artifacts,
  public.ai_artifact_sources
from public, anon, authenticated;

grant all on
  public.ai_attachments,
  public.ai_message_sources,
  public.ai_tool_results,
  public.ai_artifacts,
  public.ai_artifact_sources
to service_role;
