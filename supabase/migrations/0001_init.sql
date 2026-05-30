-- ============================================================
-- SOCIAL MEDIA AGENT — full schema + RLS (Phases 1-4)
-- This mirrors what was run live in the Supabase SQL Editor.
-- Included for repo completeness / reproducibility.
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text default '',
  photo_url text,
  anthropic_api_key text,
  openai_api_key text,
  heygen_api_key text,
  falai_api_key text,
  cloudinary jsonb default '{}'::jsonb,
  publishing jsonb default '{}'::jsonb,
  has_completed_onboarding boolean default false,
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);

-- ---------- BRAND CONFIGS ----------
create table if not exists public.brand_configs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  identity jsonb default '{}'::jsonb,
  voice jsonb default '{}'::jsonb,
  content_pillars jsonb default '[]'::jsonb,
  platforms jsonb default '{}'::jsonb,
  visual_style jsonb default '{}'::jsonb,
  video_style jsonb default '{}'::jsonb,
  publishing jsonb default '{}'::jsonb,
  research jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- ---------- IDEAS ----------
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null,
  angle text,
  pillar text,
  source text default 'manual',
  urgency text default 'normal',
  relevance_score numeric default 0,
  score_detail jsonb default '{}'::jsonb,
  status text default 'new',
  created_at timestamptz default now(),
  used_at timestamptz
);

-- ---------- PENDING JOBS ----------
create table if not exists public.pending_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text default 'draft',
  idea_id uuid,
  platform text,
  topic text,
  angle text,
  pillar text,
  context text,
  draft_id uuid,
  mode text,
  clip_count int,
  scheduled_at timestamptz,
  status text default 'queued',
  error text,
  result_draft_id uuid,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- ---------- DRAFTS ----------
create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idea_id uuid,
  job_id uuid,
  platform text not null,
  format_type text default 'textPost',
  pillar text default '',
  post_text text default '',
  hashtags jsonb default '[]'::jsonb,
  hook_preview text default '',
  first_comment text,
  content_notes text default '',
  carousel_slides jsonb default '[]'::jsonb,
  video_script text,
  alt_text text,
  engagement_hooks jsonb default '[]'::jsonb,
  estimated_read_time int default 0,
  status text default 'pending',
  images jsonb default '{}'::jsonb,
  avatar_video jsonb default '{}'::jsonb,
  broll jsonb default '{}'::jsonb,
  publish jsonb default '{}'::jsonb,
  scheduled_for timestamptz,
  published_at timestamptz,
  publish_id text,
  tokens_used int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- ANALYTICS (Phase 5 — schema only) ----------
create table if not exists public.analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  draft_id uuid,
  platform text,
  publish_id text,
  impressions int default 0,
  likes int default 0,
  comments int default 0,
  shares int default 0,
  saves int default 0,
  clicks int default 0,
  video_views int default 0,
  watch_time_seconds int default 0,
  fetched_at timestamptz default now()
);

-- ---------- RESEARCH SIGNALS ----------
create table if not exists public.research_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text,
  title text,
  url text,
  raw jsonb default '{}'::jsonb,
  score numeric default 0,
  created_at timestamptz default now()
);

-- ---------- BOOTSTRAP PROPOSALS ----------
create table if not exists public.bootstrap_proposals (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text default 'none',
  proposal jsonb default '{}'::jsonb,
  error text,
  updated_at timestamptz default now()
);

-- ---------- VIDEO JOBS ----------
create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  draft_id uuid not null references public.drafts(id) on delete cascade,
  kind text not null,
  provider text not null,
  external_id text,
  slot text,
  prompt text,
  status text default 'submitted',
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- INDEXES ----------
create index if not exists idx_ideas_user        on public.ideas(user_id, status, created_at desc);
create index if not exists idx_drafts_user       on public.drafts(user_id, status, created_at desc);
create index if not exists idx_pending_jobs_user on public.pending_jobs(user_id, status);
create index if not exists idx_video_jobs_ext    on public.video_jobs(external_id);
create index if not exists idx_video_jobs_draft  on public.video_jobs(draft_id);

-- ---------- REALTIME ----------
alter publication supabase_realtime add table public.drafts;
alter publication supabase_realtime add table public.ideas;
alter publication supabase_realtime add table public.bootstrap_proposals;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.brand_configs       enable row level security;
alter table public.ideas               enable row level security;
alter table public.pending_jobs        enable row level security;
alter table public.drafts              enable row level security;
alter table public.analytics           enable row level security;
alter table public.research_signals    enable row level security;
alter table public.bootstrap_proposals enable row level security;
alter table public.video_jobs          enable row level security;

create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

create policy "own brand select" on public.brand_configs for select using (auth.uid() = user_id);
create policy "own brand all"    on public.brand_configs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own bootstrap select" on public.bootstrap_proposals for select using (auth.uid() = user_id);

create policy "own ideas select"     on public.ideas     for select using (auth.uid() = user_id);
create policy "own drafts select"    on public.drafts    for select using (auth.uid() = user_id);
create policy "own analytics select" on public.analytics for select using (auth.uid() = user_id);

-- pending_jobs, research_signals, video_jobs: NO client policies (service_role only)
