# Social Media Agent — Supabase Edition

Multi-user AI content automation for LinkedIn, Instagram, TikTok, and Facebook.
Migrated from Firebase to Supabase (Auth + Postgres + Realtime + Edge Functions).

- **Frontend:** Next.js 15 (App Router, JS, inline styles) → Vercel
- **Backend:** Supabase (Auth, Postgres + RLS, Realtime, Edge Functions)
- **AI:** Anthropic Claude (per-user keys) · OpenAI GPT Image 2 (images) · HeyGen (avatar video) · fal.ai (B-roll) · Cloudinary (media hosting) · Postiz (publishing)

The whole thing runs on free tiers and per-user API keys — zero AI cost to the operator.

---

## What's in here

```
src/
  app/                     # Next.js pages + API routes
    page.js                # Dashboard (auth gate, realtime drafts, generate, all phase buttons)
    login/ onboarding/ settings/ ideas/ bootstrap/
    api/                   # 24 API routes (thin; logic lives in content-bank + edge fn)
  lib/
    supabase-client.js     # browser client (anon key)
    supabase-admin.js      # server client (service_role, bypasses RLS)
    auth-helpers.js        # verifyAuth() — checks the Supabase JWT
    content-bank.js        # all DB ops, snake_case <-> camelCase mapping
  config/
    default-brand-template.js
supabase/
  migrations/0001_init.sql # full schema + RLS (already run live; here for completeness)
  functions/
    process-pending-job/   # the worker — draft/research/bootstrap/images/avatar/broll/publish
    video-webhook/         # resolves HeyGen + fal.ai callbacks into drafts
```

---

## Deploy (one-time)

### 1. Vercel environment variables
Project → Settings → Environment Variables. Add:

```
NEXT_PUBLIC_SUPABASE_URL       = https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = <anon public key>
SUPABASE_SERVICE_ROLE_KEY      = <service_role secret key>   # server only
```

Then **redeploy** (Deployments → ⋯ → Redeploy) — Vercel env changes need a redeploy.

### 2. Database
The schema + RLS were already run live. If starting fresh, paste
`supabase/migrations/0001_init.sql` into Supabase → SQL Editor → Run.

> Note: the live run enabled Realtime on `drafts`. This migration also adds
> `ideas` and `bootstrap_proposals` to the realtime publication (the Ideas and
> Bootstrap pages subscribe to them). If you ran the schema before this file,
> run just these two lines once:
> ```sql
> alter publication supabase_realtime add table public.ideas;
> alter publication supabase_realtime add table public.bootstrap_proposals;
> ```

### 3. Edge Functions
Supabase → Edge Functions. Create two functions (you can paste the files in the dashboard editor, or deploy with the CLI `supabase functions deploy`):

- **process-pending-job** — paste all files from `supabase/functions/process-pending-job/`
- **video-webhook** — paste `supabase/functions/video-webhook/index.ts`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
For video, add a function secret on **process-pending-job**:
```
VIDEO_WEBHOOK_URL = https://YOUR-PROJECT.functions.supabase.co/video-webhook
```

### 4. Database Webhook (the trigger)
Supabase → Database → Webhooks → Create:
- Table: `pending_jobs`
- Events: **Insert**
- Type: **Supabase Edge Functions** → `process-pending-job`

This replaces the old Firestore `onDocumentCreated` trigger. Every queued job
fires the worker.

### 5. Auth
Supabase → Authentication:
- Providers → Email enabled, "Confirm email" off (for now)
- URL Configuration → Site URL + redirect URLs include your Vercel domain

Google sign-in is deferred (add later once your Google account is sorted).

---

## How it works

```
Dashboard ──POST /api/generate──▶ insert pending_jobs (queued)
                                        │  (DB webhook on INSERT)
                                        ▼
                            process-pending-job (Edge Fn, service_role)
                              ├─ draft        → Claude → insert drafts
                              ├─ research     → fetch sources → Claude scorer → ideas
                              ├─ bootstrap    → Claude analyzer → bootstrap_proposals
                              ├─ images       → Claude prompts → GPT Image 2 → Cloudinary
                              ├─ avatar_video → Claude script → HeyGen submit → video_jobs
                              ├─ broll        → Claude scenes → fal.ai submit → video_jobs
                              └─ publish      → Postiz now/schedule
                                        │
Dashboard ◀──Supabase Realtime on drafts── (live update)

Video (async, > function timeout):
  HeyGen / fal.ai ──callback──▶ video-webhook ──▶ mirror to Cloudinary ──▶ update draft
```

Draft generation, research, bootstrap, images, and publish all finish inside the
Edge Function (≤150s). Avatar video and B-roll **submit** to the provider and
return immediately; the provider calls `video-webhook` when the render is done,
which mirrors the file to Cloudinary and flips the draft block to `ready`.

---

## Per-user keys (all set in Settings)
- **Anthropic** — required (drafts, research, bootstrap, prompts, scripts)
- **OpenAI** — images (GPT Image 2)
- **Cloudinary** — media hosting (images + videos)
- **HeyGen** — avatar video (create an avatar at app.heygen.com first)
- **fal.ai** — B-roll scenes (Kling/Veo; model picker in Settings)
- **Postiz** — publishing (self-host free or cloud; map integrations to platform keys)

---

## Test flow
1. Open the Vercel URL → sign up (email/password)
2. Onboarding → add Anthropic key → identity → voice
3. Dashboard → Generate a LinkedIn post on a topic → draft appears live (~10-30s)
4. Approve → optionally Generate images / avatar video / B-roll
5. Settings → connect Postiz → map integrations → Approve & Post Now or Schedule

If a draft never appears: Supabase → Edge Functions → process-pending-job → Logs,
and Database → Webhooks → delivery logs.

## Notes / known limits
- Free Supabase pauses after 7 days idle; first request after wakes it (~20-30s).
- API keys are stored plaintext (trusted-group model). Encrypt before scaling.
- Anyone with the URL can sign up — add an allowlist before sharing widely.
