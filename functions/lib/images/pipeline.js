// Orchestrates the full image-generation flow for a single draft:
//   1. Generate N image prompts via Claude (one per image slot)
//   2. For each prompt, generate an image via Replicate Flux Schnell
//   3. Upload each image URL to Cloudinary (URL-based, no bytes through us)
//   4. Update the draft doc with the final image records

const { FieldValue } = require("firebase-admin/firestore");
const { generateImagePrompts } = require("./prompter.js");
const { generateImage } = require("./generator.js");
const { uploadToCloudinary } = require("./uploader.js");

// Process slots in parallel but cap concurrency so we don't hammer Replicate.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (err) {
        results[i] = { ok: false, error: String(err?.message || err) };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function runImageGeneration({ db, userId, jobId, draftId, brandConfig, apiKeys }) {
  // 1. Load the draft we're generating images for
  const draftRef = db.collection("drafts").doc(draftId);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) throw new Error("Draft not found");
  const draft = draftSnap.data();
  if (draft.userId !== userId) throw new Error("Draft does not belong to this user");

  // Mark as generating immediately so the UI flips its spinner on.
  await draftRef.update({
    imagesStatus: "generating",
    imagesJobId: jobId,
    imagesError: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    // 2. Generate prompts via Claude
    const { prompts, aspect, tokensUsed } = await generateImagePrompts({
      apiKey: apiKeys.anthropic,
      draft,
      brandConfig,
    });

    if (prompts.length === 0) {
      await draftRef.update({
        imagesStatus: "none",
        imagesError: "No image slots for this draft format",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { imagesCreated: 0, note: "No slots", tokensUsed };
    }

    // 3. Generate + upload each slot in parallel (max 3 concurrent)
    const folder = `${(apiKeys.cloudinaryFolder || "social-agent")}/drafts/${draftId}`;

    const slotResults = await mapWithConcurrency(prompts, 3, async (p) => {
      const gen = await generateImage({
        apiKey: apiKeys.replicate,
        prompt: p.prompt,
        aspectRatio: aspect,
      });
      const uploaded = await uploadToCloudinary({
        cloudName: apiKeys.cloudinaryCloud,
        apiKey: apiKeys.cloudinaryKey,
        apiSecret: apiKeys.cloudinarySecret,
        imageUrl: gen.imageUrl,
        folder,
        publicId: p.slot,
      });
      return {
        slot: p.slot,
        prompt: p.prompt,
        url: uploaded.secureUrl,
        cloudinaryPublicId: uploaded.publicId,
        width: uploaded.width,
        height: uploaded.height,
        model: gen.model,
        replicateId: gen.predictionId,
        aspect,
        generatedAt: Date.now(),
      };
    });

    const succeeded = slotResults.filter((r) => r.ok).map((r) => r.value);
    const failed = slotResults
      .map((r, i) => (r.ok ? null : { slot: prompts[i].slot, error: r.error }))
      .filter(Boolean);

    // 4. Update the draft with image records.
    // We replace the entire `images` array on each run so regenerate is clean.
    let status;
    if (succeeded.length === 0) status = "failed";
    else if (failed.length > 0) status = "partial";
    else status = "ready";

    await draftRef.update({
      images: succeeded,
      imagesStatus: status,
      imagesError: failed.length ? `${failed.length} slot(s) failed: ${failed.map((f) => f.slot).join(", ")}` : null,
      imagesAspect: aspect,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      imagesCreated: succeeded.length,
      imagesFailed: failed.length,
      failures: failed,
      tokensUsed,
      aspect,
    };
  } catch (err) {
    // Hard failure (e.g. Claude prompter crashed). Mark the draft so UI shows the error.
    await draftRef.update({
      imagesStatus: "failed",
      imagesError: String(err?.message || err).slice(0, 500),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw err;
  }
}

module.exports = { runImageGeneration };
