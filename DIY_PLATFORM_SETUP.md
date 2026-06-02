# DIY Direct Publishing — Platform Setup Checklist

This is the one-time, per-platform developer-app setup **you** do. After this, your
users just tap "Connect" in Settings → Channels. Specs verified 2026-05.

---

## First: shared env vars (Vercel + Supabase Edge Function secrets)

Add these to **Vercel → Settings → Environment Variables** (tick all environments)
AND as **Supabase → Edge Functions → secrets** (the edge function needs the
encryption + state keys to decrypt tokens when publishing):

```
APP_URL                = https://YOUR-APP.vercel.app      (no trailing slash)
SOCIAL_TOKEN_SECRET    = <run: openssl rand -base64 32>   (32-byte key, encrypts tokens)
OAUTH_STATE_SECRET     = <run: openssl rand -base64 32>   (any long random string)
```

Then per platform below, add that platform's client id/secret.

**Your redirect/callback URL for every platform is:**
```
https://YOUR-APP.vercel.app/api/connect/{platform}/callback
```
e.g. `.../api/connect/linkedin/callback`, `.../api/connect/facebook/callback`, etc.
Paste the exact one into each developer portal.

---

## 1. LinkedIn  (easiest — start here)

**Portal:** linkedin.com/developers → Create app (must attach a Company Page; make a
placeholder Page if you don't have one). Verify the app from the Settings tab.

**Products to request:** "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn".

**Scopes used by the app:** `openid`, `profile`, `w_member_social` (posts to the member's personal profile).

**Redirect URL:** `https://YOUR-APP.vercel.app/api/connect/linkedin/callback`

**Env vars:**
```
LINKEDIN_CLIENT_ID     = <Client ID>
LINKEDIN_CLIENT_SECRET = <Client Secret>
```
Note: token ~60 days, refreshable. Image/video upload is a separate multi-step flow — the app ships **text posts** first; we add media after this works.

---

## 2. Facebook Page

**Portal:** developers.facebook.com → Create app (type: Business) → add the
**Facebook Login** product. You'll need **Business Verification** + **App Review**
for the posting permissions before non-test users can connect.

**Permissions:** `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `business_management`.

**Redirect URL:** `https://YOUR-APP.vercel.app/api/connect/facebook/callback`

**Env vars (shared with Instagram):**
```
META_APP_ID     = <App ID>
META_APP_SECRET = <App Secret>
```
Posts go to a **Page** you manage (Meta doesn't allow personal-profile posting via API).

---

## 3. Instagram  (uses the same Meta app as Facebook)

**Same Meta app** as #2. Add these permissions on top: `instagram_basic`, `instagram_content_publish`.

**Requirement:** the IG account must be a **Business/Creator account linked to a Facebook Page** you manage. Personal IG accounts can't publish via API.

**Redirect URL:** `https://YOUR-APP.vercel.app/api/connect/instagram/callback`

No new env vars (reuses `META_APP_ID` / `META_APP_SECRET`). IG **requires media** — text-only posts aren't allowed; the app sends image or Reel video.

---

## 4. TikTok  (hardest — do last)

**Portal:** developers.tiktok.com → register app → apply for the **Content Posting API**.
Expect a **2-6 week audit**. Until you pass, every post is forced to **private** visibility (the app sets `SELF_ONLY` on purpose so testing is honest).

**Scopes:** `user.info.basic`, `video.publish`.

**Redirect URL:** `https://YOUR-APP.vercel.app/api/connect/tiktok/callback`

**Env vars:**
```
TIKTOK_CLIENT_KEY    = <Client Key>
TIKTOK_CLIENT_SECRET = <Client Secret>
```
Requirements for approval: a real privacy policy mentioning TikTok data, a demo video, and only the scopes above. TikTok is **video-only** — the app sends the draft's avatar video or B-roll.

---

## After setup, per platform

1. Add that platform's env vars in Vercel **and** redeploy.
2. In the app: **Settings → Channels → Connect {platform}** → approve on the platform → you're bounced back and it shows "connected".
3. **Settings → Publishing →** set method to **Direct (DIY)**.
4. On an approved draft → **Post now**. Watch the `pending_jobs` row go `queued → completed`; the post appears on the platform.

If a publish row goes **failed**, open it in Supabase → copy the `error` text → send it to me. The per-platform request shapes are the most likely thing to need a small live-tested fix (especially TikTok and IG video).

## What's built vs. pending
- **Built now:** OAuth connect/disconnect for all 4, encrypted token storage, direct publishers (LinkedIn text; Facebook text+photo; Instagram image/Reel; TikTok video).
- **Pending (next iteration):** LinkedIn image/video upload flow, Facebook multi-photo, scheduled direct posts (currently "Post now" works; schedule still routes through the queue but fires immediately for direct — we'll add a real scheduler).
