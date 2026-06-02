-- ============================================================
-- DIY DIRECT PUBLISHING — per-user social account connections
-- Each user OAuth-connects their own LinkedIn / Facebook / Instagram / TikTok.
-- Tokens are stored ENCRYPTED (AES-256-GCM) — never in plaintext.
-- Service-role only (no client RLS policy) so the browser can never read tokens.
-- ============================================================

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null,                 -- linkedin | facebook | instagram | tiktok
  account_id text not null,               -- platform's id (member URN, page id, ig business id, open_id)
  account_name text,                      -- display name
  account_username text,                  -- handle, if any
  access_token text not null,             -- ENCRYPTED
  refresh_token text,                     -- ENCRYPTED (nullable; LinkedIn/TikTok have them, FB/IG long-lived don't)
  token_expires_at timestamptz,
  scope text,
  meta jsonb default '{}'::jsonb,         -- platform extras: { pageId, igBusinessId, memberUrn, openId, tokenType }
  status text default 'active',           -- active | expired | revoked | error
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, platform, account_id)
);

create index if not exists idx_social_conn_user on public.social_connections(user_id, platform);

alter table public.social_connections enable row level security;
-- NO client policies on purpose: only the service_role (API routes + edge fn) touches this table.
