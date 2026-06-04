-- ============================================================
-- LEARNING LOOP — Phase A: post performance + content tagging
-- Every published post is stamped with its content "variables" (the knobs the
-- agent can learn from). Performance columns are filled later by a metrics job.
-- This is the substrate the social-media agent learns from.
-- ============================================================

create table if not exists public.post_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  draft_id uuid,
  platform text,
  provider text,                 -- direct | postiz
  provider_post_id text,

  -- content variables (what the agent experiments with + learns from)
  media_type text,               -- branded_card | photo | captioned_photo | video | text
  card_layout text,              -- statement | quote | stat | highlight | null
  format_type text,              -- textPost | carousel | reel | ...
  pillar text,
  hook_type text,                -- optional classification, filled later
  hashtags_count int,
  body_length int,
  posted_at timestamptz,
  posted_dow int,                -- 0-6 (day of week, UTC)
  posted_hour int,               -- 0-23 (UTC)

  -- performance (filled by the metrics-refresh job in Phase B)
  impressions int,
  reactions int,
  comments int,
  shares int,
  clicks int,
  engagement int,                -- reactions + comments + shares
  engagement_rate numeric,       -- engagement / impressions (when impressions known)
  metrics_source text,           -- api | manual
  metrics_fetched_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_post_perf_user on public.post_performance(user_id, posted_at desc);
create index if not exists idx_post_perf_tags on public.post_performance(user_id, media_type, card_layout, pillar);

alter table public.post_performance enable row level security;

-- Users may READ their own performance rows (for a future "what's working" view).
-- Writes happen via the service role (edge function), so no write policy is needed.
create policy "read own performance" on public.post_performance
  for select using (auth.uid() = user_id);
