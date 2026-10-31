-- ============================================================
-- BioChem 00011 — Storage buckets, realtime, feature flag defaults
-- ============================================================

-- ---------- Storage ----------
-- Past papers (public read), avatars (public read), content uploads (staff only).
insert into storage.buckets (id, name, public)
values
  ('past-papers', 'past-papers', true),
  ('avatars', 'avatars', true),
  ('content-uploads', 'content-uploads', false)
on conflict (id) do nothing;

-- Past papers: everyone can read; staff can write.
create policy "past_papers_read" on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'past-papers');

create policy "past_papers_write_staff" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'past-papers' and public.is_staff());

-- Avatars: everyone can read; users manage their own folder.
create policy "avatars_read" on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Content uploads (bulk ingestion zips): staff only.
create policy "content_uploads_staff" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'content-uploads' and public.is_staff());

-- ---------- Realtime ----------
-- Realtime for the course chat room and discussion threads.
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.discussions;
alter publication supabase_realtime add table public.discussion_replies;
alter publication supabase_realtime add table public.notifications;

-- ---------- Feature flag defaults ----------
insert into public.feature_flags (key, enabled, description) values
  ('ai_tutor', true, 'AI tutor chat and explain modes'),
  ('question_of_the_day', true, 'AI-generated daily questions'),
  ('auto_flashcards', true, 'AI flashcard generation from notes'),
  ('community_chat', true, 'Realtime course chat room'),
  ('job_board', true, 'Job board visible to students'),
  ('ads_enabled', false, 'Master switch for sponsored placements'),
  ('sponsorships', false, 'Sponsored jobs/events/resources placements')
on conflict (key) do nothing;
