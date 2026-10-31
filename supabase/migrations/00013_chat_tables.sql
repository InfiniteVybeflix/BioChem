-- ============================================================
-- BioChem 00013 — Encrypted direct & group messaging
--
-- Replaces the old single-room plaintext course chat with a full
-- messaging system:
--   chat_conversations  direct chats, study groups, open lounges
--   chat_members        membership + read receipts
--   chat_keys           per-conversation AES-256-GCM key (members only)
--   chat_messages       encrypted text + encrypted attachments
--
-- Message bodies and attachments are encrypted in the browser with
-- AES-256-GCM before they ever reach the database or storage; the
-- key row is only readable by conversation members (RLS). Transport
-- is TLS. The service role (operations console) is the only party
-- that can bypass RLS for moderation/legal duties.
-- ============================================================

-- ---------- retire the old course-room chat ----------
drop table if exists public.chat_reports;
drop table if exists public.chat_messages;

-- ---------- conversations ----------
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group', 'lounge')),
  name text,                                   -- groups & lounges only
  topic_id uuid references public.topics (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index chat_conversations_last_message_idx
  on public.chat_conversations (last_message_at desc);

-- ---------- membership ----------
create table public.chat_members (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index chat_members_user_idx on public.chat_members (user_id);

-- ---------- per-conversation encryption key ----------
-- Raw AES-256 key, base64. Only members can select it (RLS below).
create table public.chat_keys (
  conversation_id uuid primary key references public.chat_conversations (id) on delete cascade,
  key_b64 text not null
);

-- ---------- messages ----------
-- kind: text            cipher_b64 = AES-GCM(body), iv = nonce
--       image/video/audio/voice/file  attachment = storage path
--       (the stored object is AES-GCM encrypted with the same key)
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'image', 'video', 'audio', 'voice', 'file')),
  cipher_b64 text not null default '',
  iv text not null default '',
  attachment jsonb,
  reply_to uuid references public.chat_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at desc);

-- ---------- reports (moderation) ----------
create table public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  reason text not null,
  status public.chat_report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------- membership helper ----------
create or replace function public.is_chat_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where conversation_id = p_conversation and user_id = auth.uid()
  );
$$;

-- ---------- conversation activity trigger ----------
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger chat_message_touch_conversation
  after insert on public.chat_messages
  for each row execute function public.touch_conversation();

-- ---------- RLS ----------
alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_keys enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reports enable row level security;

create policy "conversations_select_members" on public.chat_conversations
  for select to authenticated using (public.is_chat_member(id));

create policy "conversations_insert_creator" on public.chat_conversations
  for insert to authenticated with check (created_by = auth.uid());

create policy "conversations_update_owner" on public.chat_conversations
  for update to authenticated
  using (
    exists (
      select 1 from public.chat_members m
      where m.conversation_id = id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

create policy "conversations_delete_owner" on public.chat_conversations
  for delete to authenticated
  using (
    exists (
      select 1 from public.chat_members m
      where m.conversation_id = id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

-- Joining: you may add yourself to an open lounge, or to a
-- conversation you just created; owners may add or invite others.
create policy "members_insert_allowed" on public.chat_members
  for insert to authenticated
  with check (
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.chat_conversations c
        where c.id = conversation_id
          and (c.kind = 'lounge' or c.created_by = auth.uid())
      )
    )
    or exists (
      select 1 from public.chat_members m
      where m.conversation_id = conversation_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "members_select_peers" on public.chat_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_chat_member(conversation_id));

create policy "members_update_self" on public.chat_members
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Leaving a group, or an owner removing a member.
create policy "members_delete_self_or_owner" on public.chat_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chat_members m
      where m.conversation_id = conversation_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "chat_keys_select_members" on public.chat_keys
  for select to authenticated using (public.is_chat_member(conversation_id));

create policy "chat_keys_insert_members" on public.chat_keys
  for insert to authenticated with check (public.is_chat_member(conversation_id));

create policy "chat_keys_update_members" on public.chat_keys
  for update to authenticated
  using (public.is_chat_member(conversation_id))
  with check (public.is_chat_member(conversation_id));

create policy "messages_select_members" on public.chat_messages
  for select to authenticated using (public.is_chat_member(conversation_id));

create policy "messages_insert_members" on public.chat_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(conversation_id));

create policy "messages_update_own" on public.chat_messages
  for update to authenticated
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.chat_members m
      where m.conversation_id = conversation_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "chat_reports_insert_own" on public.chat_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.chat_messages msg
      where msg.id = message_id and public.is_chat_member(msg.conversation_id)
    )
  );

create policy "chat_reports_select_staff" on public.chat_reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_staff());

create policy "chat_reports_update_staff" on public.chat_reports
  for update to authenticated using (public.is_staff());

-- ---------- storage bucket for encrypted attachments ----------
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;

create policy "chat_files_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-files'
    and public.is_chat_member((storage.foldername(name))[1]::uuid)
  );

create policy "chat_files_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and public.is_chat_member((storage.foldername(name))[1]::uuid)
  );

-- ---------- realtime ----------
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_conversations;
alter publication supabase_realtime add table public.chat_members;
