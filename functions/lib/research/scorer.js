// Scores raw signals into ranked content ideas using Claude.
// One single call per research run — Claude sees the whole batch
// so it can dedupe semantically and rank comparatively.

const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_SIGNALS_TO_SCORE = 80;  // hard cap to keep prompt size sane
const MAX_OUTPUT_TOKENS = 4000;

function extractJson(text) {
  const trimmed = (text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : trimmed;
  return JSON.parse(candidate);
}

function clamp(n, lo, hi) {
  const x = Number(n);
  if (Number.isNaN(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function composite(scores, weights) {
  const w = weights || {};
  const total =
    (Number(w.relevance) || 0) +
    (Number(w.novelty)   || 0) +
    (Number(w.voiceFit)  || 0) +
    (Number(w.urgency)   || 0);
  const denom = total > 0 ? total : 1;
  const r = clamp(scores?.relevance, 0, 10);
  const n = clamp(scores?.novelty,   0, 10);
  const v = clamp(scores?.voiceFit,  0, 10);
  const u = clamp(scores?.urgency,   0, 10);
  const raw =
    r * (Number(w.relevance) || 0) +
    n * (Number(w.novelty)   || 0) +
    v * (Number(w.voiceFit)  || 0) +
    u * (Number(w.urgency)   || 0);
  return Math.round((raw / denom) * 10) / 10; // 0-10, one decimal
}

function buildSystemPrompt(brandConfig, weights, targetCount) {
  const identity = brandConfig.identity || {};
  const voice = brandConfig.voice || {};
  const pillars = brandConfig.contentPillars || [];

  const tone = (voice.tone || []).join(", ");
  const signature = (voice.signaturePhrases || []).join(" | ") || "(none)";
  const avoid = (voice.avoidPhrases || []).join(", ") || "(none)";

  const samples = (voice.samplePosts || [])
    .slice(0, 3)
    .map((s, i) => `Sample ${i + 1} (${s.platform || "any"}):\n${(s.text || "").slice(0, 600)}`)
    .join("\n\n") || "(no samples provided)";

  const pillarLines = pillars
    .map((p) => `- id="${p.id}" — ${p.name}: ${p.description} (weight ${p.weight}; angles: ${(p.angles || []).join(" | ")})`)
    .join("\n") || "(no pillars defined)";

  const validPillarIds = pillars.map((p) => p.id).join(", ") || "(none)";

  return [
    `You are a research analyst building a content idea bank for ${identity.name || "this user"}` +
      (identity.handle ? ` (@${identity.handle})` : "") + ".",
    identity.tagline ? `Tagline: ${identity.tagline}` : "",
    "",
    "## Voice",
    `Tone descriptors: ${tone || "(unspecified)"}`,
    `Signature phrases the user reaches for: ${signature}`,
    `Phrases to NEVER suggest: ${avoid}`,
    "",
    "## Sample posts (this is the user's actual voice)",
    samples,
    "",
    "## Content pillars (each idea MUST map to one of these by id)",
    pillarLines,
    `Valid pillarId values: ${validPillarIds}`,
    "",
    "## Your job",
    `You will receive a batch of raw signals (forum posts, articles, videos, discussions) gathered from this user's research sources. Output the top ${targetCount} content ideas the user should consider posting about, ranked by overall fit.`,
    "",
    "Rules:",
    "1. Dedupe SEMANTICALLY. If 3 signals are about the same underlying topic, produce ONE idea that cites all 3.",
    "2. You may combine multiple related signals into a single richer idea.",
    "3. Skip signals that don't fit the user's pillars — do not stretch.",
    "4. Each idea must have a concrete angle, not a generic topic. 'AI agents' is bad. 'Why most AI agent demos collapse on a 5-step task' is good.",
    "5. Match the user's voice when writing the topic and angle (use their signature phrasing patterns, avoid their banned phrases).",
    "",
    "## Scoring (each 0-10)",
    "Score every idea on four dimensions:",
    `- relevance: how closely does this connect to the user's pillars and audience? Weight in composite: ${weights.relevance}.`,
    `- novelty: is this fresh / contrarian / underdiscussed, or rehashed common knowledge? Weight: ${weights.novelty}.`,
    `- voiceFit: would this user naturally write about this, given their voice samples? Weight: ${weights.voiceFit}.`,
    `- urgency: is this time-sensitive (trending now, news hook) vs evergreen? Weight: ${weights.urgency}.`,
    "",
    "## Output format",
    "Respond with ONLY a single JSON object — no prose, no markdown fences:",
    `{
  "ideas": [
    {
      "topic": "Short topic statement (10-20 words)",
      "angle": "The specific angle / hook this idea takes (one sentence)",
      "pillarId": "one of the valid pillar ids above",
      "scores": { "relevance": 0-10, "novelty": 0-10, "voiceFit": 0-10, "urgency": 0-10 },
      "sourceSignalIds": ["s1", "s7"],
      "reasoning": "1-2 sentences on why this scored as it did"
    }
  ]
}`,
    `Return exactly ${targetCount} ideas (fewer is OK if there isn't enough material — never invent ideas unrelated to the signals).`,
  ].filter(Boolean).join("\n");
}

function buildUserPrompt(signals) {
  // Pin a stable index to each signal so Claude can cite them.
  const lines = signals.map((s, i) => {
    const idx = `s${i + 1}`;
    const meta = [];
    if (s.score != null) meta.push(`score=${s.score}`);
    if (s.author) meta.push(`by=${s.author}`);
    if (s.meta?.subreddit) meta.push(`sub=r/${s.meta.subreddit}`);
    const metaStr = meta.length ? ` (${meta.join(", ")})` : "";
    const snippet = (s.snippet || "").slice(0, 400);
    return `[${idx}] (${s.sourceLabel} · ${s.sourceType})${metaStr}
TITLE: ${s.title}
${snippet ? `SNIPPET: ${snippet}\n` : ""}URL: ${s.url}`;
  });

  return [
    `Here are ${signals.length} fresh signals from the user's research sources. Produce the top ideas per the system instructions.`,
    "",
    lines.join("\n\n"),
  ].join("\n");
}

async function scoreSignalsIntoIdeas({ apiKey, brandConfig, signals, targetCount, weights }) {
  // Trim signals to a hard cap. Prefer the most recent + highest-score ones.
  const capped = [...signals]
    .sort((a, b) => {
      const sa = (a.score || 0) + (a.publishedAt || 0) / 1e13;
      const sb = (b.score || 0) + (b.publishedAt || 0) / 1e13;
      return sb - sa;
    })
    .slice(0, MAX_SIGNALS_TO_SCORE);

  if (capped.length === 0) {
    return { ideas: [], tokensUsed: 0 };
  }

  const systemPrompt = buildSystemPrompt(brandConfig, weights, targetCount);
  const userPrompt = buildUserPrompt(capped);

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = (res.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text content in scorer response");

  let parsed;
  try {
    parsed = extractJson(textBlock.text);
  } catch (e) {
    throw new Error(`Scorer JSON parse failed: ${e.message}. Raw: ${textBlock.text.slice(0, 200)}`);
  }

  const rawIdeas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
  const validPillarIds = new Set((brandConfig.contentPillars || []).map((p) => p.id));

  // Map signal index references (s1, s2, ...) back to actual signals.
  const signalByIdx = {};
  capped.forEach((s, i) => { signalByIdx[`s${i + 1}`] = s; });

  const ideas = rawIdeas
    .filter((it) => it && typeof it.topic === "string" && it.topic.trim())
    .map((it) => {
      const scores = {
        relevance: clamp(it.scores?.relevance, 0, 10),
        novelty:   clamp(it.scores?.novelty,   0, 10),
        voiceFit:  clamp(it.scores?.voiceFit,  0, 10),
        urgency:   clamp(it.scores?.urgency,   0, 10),
      };
      const refSignals = (it.sourceSignalIds || [])
        .map((id) => signalByIdx[id])
        .filter(Boolean);

      // Coerce pillarId to a valid one (fall back to first pillar if invalid)
      let pillarId = it.pillarId;
      if (!validPillarIds.has(pillarId)) {
        pillarId = (brandConfig.contentPillars || [])[0]?.id || null;
      }

      return {
        topic: String(it.topic).trim(),
        angle: it.angle ? String(it.angle).trim() : null,
        pillarId,
        scores,
        relevanceScore: composite(scores, weights),
        urgency: scores.urgency >= 8 ? "high" : scores.urgency >= 5 ? "normal" : "low",
        sourceUrls: refSignals.map((s) => s.url),
        sourceLabels: [...new Set(refSignals.map((s) => s.sourceLabel))],
        reasoning: it.reasoning ? String(it.reasoning).slice(0, 500) : null,
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const tokensUsed =
    (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);

  return { ideas, tokensUsed };
}

module.exports = {
  scoreSignalsIntoIdeas,
  buildSystemPrompt, // exported for unit testing
  buildUserPrompt,
  composite,
  CLAUDE_MODEL,
};
