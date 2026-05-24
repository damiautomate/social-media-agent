// B-roll pipeline:
//   1. Claude generates scene prompt(s) — 1 for single, N for storyboard
//   2. Submit each to fal.ai in parallel (max 2 concurrent — video is heavy)
//   3. Mirror each result to Cloudinary for permanent hosting
//   4. Update draft doc with the clip array

const { FieldValue } = require("firebase-admin/firestore");
const { generatePrompts } = require("./prompter.js");
const { generateClip } = require("./falai.js");
const { getModel, aspectFor } = require("./models.js");
const { uploadVideoToCloudinary } = require("../images/uploader.js");

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (e) {
        results[idx] = { ok: false, error: String(e?.message || e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function runBrollGeneration({ db, userId, jobId, draftId, mode, clipCount, brandConfig, apiKeys }) {
  const draftRef = db.collection("drafts").doc(draftId);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) throw new Error("Draft not found");
  const draft = draftSnap.data();
  if (draft.userId !== userId) throw new Error("Draft does not belong to this user");
  if (!draft.postText) throw new Error("Draft has no postText");

  // Resolve model + aspect from brandConfig
  const modelId =
    (brandConfig.videoStyle && brandConfig.videoStyle.broll && brandConfig.videoStyle.broll.modelId) ||
    "kling-2.6-pro";
  const model = getModel(modelId);
  const aspect = aspectFor(draft);
  // Honor model's supported aspect ratios; map anything else to closest
  const aspectRatio = model.aspectRatios.includes(aspect) ? aspect : model.aspectRatios[0];
  const duration =
    (brandConfig.videoStyle && brandConfig.videoStyle.broll && brandConfig.videoStyle.broll.duration) ||
    model.defaultDuration;

  await draftRef.update({
    brollStatus: "generating",
    brollMode: mode,
    brollJobId: jobId,
    brollError: null,
    brollModelId: modelId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    // 1. Scene prompts via Claude
    const { clips: prompts, tokensUsed } = await generatePrompts({
      apiKey: apiKeys.anthropic,
      draft,
      brandConfig,
      mode,
      clipCount,
    });

    // 2. Generate each clip via fal.ai (max 2 concurrent — video calls are heavy)
    const folder = `${(apiKeys.cloudinaryFolder || "social-agent")}/broll/${draftId}`;

    const slotResults = await mapWithConcurrency(prompts, 2, async (p) => {
      const generated = await generateClip({
        apiKey: apiKeys.falai,
        model,
        prompt: p.prompt,
        aspectRatio,
        duration,
      });
      // 3. Mirror to Cloudinary
      const uploaded = await uploadVideoToCloudinary({
        cloudName: apiKeys.cloudinaryCloud,
        apiKey: apiKeys.cloudinaryKey,
        apiSecret: apiKeys.cloudinarySecret,
        videoUrl: generated.videoUrl,
        folder,
        publicId: p.slot,
      });
      return {
        slot: p.slot,
        prompt: p.prompt,
        intent: p.intent,
        url: uploaded.secureUrl,
        falUrl: generated.videoUrl,        // original (will expire eventually)
        cloudinaryPublicId: uploaded.publicId,
        duration: uploaded.duration || Number(generated.duration) || 5,
        width: uploaded.width,
        height: uploaded.height,
        bytes: uploaded.bytes,
        model: modelId,
        aspect: aspectRatio,
        generatedAt: Date.now(),
      };
    });

    const succeeded = slotResults.filter((r) => r.ok).map((r) => r.value);
    const failed = slotResults
      .map((r, i) => (r.ok ? null : { slot: prompts[i].slot, error: r.error }))
      .filter(Boolean);

    let status;
    if (succeeded.length === 0) status = "failed";
    else if (failed.length > 0) status = "partial";
    else status = "ready";

    await draftRef.update({
      brollClips: succeeded,
      brollStatus: status,
      brollError: failed.length
        ? failed.map((f) => `${f.slot}: ${f.error}`).join(" | ").slice(0, 800)
        : null,
      brollAspect: aspectRatio,
      brollDuration: duration,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      clipsCreated: succeeded.length,
      clipsFailed: failed.length,
      tokensUsed,
      modelId,
      aspectRatio,
      duration,
    };
  } catch (err) {
    await draftRef.update({
      brollStatus: "failed",
      brollError: String(err?.message || err).slice(0, 800),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw err;
  }
}

module.exports = { runBrollGeneration };
