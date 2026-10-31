-- ============================================================
-- BioChem 00005 — Jobs & Ads
-- ============================================================

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  posted_by uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  org text not null,
  location text not null,
  type public.job_type not null,
  description_md text not null,
  contact text not null,
  status public.job_status not null default 'pending',
  approved_by uuid references public.profiles (id) on delete set null,
  closes_at timestamptz,
  is_sponsored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status, created_at desc);
create index jobs_type_idx on public.jobs (type);

create table public.job_enquiries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  status public.enquiry_status not null default 'sent',
  created_at timestamptz not null default now()
);

create index job_enquiries_job_idx on public.job_enquiries (job_id, created_at desc);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  placement public.ad_placement not null,
  target_url text not null,
  image_url text,
  cta_label text not null default 'Learn more',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  impressions integer not null default 0,
  clicks integer not null default 0,
  enabled boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ads_placement_idx on public.ads (placement, enabled);

create table public.ad_impressions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'impression' check (kind in ('impression', 'click')),
  created_at timestamptz not null default now()
);

create index ad_impressions_ad_idx on public.ad_impressions (ad_id, created_at desc);
