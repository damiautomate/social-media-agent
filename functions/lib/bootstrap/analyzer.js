// Brand bootstrap: analyzes a creator's existing content (bio + posts + optional
// YouTube channel) and proposes a complete brand profile — identity, voice, and
// content pillars — that the user can then review and apply.

const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
const { fetchYouTube } = require("../research/fetchers/youtube.js");

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_OUTPUT_TOKENS = 4000;
const MAX_POSTS_IN_PROMPT = 12;
const MAX_POST_LEN = 1500;

function extractJson(text) {
  const trimmed = (text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1] : trimmed);
}

function buildSystemPrompt() {
  return [
    "You are a brand strategist analyzing a creator's existing content to bootstrap their brand profile for a content automation system.",
    "",
    "You will receive: a bio, 1-12 representative posts they've written, optionally recent YouTube video titles + descriptions, and optional user notes about how they want to position themselves.",
    "",
    "Your job: output a complete brand profile as JSON with three sections — identity, voice, contentPillars.",
    "",
    "## identity",
    "- name: the creator's name if mentioned anywhere, else empty string",
    "- handle: their primary social handle if mentioned (without @), else empty string",
    "- tagline: one sentence (~15 words) capturing what they do and who they help. Synthesize from the corpus. Make it specific — 'helps SaaS founders' is bad, 'shows B2B founders the lead-gen plays Gmail and LinkedIn won't' is good.",
    "",
    "## voice",
    "- tone: array of 3-5 descriptors observed in their actual writing (e.g. 'Direct', 'Self-deprecating', 'Hands-on'). NOT generic adjectives like 'Engaging' or 'Professional'.",
    "- signaturePhrases: array of 3-8 phrases the creator actually uses repeatedly across the posts. Real phrases, not invented ones. If you can't find 3 genuine ones, output fewer.",
    "- avoidPhrases: array of 4-8 phrases this creator would NEVER write. Infer from what's absent. If their tone is direct and concrete, the avoid list is corporate buzzwords ('synergy', 'leverage', 'game-changer'). If their tone is irreverent, the avoid list might be over-formal phrases. Be specific to this creator.",
    "- samplePosts: array of 2-4 of the BEST representative posts from the input, formatted as { platform: 'linkedin' | 'twitter' | 'instagram' | 'tiktok' | 'unknown', text: '<the post text, up to 800 chars>', engagement: null }",
    "",
    "## contentPillars",
    "Cluster the corpus into 3-6 content pillars. Each pillar:",
    "- id: lowercase snake_case identifier (e.g. 'automation', 'client_work', 'mindset')",
    "- name: 1-2 word display name (e.g. 'Automation', 'Client Work')",
    "- description: one sentence — what this pillar covers and the audience subset it speaks to",
    "- weight: integer 0-100. All weights MUST sum to exactly 100. Larger = more frequent posting.",
    "- angles: array of 3-5 specific angle suggestions the creator could write about within this pillar. Make them concrete, not generic ('the workflow I'd build first if I started over' not 'workflow tips').",
    "",
    "## Critical rules",
    "1. Output ONLY a single JSON object — no prose, no markdown fences.",
    "2. The creator's actual voice MUST come through in the signaturePhrases and samplePosts. Do not invent phrases they don't use.",
    "3. If user notes specify a preference (e.g. 'focus more on automation than CRM'), respect it in the pillar weights.",
    "4. If input is sparse (e.g. only a bio, no posts), still produce a profile but mark uncertain fields with shorter arrays rather than padding with guesses.",
    "5. Pillar weights MUST sum to 100. Verify before output.",
    "",
    "## Output shape",
    `{
  "identity": { "name": "", "handle": "", "tagline": "" },
  "voice": {
    "tone": [],
    "signaturePhrases": [],
    "avoidPhrases": [],
    "samplePosts": [{ "platform": "", "text": "", "engagement": null }]
  },
  "contentPillars": [
    { "id": "", "name": "", "description": "", "weight": 0, "angles": [] }
  ],
  "analystNotes": "1-2 sentence summary of what you noticed about this creator's positioning and voice."
}`,
  ].join("\n");
}

function buildUserPrompt({ bio, posts, youtubeContent, userNotes }) {
  const sections = [];

  if (bio && bio.trim()) {
    sections.push(`## Bio\n${bio.trim()}`);
  }

  if (posts && posts.length) {
    sections.push("## Representative posts");
    posts.slice(0, MAX_POSTS_IN_PROMPT).forEach((p, i) => {
      sections.push(`### Post ${i + 1}\n${String(p).slice(0, MAX_POST_LEN).trim()}`);
    });
  }

  if (youtubeContent && youtubeContent.length) {
    sections.push("## Recent YouTube content (titles + descriptions)");
    youtubeContent.forEach((v, i) => {
      sections.push(`- ${v.title}${v.snippet ? `: ${v.snippet.slice(0, 200)}` : ""}`);
    });
  }

  if (userNotes && userNotes.trim()) {
    sections.push(`## User notes on positioning\n${userNotes.trim()}`);
  }

  sections.push(
    "Produce the brand profile JSON per the system instructions. Output JSON only.",
  );
  return sections.join("\n\n");
}

