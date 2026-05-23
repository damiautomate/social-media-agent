# Phase 2 — Research Agent

Drops on top of your existing `social-media-agent` repo. No Phase 1 functionality changes.

## What this ships

- **Weekly research cron** — Mondays 06:00 UTC, queues a research job per onboarded user.
- **"Run research now" button** — on the new Ideas Bank page. Same code path as the cron.
- **Four source types** — Reddit, Hacker News, RSS feeds, YouTube channels (via channel RSS).
- **Claude-scored ideas** — each idea gets four scores (relevance, novelty, voiceFit, urgency) + a weighted composite (0–10) used for ranking.
- **Ideas Bank page** at `/ideas` — sortable/filterable, "Use this idea" wired to the existing draft generator.
- **Settings → Research Sources** — add/remove/toggle sources, tune scoring weights, set target idea count.

## File inventory

**Modified:**
- `firestore.rules` — adds `research_signals` (server-only).
- `firestore.indexes.json` — adds 2 ideas indexes for the bank page.
- `functions/package.json` — adds `fast-xml-parser` dep.
- `functions/index.js` — `processPendingJob` now switches on `job.type`; adds scheduled `runWeeklyResearch`.
- `src/config/default-brand-template.js` — adds `research` block with seeded sources.
- `src/lib/content-bank.js` — adds `createResearchJob`, `hasActiveResearchJob`, backfill on bootstrap.
- `src/app/page.js` — adds "Ideas" link to nav.
- `src/app/settings/page.js` — adds Research Sources section.

**New:**
- `functions/lib/research/defaults.js`
- `functions/lib/research/normalize.js`
- `functions/lib/research/pipeline.js`
- `functions/lib/research/scorer.js`
- `functions/lib/research/fetchers/{index,reddit,hackernews,rss,youtube}.js`
- `src/app/ideas/page.js`
- `src/app/api/research/run/route.js`
- `src/app/api/research/sources/route.js`

## Deploy (Cloud Shell, one shot)

```bash
cd ~/social-media-agent
git checkout claude/social-media-automation-phase-1-4VXfN  # or your working branch
git pull

# Unzip phase-2 contents on top of the repo. The zip mirrors the repo tree
# so files land in the right places.
unzip -o ~/phase-2.zip -d .

# Install the new functions dep
cd functions && npm install && cd ..

# Deploy everything: rules + indexes + functions
firebase use dsocial-agent
firebase deploy --only firestore:rules,firestore:indexes,functions

# Push to GitHub so Vercel rebuilds the Next.js app
git add -A
git commit -m "Phase 2: research agent"
git push
```

## First-run gotchas to expect

1. **First scheduler deploy** — `runWeeklyResearch` requires the Cloud Scheduler API. If the first `firebase deploy --only functions` fails with a permission/propagation error on the scheduled function specifically, wait 5 minutes and re-run. Same gotcha as your first Gen 2 deploy.

2. **Existing brandConfig has no `research` field** — handled automatically. The first time you hit `/ideas` or run research, the function backfills the defaults into your brandConfig. No manual migration needed.

3. **Two of the seed RSS URLs are educated guesses** — `zapier.com/blog/feeds/latest/` and `blog.n8n.io/rss/`. If either 404s during a run, you'll see a non-fatal error in the research summary on the pending_jobs doc. Just disable the offending row in Settings → Research Sources. The run continues without it.

4. **Indexes need to finish building** — after deploy, check Firebase Console → Firestore → Indexes. The two new ideas indexes will say "Building" for 1–5 minutes. The Ideas Bank page works regardless (it uses `createdAt` ordering), but score-sorting needs the indexes live to query efficiently at scale.

## How to verify it works end-to-end

1. Open the app in browser → log in → navigate to `/ideas`.
2. Click **Run research now**. Header shows "Researching…" chip.
3. Wait ~30–90 seconds. Ideas should appear, sorted by composite score.
4. In Firebase Console → Firestore → `pending_jobs`, find the latest research-type doc. The `researchSummary` field shows `ideasCreated`, `signalsCount`, `freshCount`, `tokensUsed`, and any per-source errors.
5. Click **Use this idea** on any card → pick a platform → it queues a normal draft job and redirects to the dashboard. The idea's status flips to `used`.

## Cost ballpark

Each research run is one Claude Sonnet call: roughly 5K–15K input tokens (system prompt + up to 80 signals) + 2K–4K output. ~$0.05–0.10 per run, charged to that user's API key. Weekly cron = ~$0.30/month per user. The on-demand button is metered the same way.

## What's deliberately not in Phase 2 (saving for later)

- Twitter/X (Free API is gone; would need paid services like Apify).
- LinkedIn/Instagram/TikTok competitor scraping (paid services, ToS risk).
- Idea feedback loop (thumbs up/down → biases the next run's scoring). This is the natural Phase 5.
- A "preferences" doc the scorer reads to learn what you've used vs dismissed. Same as above.
- Dismissing/archiving ideas from the bank (only "Use" or leave alone for now).
