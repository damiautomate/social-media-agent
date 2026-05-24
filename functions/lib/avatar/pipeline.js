// Orchestrates the avatar-video generation flow:
//   1. Scriptify the draft via Claude (post text → spoken script)
//   2. Submit to HeyGen with user's avatar + voice
//   3. Poll HeyGen until ready
//   4. Mirror the resulting video to Cloudinary (HeyGen URLs eventually expire)
//   5. Update the draft doc with final video URL + metadata

const { FieldValue } = require("firebase-admin/firestore");
const { scriptifyDraft } = require("./scriptifier.js");
const {
  submitVideo,
  pollVideo,
  dimensionsFor,
} = require("./heygen.js");
const { uploadVideoToCloudinary } = require("../images/uploader.js");

async function runAvatarVideo({ db, userId, jobId, draftId, brandConfig, apiKeys }) {
  // 1. Load draft
  const draftRef = db.collection("drafts").doc(draftId);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) throw new Error("Draft not found");
  const draft = draftSnap.data();
  if (draft.userId !== userId) throw new Error("Draft does not belong to this user");
  if (!draft.postText) throw new Error("Draft has no postText to convert");

  // Mark as generating immediately so UI flips
  await draftRef.update({
    avatarVideoStatus: "generating",
    avatarVideoJobId: jobId,
    avatarVideoError: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    // 2. Scriptify (Claude)
    const { script, wordCount, estimatedSeconds, hookSummary, tokensUsed } = await scriptifyDraft({
      apiKey: apiKeys.anthropic,
      draft,
      brandConfig,
    });

    // 3. Get avatar + voice config from brandConfig
    const avatarCfg = (brandConfig.videoStyle && brandConfig.videoStyle.avatar) || {};
    if (!avatarCfg.avatarId) throw new Error("No avatar selected. Pick one in Settings → HeyGen.");
    if (!avatarCfg.voiceId) throw new Error("No voice selected. Pick one in Settings → HeyGen.");

    const dimension = dimensionsFor(draft);
    const backgroundColor =
      (brandConfig.videoStyle && brandConfig.videoStyle.backgroundColor) || "#0F1B2D";

    // 4. Submit to HeyGen
    const videoId = await submitVideo({
      apiKey: apiKeys.heygen,
      script,
      avatarId: avatarCfg.avatarId,
      avatarType: avatarCfg.avatarType || "avatar",
      voiceId: avatarCfg.voiceId,
      dimension,
      backgroundColor,
    });

    // Update draft with the in-progress video ID (useful for debugging if it stalls)
    await draftRef.update({
      avatarVideoHeygenId: videoId,
      avatarVideoScript: script,
      avatarVideoScriptWordCount: wordCount,
      avatarVideoScriptHook: hookSummary || null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 5. Poll HeyGen until ready (up to 8 minutes)
    const { videoUrl, thumbnailUrl, duration } = await pollVideo({
      apiKey: apiKeys.heygen,
      videoId,
    });

    // 6. Mirror to Cloudinary for permanent hosting (HeyGen URLs expire)
    const folder = `${(apiKeys.cloudinaryFolder || "social-agent")}/avatar-videos/${draftId}`;
    const uploaded = await uploadVideoToCloudinary({
      cloudName: apiKeys.cloudinaryCloud,
      apiKey: apiKeys.cloudinaryKey,
      apiSecret: apiKeys.cloudinarySecret,
      videoUrl,
      folder,
      publicId: "main",
    });

    // 7. Mark draft as ready with final video info
    await draftRef.update({
      avatarVideoStatus: "ready",
      avatarVideoUrl: uploaded.secureUrl,
      avatarVideoHeygenUrl: videoUrl,   // original (will expire) — kept for debugging
      avatarVideoThumbnailUrl: thumbnailUrl,
      avatarVideoDuration: duration || uploaded.duration || estimatedSeconds,
      avatarVideoDimension: dimension,
      avatarVideoError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      videoId,
      cloudinaryUrl: uploaded.secureUrl,
      duration: duration || uploaded.duration || estimatedSeconds,
      wordCount,
      estimatedSeconds,
      tokensUsed,
    };
  } catch (err) {
    await draftRef.update({
      avatarVideoStatus: "failed",
      avatarVideoError: String(err?.message || err).slice(0, 800),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw err;
  }
}

module.exports = { runAvatarVideo };
