# Phase 3a — Brand Bootstrap

Drops on top of Phase 2. Adds a third job type (`bootstrap`) that analyzes your existing content and proposes a full brand profile to apply.

## What this ships

- **`/bootstrap` page** — input form (bio + posts + optional YouTube channel) → analysis → review/edit → apply.
- **Per-section apply** — choose to apply just Identity, just Voice, just Pillars, or all three. Each field editable before applying.
- **Same async pattern** — uses the existing `pending_jobs` queue + Cloud Function processor. Adds one new job type, nothing changes about Phase 1 or Phase 2.
- **Settings banner** — purple banner at the top of Settings linking to the bootstrap flow.

## File inventory

**New:**
- `functions/lib/bootstrap/analyzer.js`
- `src/app/bootstrap/page.js`
- `src/app/api/bootstrap/run/route.js`
- `src/app/api/bootstrap/apply/route.js`
- `src/app/api/bootstrap/dismiss/route.js`

**Modified:**
- `functions/index.js` — adds `handleBootstrapJob` branch.
- `firestore.rules` — adds `bootstrap_proposals` (user reads own, server writes).
- `src/app/settings/page.js` — adds banner above Brand Identity section.

**No changes to:**
- `firestore.indexes.json` — the Phase 2 composite index on `pending_jobs(userId, type, status)` already covers bootstrap queries.
- `functions/package.json` — Anthropic SDK is already a dep; no new packages.

## Deploy

```bash
# On your machine: unzip phase-3a.zip and upload the folders to GitHub
# (same way you did for Phase 2)

# In Cloud Shell:
cd ~/social-media-agent && git pull && \
firebase deploy --only firestore:rules,functions
```

Vercel rebuilds automatically from the push.

## How to use it

1. Settings page → click the purple **Open Brand Bootstrap →** banner.
2. Paste your bio + 5–10 of your real posts (separated by `---` on its own line, or by blank lines).
3. Optionally paste your YouTube channel ID (the `UC...` string, not the @handle).
4. Optionally add notes for the AI (e.g. "weight automation higher than CRM").
5. Click **Analyze**. Wait 30–60 seconds.
6. Page automatically updates with proposed identity, voice, and pillars — all editable.
7. Untick any section you don't want to apply, then click **Apply to my brand config**.

## What the analyzer does

It reads everything you pasted and the YouTube content, then proposes:

- **Identity** — name, handle, tagline (synthesized from your bio + posts).
- **Voice** — tone descriptors observed in your writing, signature phrases you actually repeat, phrases inferred to avoid (your absent vocabulary), and 2–4 of your input posts picked as the most representative samples.
- **Content Pillars** — 3–6 themes clustered from the corpus, each with weight (sums to 100), description, and 3–5 specific angle suggestions.

It's just a Claude call with a careful prompt — no scraping, no third-party APIs. Cost: roughly $0.05–0.15 per run, charged to your Anthropic key.

## What's deliberately not in v1

- **No social scraping** — pasting is fine for now. Real scraping (LinkedIn, IG, Twitter) needs paid services like Apify; we'll add it later if needed.
- **No diff view** — applying overwrites the section. The proposal is editable so you can manually preserve anything you want kept.
- **No history** — only one proposal per user at a time. Running a new analysis overwrites the previous proposal (if pending). After applying or dismissing, you can run a fresh one.

## Next up

Phase 3b: image generation per draft (Flux via Replicate) for carousels and single-image posts.
