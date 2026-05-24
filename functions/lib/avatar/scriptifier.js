// Converts a draft's written post into a spoken video script.
// Written posts read differently than they sound — line breaks, emoji,
// hashtags, "click below" CTAs all need rewriting for voice delivery.

const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function extractJson(text) {
  const trimmed = (text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1] : trimmed);
}

// Roughly: 150 words = 60 seconds of natural narration at normal pace.
// Platform-specific target lengths (in words) — HeyGen charges per second.
function targetWordsFor(draft) {
  const platform = (draft.platform || "").toLowerCase();
  const fmt = (draft.formatType || "").toLowerCase();

  // Reels / TikTok shortform: ~15-30 sec sweet spot
  if (fmt === "reel" || fmt === "shortvideo" || fmt === "video" || platform === "tiktok") {
    return { min: 30, target: 70, max: 100 };  // ~12-40s
  }
  // LinkedIn / Facebook native video: 30-60 sec is the engagement sweet spot
  if (platform === "linkedin" || platform === "facebook") {
    return { min: 60, target: 120, max: 180 };  // ~24-72s
  }
  // Default: medium-length
  return { min: 50, target: 100, max: 150 };
}

function buildSystemPrompt(brandConfig, wordBudget) {
  const identity = brandConfig.identity || {};
  const voice = brandConfig.voice || {};

  const samples = (voice.samplePosts || [])
    .slice(0, 2)
    .map((s) => (s.text || "").slice(0, 400))
    .join("\n---\n") || "(no samples)";

  return [
    `You are converting a written social media post by ${identity.name || "this creator"} into a spoken video script that will be delivered by an AI avatar.`,
    "",
    "## Voice anchors",
    `Tone: ${(voice.tone || []).join(", ") || "(unspecified)"}`,
    `Signature phrases the creator uses: ${(voice.signaturePhrases || []).join(" | ") || "(none)"}`,
    `Avoid phrases (NEVER use): ${(voice.avoidPhrases || []).join(", ") || "(none)"}`,
    "",
    "Sample of how this creator actually writes:",
    samples,
    "",
    "## Job",
    `Rewrite the post as a spoken script in this creator's voice. Target ${wordBudget.target} words (acceptable range ${wordBudget.min}-${wordBudget.max}). Long-form posts must be COMPRESSED to fit; do not pad short posts.`,
    "",
    "## Critical rules for spoken scripts",
    "1. STRONG HOOK in the first sentence (1-3 seconds of spoken time). Curiosity, contrarian, or specific number. Never start with 'In this video' or 'Today I want to talk about'.",
    "2. NO emoji, NO hashtags, NO 'click below', NO 'link in bio'. These don't work spoken.",
    "3. NO bullet points or list structure in the output. Speak in flowing sentences — if listing 3 things, say 'First... Second... Third...' or 'There are three things to know'.",
    "4. Short sentences. Spoken parsing is harder than read parsing. Aim for 8-15 words per sentence.",
    "5. Conversational, not formal. Contractions are fine (it's, you're, that's).",
    "6. End with a CONCRETE next step or curiosity hook — never 'thanks for watching' or 'follow for more'.",
    "7. Strip URLs, email addresses, account handles — these don't work in voice.",
    "8. If the original post has a question prompt at the end ('What's your take?'), KEEP IT — questions at end drive comments.",
    "",
    "## Output format",
    "Respond with ONLY a JSON object (no prose, no fences):",
    `{
  "script": "The full spoken script as a single string. Use natural sentence punctuation. Each sentence ends with . ! or ? — the avatar uses these for pacing.",
  "wordCount": <integer>,
  "estimatedSeconds": <integer, ~wordCount * 0.4>,
  "hookSummary": "1 sentence describing the hook strategy used"
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
    "## Original post text",
    draft.postText || "",
    draft.firstComment ? `\n## First comment (don't include in script unless it adds key context)\n${draft.firstComment}` : "",
    "",
    "Rewrite as a spoken script per system instructions. JSON only.",
  ].join("\n");
}

async function scriptifyDraft({ apiKey, draft, brandConfig }) {
  const wordBudget = targetWordsFor(draft);
  const systemPrompt = buildSystemPrompt(brandConfig, wordBudget);
  const userPrompt = buildUserPrompt(draft);

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = (res.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text content in scriptifier response");

  let parsed;
  try {
    parsed = extractJson(textBlock.text);
  } catch (e) {
    throw new Error(`Scriptifier JSON parse failed: ${e.message}. Raw: ${textBlock.text.slice(0, 200)}`);
  }

  if (!parsed.script || typeof parsed.script !== "string") {
    throw new Error("Scriptifier returned no script");
  }

  // Hard cap script length for safety (HeyGen has a 1500-char limit per voice block)
  const script = parsed.script.slice(0, 1400);

  const tokensUsed =
    (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);

  return {
    script,
    wordCount: parsed.wordCount || script.split(/\s+/).length,
    estimatedSeconds: parsed.estimatedSeconds || Math.round((script.split(/\s+/).length * 0.4)),
    hookSummary: parsed.hookSummary || null,
    tokensUsed,
  };
}

module.exports = { scriptifyDraft, targetWordsFor };
