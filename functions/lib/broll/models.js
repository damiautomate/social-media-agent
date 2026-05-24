// Registry of fal.ai video models we support for B-roll generation.
// Each entry knows its endpoint, input field shape, cost rate, and supported
// aspect ratios. Swapping models = changing the modelId string in brandConfig.

const MODELS = {
  "kling-2.6-pro": {
    endpoint: "fal-ai/kling-video/v2.6/pro/text-to-video",
    label: "Kling 2.6 Pro",
    costPerSecond: 0.10,
    durations: ["5", "10"],
    defaultDuration: "5",
    aspectRatios: ["9:16", "16:9", "1:1"],
    supportsAudio: true,
    estTimeSeconds: 90,
    promptField: "prompt",
    durationField: "duration",
    aspectField: "aspect_ratio",
    extraInput: { generate_audio: false },  // we layer voiceover in post
  },
  "kling-2.5-turbo-pro": {
    endpoint: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
    label: "Kling 2.5 Turbo Pro (faster, cheaper)",
    costPerSecond: 0.07,
    durations: ["5", "10"],
    defaultDuration: "5",
    aspectRatios: ["9:16", "16:9", "1:1"],
    supportsAudio: true,
    estTimeSeconds: 60,
    promptField: "prompt",
    durationField: "duration",
    aspectField: "aspect_ratio",
    extraInput: { generate_audio: false },
  },
  "kling-2.1-standard": {
    endpoint: "fal-ai/kling-video/v2.1/standard/text-to-video",
    label: "Kling 2.1 Standard (cheapest)",
    costPerSecond: 0.05,
    durations: ["5", "10"],
    defaultDuration: "5",
    aspectRatios: ["9:16", "16:9", "1:1"],
    supportsAudio: false,
    estTimeSeconds: 60,
    promptField: "prompt",
    durationField: "duration",
    aspectField: "aspect_ratio",
    extraInput: {},
  },
  "veo3-fast": {
    endpoint: "fal-ai/veo3/fast",
    label: "Veo 3 Fast (~$0.15/sec, top quality cheap tier)",
    costPerSecond: 0.15,
    durations: ["8"],
    defaultDuration: "8",
    aspectRatios: ["9:16", "16:9", "1:1"],
    supportsAudio: true,
    estTimeSeconds: 90,
    promptField: "prompt",
    durationField: "duration",
    aspectField: "aspect_ratio",
    extraInput: {},
  },
  "veo3-standard": {
    endpoint: "fal-ai/veo3",
    label: "Veo 3 Standard (~$0.40/sec, hero quality)",
    costPerSecond: 0.40,
    durations: ["8"],
    defaultDuration: "8",
    aspectRatios: ["9:16", "16:9", "1:1"],
    supportsAudio: true,
    estTimeSeconds: 180,
    promptField: "prompt",
    durationField: "duration",
    aspectField: "aspect_ratio",
    extraInput: {},
  },
};

const DEFAULT_MODEL_ID = "kling-2.6-pro";

function getModel(modelId) {
  return MODELS[modelId] || MODELS[DEFAULT_MODEL_ID];
}

function listModels() {
  return Object.entries(MODELS).map(([id, m]) => ({
    id,
    label: m.label,
    costPerSecond: m.costPerSecond,
    durations: m.durations,
    aspectRatios: m.aspectRatios,
    supportsAudio: m.supportsAudio,
    estTimeSeconds: m.estTimeSeconds,
  }));
}

function aspectFor(draft) {
  const platform = (draft.platform || "").toLowerCase();
  const fmt = (draft.formatType || "").toLowerCase();
  if (fmt === "reel" || fmt === "shortvideo" || fmt === "video" || platform === "tiktok") return "9:16";
  if (platform === "linkedin" || platform === "facebook") return "16:9";
  return "1:1";
}

module.exports = { MODELS, DEFAULT_MODEL_ID, getModel, listModels, aspectFor };
