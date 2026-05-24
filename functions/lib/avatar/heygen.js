// HeyGen v2 API client.
// Auth: HeyGen uses a custom header `X-Api-Key`, NOT Bearer auth.
// Flow: submit → returns video_id → poll v1/video_status.get until done.

const HEYGEN_BASE = "https://api.heygen.com";

const POLL_INTERVAL_MS = 8000;     // 8 seconds between status checks
const POLL_MAX_TRIES = 60;         // up to 8 minutes total

// Dimensions per platform/format. HeyGen takes pixel width+height.
function dimensionsFor(draft) {
  const platform = (draft.platform || "").toLowerCase();
  const fmt = (draft.formatType || "").toLowerCase();

  // Vertical 9:16 for shortform
  if (fmt === "reel" || fmt === "shortvideo" || fmt === "video" || platform === "tiktok") {
    return { width: 720, height: 1280 };
  }
  // LinkedIn native: 1:1 square performs best on mobile feed
  if (platform === "linkedin" || platform === "facebook") {
    return { width: 1080, height: 1080 };
  }
  // Default: square
  return { width: 1080, height: 1080 };
}

async function heygenRequest(path, { apiKey, method = "GET", body }) {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    method,
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HeyGen ${path} HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

// List avatars available to the user (instant avatars + photo avatars + premade)
async function listAvatars(apiKey) {
  const data = await heygenRequest("/v2/avatars", { apiKey });
  const avatars = data?.data?.avatars || [];
  const photoAvatars = data?.data?.talking_photos || [];
  // Normalize to a single shape the UI can render
  return [
    ...avatars.map((a) => ({
      id: a.avatar_id,
      name: a.avatar_name || a.avatar_id,
      preview: a.preview_image_url || null,
      type: "avatar",
    })),
    ...photoAvatars.map((p) => ({
      id: p.talking_photo_id,
      name: p.talking_photo_name || p.talking_photo_id,
      preview: p.preview_image_url || null,
      type: "talking_photo",
    })),
  ];
}

async function listVoices(apiKey) {
  const data = await heygenRequest("/v2/voices", { apiKey });
  const voices = data?.data?.voices || [];
  return voices.map((v) => ({
    id: v.voice_id,
    name: v.name || v.voice_id,
    language: v.language || null,
    gender: v.gender || null,
    preview: v.preview_audio || null,
  }));
}

// Submit a video generation request. Returns video_id (use pollVideo to await).
async function submitVideo({ apiKey, script, avatarId, avatarType, voiceId, dimension, backgroundColor }) {
  const character =
    avatarType === "talking_photo"
      ? { type: "talking_photo", talking_photo_id: avatarId }
      : { type: "avatar", avatar_id: avatarId, avatar_style: "normal" };

  const body = {
    video_inputs: [
      {
        character,
        voice: {
          type: "text",
          input_text: script,
          voice_id: voiceId,
        },
        background: {
          type: "color",
          value: backgroundColor || "#0F1B2D",
        },
      },
    ],
    dimension: dimension || { width: 720, height: 1280 },
  };

  const data = await heygenRequest("/v2/video/generate", {
    apiKey,
    method: "POST",
    body,
  });
  const videoId = data?.data?.video_id;
  if (!videoId) throw new Error("HeyGen returned no video_id");
  return videoId;
}

// Poll status until video is ready. Returns the final video URL.
async function pollVideo({ apiKey, videoId }) {
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const data = await heygenRequest(`/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { apiKey });
    const status = data?.data?.status;

    if (status === "completed") {
      const videoUrl = data?.data?.video_url;
      const thumbnailUrl = data?.data?.thumbnail_url || null;
      const duration = data?.data?.duration || null;
      if (!videoUrl) throw new Error("HeyGen completed but returned no video_url");
      return { videoUrl, thumbnailUrl, duration };
    }
    if (status === "failed") {
      throw new Error(`HeyGen video failed: ${data?.data?.error?.detail || data?.data?.error?.message || "unknown"}`);
    }
    // Otherwise: pending | processing | waiting — keep polling
  }
  throw new Error("HeyGen video polling timed out (8 min)");
}

module.exports = {
  listAvatars,
  listVoices,
  submitVideo,
  pollVideo,
  dimensionsFor,
};
