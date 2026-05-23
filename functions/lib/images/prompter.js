// Generates platform-appropriate image prompts for a draft using Claude.
// One Claude call returns N prompts (one for each image slot the draft needs),
// each shaped by the brand's visualStyle config.

const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function extractJson(text) {
  const trimmed = (text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1] : trimmed);
}

// Decides how many image slots this draft needs and what to label them.
// Returns an array like [{ slot: "cover", contextText: "..." }] for single posts,
// or [{ slot: "slide_1", contextText: "..." }, ...] for carousels.
function deriveImageSlots(draft) {
  const fmt = (draft.formatType || "").toLowerCase();

  if (fmt === "carousel" && Array.isArray(draft.carouselSlides) && draft.carouselSlides.length > 0) {
    return draft.carouselSlides.map((slide, i) => ({
      slot: `slide_${i + 1}`,
      contextText: typeof slide === "string" ? slide : (slide.text || ""),
    }));
  }

  if (fmt === "reel" || fmt === "shortvideo" || fmt === "video" || fmt === "nativevideo") {
    // Cover thumbnail for video formats.
    return [{ slot: "cover", contextText: draft.hookPreview || draft.postText || "" }];
  }

  if (fmt === "document") {
    return []; // documents are PDFs, no images
  }

  // Default: single cover image for textPost / single / anything else.
  return [{ slot: "cover", contextText: draft.postText || "" }];
}

// Picks an aspect ratio compatible with Replicate Flux models.
function aspectFor(draft) {
  const platform = (draft.platform || "").toLowerCase();
  const fmt = (draft.formatType || "").toLowerCase();

  if (fmt === "reel" || fmt === "shortvideo" || fmt === "video" || fmt === "nativevideo") return "9:16";
  if (fmt === "carousel") return platform === "instagram" ? "4:5" : "1:1";
  if (platform === "linkedin" || platform === "facebook") return "1.91:1";
  return "1:1";
}

function buildSystemPrompt(brandConfig) {
  const identity = brandConfig.identity || {};
  const visualStyle = brandConfig.visualStyle || {};

  const aestheticLines = [];
  if (visualStyle.description) aestheticLines.push(`Overall aesthetic: ${visualStyle.description}`);
  if (visualStyle.aesthetic) aestheticLines.push(`Style category: ${visualStyle.aesthetic}`);
  if (Array.isArray(visualStyle.colorPalette) && visualStyle.colorPalette.length) {
    aestheticLines.push(`Color palette: ${visualStyle.colorPalette.join(", ")}`);
  }
  if (Array.isArray(visualStyle.avoidElements) && visualStyle.avoidElements.length) {
    aestheticLines.push(`Avoid: ${visualStyle.avoidElements.join("; ")}`);
  }
  const aestheticBlock = aestheticLines.length
    ? aestheticLines.join("\n")
    : "No specific visual style configured — default to clean, modern, content-focused imagery.";

  return [
    `You are writing image generation prompts for ${identity.name || "this creator"}'s social media posts.`,
    "",
    "## Visual brand",
    aestheticBlock,
    "",
    "## Your job",
    "For each slot listed in the user message, write ONE detailed image prompt suitable for Flux Schnell (a fast text-to-image model).",
    "",
    "Rules for each prompt:",
    "1. 30-80 words. Specific, visual, scene-driven — not abstract.",
    "2. NEVER include text/typography in the image. No words, captions, titles, watermarks, signage, or readable text of any kind. The post text lives outside the image.",
    "3. Anchor the visual to the slot's contextText, but translate it into a SCENE, not a literal illustration of the words.",
    "4. Bake the visual brand into every prompt (palette hints, mood, composition style) so all images feel like one coherent set.",
    "5. For carousels, vary scenes across slides while keeping the visual brand consistent — same world, different shots.",
    "6. Explicitly avoid the avoid-list items.",
    "7. No people's faces unless the contextText demands it. If a person appears, describe them as anonymous (no celebrity / specific identity).",
    "",
    "## Output format",
    "Respond with ONLY a single JSON object, no prose, no fences:",
    `{
  "prompts": [
    { "slot": "<the slot name from input>", "prompt": "<the image prompt>" }
  ]
}`,
    "Order MUST match the input slot order. Return exactly one prompt per input slot.",
  ].join("\n");
}

function buildUserPrompt(draft, slots) {
  const slotLines = slots.map((s, i) =>
    `[${i + 1}] slot="${s.slot}" — contextText: ${s.contextText.slice(0, 500)}`
  ).join("\n\n");

  return [
    `Platform: ${draft.platform || "(none)"}`,
    `Format: ${draft.formatType || "(none)"}`,
    `Pillar: ${draft.pillar || "(none)"}`,
    `Hook: ${draft.hookPreview || "(none)"}`,
    "",
    `Post body (for tone reference, do NOT render as text in the image):`,
    (draft.postText || "").slice(0, 800),
    "",
    "## Slots needing image prompts",
    slotLines,
    "",
    "Write one prompt per slot per the system instructions. JSON only.",
  ].join("\n");
}

async function generateImagePrompts({ apiKey, draft, brandConfig }) {
  const slots = deriveImageSlots(draft);
  if (slots.length === 0) {
    return { prompts: [], aspect: aspectFor(draft) };
  }

  const systemPrompt = buildSystemPrompt(brandConfig);
  const userPrompt = buildUserPrompt(draft, slots);

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = (res.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text in prompter response");

  let parsed;
  try {
    parsed = extractJson(textBlock.text);
  } catch (e) {
    throw new Error(`Prompter JSON parse failed: ${e.message}`);
  }

  const rawPrompts = Array.isArray(parsed?.prompts) ? parsed.prompts : [];

  // Align prompts back to slots by order; fall back to generic if missing.
  const aligned = slots.map((s, i) => {
    const found = rawPrompts[i] || rawPrompts.find((p) => p.slot === s.slot);
    return {
      slot: s.slot,
      prompt: found?.prompt ? String(found.prompt).slice(0, 1200) : `Modern, clean illustration matching the brand aesthetic for: ${s.contextText.slice(0, 200)}`,
    };
  });

  const tokensUsed =
    (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);

  return {
    prompts: aligned,
    aspect: aspectFor(draft),
    tokensUsed,
  };
}

module.exports = {
  generateImagePrompts,
  deriveImageSlots,
  aspectFor,
};
