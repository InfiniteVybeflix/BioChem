-- ============================================================
-- BioChem 00014 — Support desk (contact the platform team)
--
-- Tickets are created exclusively through /api/support (rate
-- limited, spam-checked) with the service role — there is no
-- client insert policy. Users read their own tickets and the
-- replies; the operations console reads and answers everything.
-- ============================================================

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text not null default '',
  category text not null check (category in ('bug', 'complaint', 'question', 'feedback')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  page text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index support_tickets_user_idx on public.support_tickets (user_id);

create table public.support_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index support_replies_ticket_idx on public.support_replies (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_replies enable row level security;

-- Users can follow their own tickets (and read the team's replies).
create policy "support_tickets_select_own" on public.support_tickets
  for select to authenticated using (user_id = auth.uid());

create policy "support_replies_select_own_ticket" on public.support_replies
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

-- No insert/update policies: creation and replies happen through
-- the service role inside validated, rate-limited API routes.

create trigger set_updated_at_support_tickets
  before update on public.support_tickets
  for each row execute function public.set_updated_at();
