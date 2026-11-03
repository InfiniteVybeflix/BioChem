-- ============================================================
-- BioChem 00017 — Nova chat history management
--
-- The tutor now supports editing your own messages (thread is
-- rewritten after the edit) and regenerating replies. Both flows
-- UPDATE and DELETE rows in ai_messages through the caller's own
-- Supabase session, so RLS needs explicit policies for that.
--
-- Apply in the Supabase SQL editor (same as the other migrations).
-- ============================================================

-- Owner may fix up their own user messages (edit + resend).
create policy "ai_messages_update_own" on public.ai_messages
  for update to authenticated
  using (
    role = 'user'
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    role = 'user'
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- Owner may trim their thread: stale user messages AND the assistant
-- replies being replaced (regenerate / edit rewrite both roles).
create policy "ai_messages_delete_own" on public.ai_messages
  for delete to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