// Parses raw posts text into an array. Supports either separator-based input
// (--- on its own line) or blank-line-separated paragraphs (if no --- found).
function parsePostsBlob(blob) {
  if (!blob || typeof blob !== "string") return [];
  const trimmed = blob.trim();
  if (!trimmed) return [];

  let parts;
  if (trimmed.includes("\n---\n") || trimmed.includes("\n---")) {
    parts = trimmed.split(/\n-{3,}\n?/);
  } else {
    parts = trimmed.split(/\n\s*\n/);
  }
  return parts.map((p) => p.trim()).filter((p) => p.length >= 20);
}

// Normalizes the analyzer output so the UI gets a predictable shape and pillar
// weights sum to 100 even if Claude was slightly off.
function normalizeProposal(raw) {
  const identity = raw?.identity || {};
  const voice = raw?.voice || {};

  let pillars = Array.isArray(raw?.contentPillars) ? raw.contentPillars : [];
  pillars = pillars
    .filter((p) => p && p.id && p.name)
    .slice(0, 6)
    .map((p) => ({
      id: String(p.id).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      name: String(p.name).slice(0, 40),
      description: String(p.description || "").slice(0, 300),
      weight: Math.max(0, Math.round(Number(p.weight) || 0)),
      angles: Array.isArray(p.angles)
        ? p.angles.map((a) => String(a).slice(0, 150)).filter(Boolean).slice(0, 6)
        : [],
    }));

  // Force weights to sum to 100
  const totalWeight = pillars.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight > 0 && totalWeight !== 100) {
    const scale = 100 / totalWeight;
    let running = 0;
    pillars.forEach((p, i) => {
      if (i === pillars.length - 1) {
        p.weight = 100 - running;
      } else {
        p.weight = Math.round(p.weight * scale);
        running += p.weight;
      }
    });
  } else if (pillars.length > 0 && totalWeight === 0) {
    // All zero — distribute evenly
    const even = Math.floor(100 / pillars.length);
    pillars.forEach((p, i) => {
      p.weight = i === pillars.length - 1 ? 100 - even * (pillars.length - 1) : even;
    });
  }

  const samplePosts = Array.isArray(voice.samplePosts)
    ? voice.samplePosts
        .filter((s) => s && s.text)
        .slice(0, 5)
        .map((s) => ({
          platform: String(s.platform || "unknown").toLowerCase(),
          text: String(s.text).slice(0, 1000),
          engagement: null,
        }))
    : [];

  const cleanArray = (a, max = 10, len = 80) =>
    Array.isArray(a)
      ? a.map((x) => String(x).slice(0, len)).filter(Boolean).slice(0, max)
      : [];

  return {
    identity: {
      name: String(identity.name || "").slice(0, 100),
      handle: String(identity.handle || "").replace(/^@/, "").slice(0, 60),
      tagline: String(identity.tagline || "").slice(0, 250),
    },
    voice: {
      tone: cleanArray(voice.tone, 6, 40),
      signaturePhrases: cleanArray(voice.signaturePhrases, 8, 120),
      avoidPhrases: cleanArray(voice.avoidPhrases, 10, 120),
      samplePosts,
    },
    contentPillars: pillars,
    analystNotes: String(raw?.analystNotes || "").slice(0, 500),
  };
}

// Optional: pull YouTube content if the user gave us a channel ID.
async function fetchYouTubeIfProvided(channelId) {
  if (!channelId || !channelId.trim()) return [];
  try {
    const source = {
      id: "bootstrap_yt",
      type: "youtube",
      enabled: true,
      label: "User YouTube",
      config: { channelId: channelId.trim() },
    };
    const signals = await fetchYouTube(source);
    return signals.slice(0, 10).map((s) => ({
      title: s.title,
      snippet: s.snippet,
    }));
  } catch (e) {
    // Non-fatal — we just skip YouTube content if the channel is unreachable.
    console.warn("Bootstrap YouTube fetch failed:", e.message);
    return [];
  }
}

async function runBootstrap({ apiKey, bio, postsBlob, youtubeChannelId, userNotes }) {
  const posts = parsePostsBlob(postsBlob);
  const youtubeContent = await fetchYouTubeIfProvided(youtubeChannelId);

  if (posts.length === 0 && (!bio || !bio.trim()) && youtubeContent.length === 0) {
    throw new Error("No content provided. Need at least a bio, some posts, or a YouTube channel ID.");
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({ bio, posts, youtubeContent, userNotes });

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = (res.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text content in bootstrap response");

  let parsed;
  try {
    parsed = extractJson(textBlock.text);
  } catch (e) {
    throw new Error(`Bootstrap JSON parse failed: ${e.message}. Raw: ${textBlock.text.slice(0, 200)}`);
  }

  const proposal = normalizeProposal(parsed);
  const tokensUsed =
    (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);

  return {
    proposal,
    inputSummary: {
      postsCount: posts.length,
      bioLength: (bio || "").length,
      youtubeCount: youtubeContent.length,
      hadUserNotes: !!(userNotes && userNotes.trim()),
    },
    tokensUsed,
  };
}

module.exports = {
  runBootstrap,
  parsePostsBlob,
  normalizeProposal,
  buildSystemPrompt,
  buildUserPrompt,
};
