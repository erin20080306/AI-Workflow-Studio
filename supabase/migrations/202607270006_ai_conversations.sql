-- Durable, tenant-isolated AI conversations.
-- Writes are server-only so provider output cannot bypass validation or usage accounting.

create table public.ai_conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  mode text not null check (mode in ('ask', 'plan')),
  selected_provider text not null check (
    selected_provider in ('anthropic', 'gemini', 'mock', 'openai')
  ),
  selected_model text not null check (
    char_length(selected_model) between 1 and 120
    and selected_model ~ '^[A-Za-z0-9._:-]+$'
  ),
  status text not null default 'active' check (status in ('active', 'archived')),
  last_message_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (id, tenant_id)
);

create table public.ai_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  role text not null check (role in ('assistant', 'user')),
  body text not null check (char_length(body) between 1 and 80000),
  provider text check (provider in ('anthropic', 'gemini', 'mock', 'openai')),
  model text check (
    model is null
    or (
      char_length(model) between 1 and 120
      and model ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  status text not null default 'completed' check (
    status in ('cancelled', 'completed', 'failed')
  ),
  input_units bigint not null default 0 check (input_units >= 0),
  output_units bigint not null default 0 check (output_units >= 0),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 100000
  ),
  created_at timestamp with time zone not null default now(),
  foreign key (conversation_id, tenant_id)
    references public.ai_conversations (id, tenant_id)
    on delete cascade,
  check (
    (role = 'user' and created_by is not null and provider is null and model is null)
    or (role = 'assistant' and provider is not null and model is not null)
  )
);

create index ai_conversations_tenant_recent_idx
  on public.ai_conversations (tenant_id, last_message_at desc);
create index ai_messages_conversation_time_idx
  on public.ai_messages (tenant_id, conversation_id, created_at, id);

create trigger set_ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create function public.touch_ai_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_conversations
  set last_message_at = greatest(last_message_at, new.created_at)
  where id = new.conversation_id
    and tenant_id = new.tenant_id;
  return new;
end;
$$;

create trigger touch_ai_conversation_after_message
  after insert on public.ai_messages
  for each row execute function public.touch_ai_conversation();

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy ai_conversation_member_select
  on public.ai_conversations
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy ai_message_member_select
  on public.ai_messages
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.ai_conversations, public.ai_messages from public, anon, authenticated;
revoke all on function public.touch_ai_conversation() from public, anon, authenticated;

grant select on public.ai_conversations, public.ai_messages to authenticated;
grant all on public.ai_conversations, public.ai_messages to service_role;
grant execute on function public.touch_ai_conversation() to service_role;
