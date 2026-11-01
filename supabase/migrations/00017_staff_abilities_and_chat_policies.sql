-- 00017 — staff abilities + AI conversation deletion.
--
-- 1. The tutor UI has always offered "delete conversation", but no RLS
--    delete policy existed on ai_conversations, so the client's delete
--    call silently failed for every user. This adds the owner-only
--    delete policy (messages are removed by the existing ON DELETE
--    CASCADE, which bypasses RLS).
--
-- 2. Admin-granted staff abilities: the console can hand individual
--    students a subset of lecturer capabilities (class rep, assistant
--    lecturer, answer verifier…) without changing their role. The
--    column is intentionally NOT in the authenticated column-level
--    UPDATE grant list (00012), so only the service role (console) can
--    set it. Valid values are enforced app-side (src/lib/rbac.ts).

-- ---------- ai_conversations: owner delete ----------
create policy "ai_conversations_delete_own" on public.ai_conversations
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- profiles.staff_abilities ----------
alter table public.profiles
  add column if not exists staff_abilities text[] not null default '{}';

comment on column public.profiles.staff_abilities is
  'Admin-granted capability keys (subset of lecturer abilities, see src/lib/rbac.ts). Managed by the operations console; users cannot edit it.';
