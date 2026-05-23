# Phase 3b + Mobile Pass

One zip, two payloads:

1. **Phase 3b — Image generation** via Replicate Flux Schnell, hosted on Cloudinary. New "Generate images" button on every draft card.
2. **Mobile optimization** — viewport meta tag, globals.css with responsive rules, mobile classes added to every page that had multi-column grids.

## Why bundled

Phase 3b modifies `src/app/page.js` and `src/app/settings/page.js`. The mobile pass touches the same files. Shipping them together avoids overwrite conflicts and gives you one upload to test.

## The mobile fix — what was broken

The biggest issue was the **missing viewport meta tag**. Without it, mobile browsers render the page at 980px wide and zoom out, which is why everything looked tiny and broken. Fixed by exporting `viewport` from `layout.js` (Next.js 15 API).

The second issue was multi-column form grids (4-col stats, 4-col scoring weights, 4-col research source rows, etc.) which overflowed or got squished on phones. Fixed by adding small CSS helper classes (`.m-stack`, `.m-stack-2`, `.m-modal`, `.m-img-grid`) and wiring them up where needed.

## What changed for mobile

**New file:** `src/app/globals.css` — global resets, responsive breakpoints at 640px and 380px, helper classes that override inline styles via `!important` only on mobile.

**Modified file:** `src/app/layout.js` — imports `globals.css`, exports `viewport` for Next.js to emit the meta tag.

**Modified files** (added `className` attributes where multi-column grids needed to collapse):
- `src/app/page.js` — stats grid (4-col → 2-col), generate form row (stack), image preview grid (2-col)
- `src/app/settings/page.js` — scoring weights (4-col → 2-col), research source row (stack), reddit/HN config rows (stack)
- `src/app/bootstrap/page.js` — pillar editor row (stack)
- `src/app/ideas/page.js` — use-idea modal (responsive width)

**Pages NOT touched** (already mobile-OK as single-column flows):
- `src/app/onboarding/page.js`
- `src/app/login/page.js`

## File inventory

**Phase 3b parts (image generation):**
- `functions/index.js` — modified, adds `images` job type
- `functions/lib/images/{prompter,generator,uploader,pipeline}.js` — new
- `src/app/api/images/generate/route.js` — new
- `src/app/api/replicate-key/route.js` — new
- `src/app/api/cloudinary-keys/route.js` — new
- `src/config/default-brand-template.js` — modified, adds `visualStyle` block
- `src/lib/content-bank.js` — modified, adds key setters

**Mobile parts:**
- `src/app/globals.css` — new
- `src/app/layout.js` — modified
- `src/app/page.js`, `src/app/settings/page.js`, `src/app/ideas/page.js`, `src/app/bootstrap/page.js` — modified (mobile classes baked in alongside the Phase 3b changes)

**No changes to:**
- `firestore.rules`, `firestore.indexes.json`, `functions/package.json`

## Deploy

```bash
# After uploading the unzipped folders to GitHub:
cd ~/social-media-agent && git pull && firebase deploy --only functions
```

Vercel auto-rebuilds. No rules/indexes/dependencies changes this round.

## How to test the mobile fix

1. Open the production URL on your phone (or use Chrome DevTools → device toolbar, set to iPhone or Pixel).
2. Hard refresh (long-press reload → "Reload from Origin" on mobile Chrome, or Ctrl+Shift+R in DevTools).
3. Check: text should be normal-readable size (not zoomed-out tiny), nav buttons should wrap onto two rows if needed, the stats bar should be 2x2 not 1x4, settings forms should be single-column on phone.

## How to test Phase 3b (image generation)

Required first: paste your **Replicate API key** and **Cloudinary credentials** in Settings.

Then:
1. Generate a draft as usual.
2. On the draft card, hit **Generate images**.
3. Wait 20–60 seconds. Image thumbnails appear inline when ready.

## Cost ballpark

Per draft with 5 carousel images: ~$0.02 total ($0.005 prompts + $0.015 image gen).
Cloudinary hosting is free up to 25 GB.

## Next up

Phase 3c — video generation (LTX-Video or Veo via Replicate) for Reels/TikToks. Same async pattern, same brand-styled prompter.
