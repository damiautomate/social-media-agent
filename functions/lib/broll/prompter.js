// Generates B-roll scene prompts for a draft.
// Two modes:
//   - single: one scene prompt (cover/hook)
//   - storyboard: N scenes (3-5) that form a narrative arc complementing the post

const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function extractJson(text) {
  const trimmed = (text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1] : trimmed);
}

function buildSystemPrompt(brandConfig, mode, clipCount) {
  const identity = brandConfig.identity || {};
  const vis = brandConfig.visualStyle || {};
  const colors = (vis.colorPalette || []).join(", ") || "(unspecified)";
  const avoid = (vis.avoidElements || []).join(", ") || "(none)";

  const sceneSpec =
    mode === "storyboard"
      ? `You will write ${clipCount} short B-roll scene prompts that form a narrative arc accompanying the post. Each scene runs 5 seconds; sequence them so they pair coherently when cut together. Think of it as the visual storyboard a video editor would shoot to support the spoken content.`
      : "You will write ONE B-roll scene prompt — a single short atmospheric clip that visually anchors the core idea of the post.";

  return [
    `You are a video director writing B-roll scene prompts for an AI video model (Kling / Veo).`,
    `These scenes will support a social media post by ${identity.name || "this creator"} working in: ${(identity.niche || []).join(", ") || "(unspecified)"}.`,
    "",
    "## Aesthetic anchors",
    `Visual style: ${vis.description || "modern, clean, editorial"}`,
    `Aesthetic: ${vis.aesthetic || "modern_minimalist"}`,
    `Color palette to honor: ${colors}`,
    `NEVER include: ${avoid}, embedded text, on-screen captions, watermarks, brand logos, human faces speaking to camera (this is B-roll, not a talking head)`,
    "",
    `## Scene spec`,
    sceneSpec,
    "",
    "## Writing rules for video prompts",
    "1. Each prompt must be CONCRETE: subject, action, camera, lighting, mood. Vague prompts produce generic clips.",
    "2. Specify camera language: 'slow push-in', 'static wide', 'overhead shot', 'tracking from left', 'shallow depth of field'. AI models follow camera cues better than they follow abstract directions.",
    "3. Specify lighting: 'soft morning sunlight', 'cool blue desk light', 'warm tungsten', 'high-key studio'. Lighting drives mood more than anything.",
    "4. Specify motion: 'gentle hand movement', 'liquid pouring slowly', 'paper shuffling'. Static prompts produce dead scenes.",
    "5. NO text in scene (caption overlay will be added later in editing).",
    "6. NO faces speaking to camera — this is B-roll.",
    "7. NO logos or recognizable brand names.",
    "8. Each prompt 30-80 words. Too short = generic, too long = AI ignores the tail.",
    "9. If subject involves tech/work/automation, lean into: laptop close-ups, desk scenes, dashboards on screens (no readable text), workspace details, hands on keyboard. Avoid stock cliches like handshakes or pointing at monitors.",
    "",
    "## Output format",
    "Respond ONLY with a JSON object (no prose, no markdown fences):",
    `{
  "clips": [
    {
      "slot": "scene_1",
      "prompt": "<the full scene prompt, 30-80 words>",
      "intent": "<one phrase explaining how this scene supports the post>"
    }${mode === "storyboard" ? `,\n    { "slot": "scene_2", "prompt": "...", "intent": "..." }\n    // ${clipCount} clips total in storyboard order` : ""}
  ]
}`,
  ].join("\n");
}

function buildUserPrompt(draft) {
  const meta = [];
  if (draft.platform) meta.push(`Platform: ${draft.platform}`);
  if (draft.formatType) meta.push(`Format: ${draft.formatType}`);
  if (draft.pillar) meta.push(`Pillar: ${draft.pillar}`);

  return [
    meta.join(" · "),
    "",
    "## Post text the B-roll supports",
    draft.postText || "",
    "",
    "Write the scene prompt(s) per system instructions. JSON only.",
  ].join("\n");
}

async function generatePrompts({ apiKey, draft, brandConfig, mode, clipCount }) {
  const safeClipCount = mode === "storyboard" ? Math.min(Math.max(clipCount || 3, 2), 5) : 1;
  const systemPrompt = buildSystemPrompt(brandConfig, mode, safeClipCount);
  const userPrompt = buildUserPrompt(draft);

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = (res.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text content in prompter response");

  let parsed;
  try {
    parsed = extractJson(textBlock.text);
  } catch (e) {
    throw new Error(`B-roll prompter JSON parse failed: ${e.message}. Raw: ${textBlock.text.slice(0, 200)}`);
  }

  const clips = Array.isArray(parsed.clips) ? parsed.clips : [];
  if (clips.length === 0) throw new Error("Prompter returned 0 clips");

  // Sanitize, clamp count, ensure each has prompt+slot
  const sanitized = clips.slice(0, safeClipCount).map((c, i) => ({
    slot: c.slot || `scene_${i + 1}`,
    prompt: String(c.prompt || "").slice(0, 600),
    intent: c.intent || null,
  })).filter((c) => c.prompt.length > 0);

  if (sanitized.length === 0) throw new Error("All prompts were empty after sanitize");

  const tokensUsed =
    (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);

  return { clips: sanitized, tokensUsed };
}

module.exports = { generatePrompts };
