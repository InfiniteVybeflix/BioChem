-- ============================================================
-- BioChem 00015 — Console-era adjustments
--
-- * announcements may be authored by the platform itself (the
--   operations console has no profile row) — author_id is now
--   nullable and the app renders platform broadcasts accordingly.
-- ============================================================

alter table public.announcements
  alter column author_id drop not null;
