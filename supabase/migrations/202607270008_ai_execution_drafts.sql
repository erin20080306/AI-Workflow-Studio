-- Links a reviewed assistant Plan message to one immutable Workflow v1 draft.
-- Execution remains a separate, explicitly user-triggered run operation.

create table public.ai_workflow_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  workflow_id uuid not null,
  workflow_version_id uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  definition_hash text not null check (definition_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamp with time zone not null default now(),
  unique (id, tenant_id),
  unique (message_id),
  unique (workflow_id),
  unique (workflow_version_id),
  foreign key (message_id, tenant_id, conversation_id)
    references public.ai_messages (id, tenant_id, conversation_id)
    on delete restrict,
  foreign key (workflow_id, tenant_id)
    references public.workflows (id, tenant_id)
    on delete cascade,
  foreign key (workflow_version_id, workflow_id, tenant_id)
    references public.workflow_versions (id, workflow_id, tenant_id)
    on delete cascade
);

create index ai_workflow_drafts_conversation_time_idx
  on public.ai_workflow_drafts (tenant_id, conversation_id, created_at desc);

alter table public.ai_workflow_drafts enable row level security;

revoke all on public.ai_workflow_drafts from public, anon, authenticated;
grant all on public.ai_workflow_drafts to service_role;
