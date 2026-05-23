# Push-to-deploy setup

One-time setup. After this, every push to your main / Phase 1 branch deploys both Vercel (already wired) and Firebase (this workflow).

## What goes where

```
.github/workflows/firebase-deploy.yml   ← drop this from the zip into your repo
```

The folder `.github/workflows/` may not exist yet. The zip preserves the structure — just unzip on top of the repo root.

## One-time auth setup (60 seconds)

### Step 1 — Get a Firebase CI token

In Cloud Shell or any terminal where you can authenticate Firebase:

```bash
firebase login:ci
```

A browser tab opens. Log in with the same Google account that owns the `dsocial-agent` project. The terminal prints a token that looks like `1//0Gxxxxxxxxxx...` (long string). Copy it.

### Step 2 — Add the token as a GitHub secret

1. Go to your repo on GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. **Name:** `FIREBASE_TOKEN`
5. **Value:** paste the token from step 1
6. Click **Add secret**

That's it. Done forever.

## What happens on every push from now on

- **Vercel** (already wired): rebuilds and deploys your Next.js app
- **This action**: runs `firebase deploy --only firestore,functions` against project `dsocial-agent`

You can watch each deploy in the **Actions** tab of your repo. Failed deploys email you automatically.

## First deploy after adding this — important

The very first deploy that includes the new `runWeeklyResearch` scheduled function may fail with a Cloud Scheduler API propagation error. This is a known Firebase quirk, not a problem with this workflow.

**If it fails:** wait 5 minutes, then re-trigger the deploy via **Actions** tab → select the failed run → **Re-run all jobs**. Second attempt almost always succeeds.

## Triggering a deploy without pushing code

Sometimes you want to redeploy without a code change (e.g., after rotating an API key in Firebase config). In the **Actions** tab of your repo, find this workflow in the left sidebar, click **Run workflow**, pick a branch, hit the green button.

## Token rotation / security

The CI token has the same permissions as your Google account. Treat it like a password:
- Never commit it to the repo
- Rotate it if you suspect exposure: run `firebase login:ci --clear` then `firebase login:ci` again
- Update the `FIREBASE_TOKEN` secret in GitHub with the new value

The `FIREBASE_TOKEN` approach is the simplest path. If you ever want to switch to a service account (more granular permissions, recommended for teams), the same `w9jds/firebase-action` supports it via a `GCP_SA_KEY` env var instead.

## Branches this deploys from

Currently configured to deploy on push to:
- `main`
- `master`
- `claude/social-media-automation-phase-1-4VXfN` (your current Phase 1 branch)
- Manual run from any branch via the Actions tab

When you finalize and merge to `main`, you can edit the workflow to remove the Phase 1 branch line.
