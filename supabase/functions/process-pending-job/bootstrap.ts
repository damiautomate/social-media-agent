// Brand bootstrap analyzer, ported to Deno.
import { anthropicMessage, extractJson } from "./shared.ts";
import { fetchYouTubeForBootstrap } from "./research.ts";

function bootstrapSystemPrompt(): string {
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
    "- tagline: one sentence (~15 words) capturing what they do and who they help. Synthesize from the corpus. Make it specific.",
    "",
    "## voice",
    "- tone: array of 3-5 descriptors observed in their actual writing. NOT generic adjectives like 'Engaging' or 'Professional'.",
    "- signaturePhrases: array of 3-8 phrases the creator actually uses repeatedly across the posts. Real phrases, not invented ones.",
    "- avoidPhrases: array of 4-8 phrases this creator would NEVER write. Infer from what's absent. Be specific to this creator.",
    "- samplePosts: array of 2-4 of the BEST representative posts from the input, formatted as { platform: 'linkedin' | 'twitter' | 'instagram' | 'tiktok' | 'unknown', text: '<the post text, up to 800 chars>', engagement: null }",
    "",
    "## contentPillars",
    "Cluster the corpus into 3-6 content pillars. Each pillar:",
    "- id: lowercase snake_case identifier",
    "- name: 1-2 word display name",
    "- description: one sentence — what this pillar covers and the audience subset it speaks to",
    "- weight: integer 0-100. All weights MUST sum to exactly 100. Larger = more frequent posting.",
    "- angles: array of 3-5 specific angle suggestions. Make them concrete, not generic.",
    "",
    "## Critical rules",
    "1. Output ONLY a single JSON object — no prose, no markdown fences.",
    "2. The creator's actual voice MUST come through in the signaturePhrases and samplePosts. Do not invent phrases they don't use.",
    "3. If user notes specify a preference, respect it in the pillar weights.",
    "4. If input is sparse, still produce a profile but mark uncertain fields with shorter arrays rather than padding with guesses.",
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

function bootstrapUserPrompt({ bio, posts, youtubeContent, userNotes }: any): string {
  const MAX_POSTS_IN_PROMPT = 12;
  const MAX_POST_LEN = 1500;
  const sections: string[] = [];
  if (bio && bio.trim()) sections.push(`## Bio\n${bio.trim()}`);
  if (posts && posts.length) {
    sections.push("## Representative posts");
    posts.slice(0, MAX_POSTS_IN_PROMPT).forEach((p: string, i: number) => {
      sections.push(`### Post ${i + 1}\n${String(p).slice(0, MAX_POST_LEN).trim()}`);
    });
  }
  if (youtubeContent && youtubeContent.length) {
    sections.push("## Recent YouTube content (titles + descriptions)");
    youtubeContent.forEach((v: any) => { sections.push(`- ${v.title}${v.snippet ? `: ${v.snippet.slice(0, 200)}` : ""}`); });
  }
  if (userNotes && userNotes.trim()) sections.push(`## User notes on positioning\n${userNotes.trim()}`);
  sections.push("Produce the brand profile JSON per the system instructions. Output JSON only.");
  return sections.join("\n\n");
}

function parsePostsBlob(blob: string): string[] {
  if (!blob || typeof blob !== "string") return [];
  const trimmed = blob.trim();
  if (!trimmed) return [];
  let parts: string[];
  if (trimmed.includes("\n---\n") || trimmed.includes("\n---")) parts = trimmed.split(/\n-{3,}\n?/);
  else parts = trimmed.split(/\n\s*\n/);
  return parts.map((p) => p.trim()).filter((p) => p.length >= 20);
}

function normalizeProposal(raw: any): any {
  const identity = raw?.identity || {};
  const voice = raw?.voice || {};
  let pillars = Array.isArray(raw?.contentPillars) ? raw.contentPillars : [];
  pillars = pillars.filter((p: any) => p && p.id && p.name).slice(0, 6).map((p: any) => ({
    id: String(p.id).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    name: String(p.name).slice(0, 40),
    description: String(p.description || "").slice(0, 300),
    weight: Math.max(0, Math.round(Number(p.weight) || 0)),
    angles: Array.isArray(p.angles) ? p.angles.map((a: any) => String(a).slice(0, 150)).filter(Boolean).slice(0, 6) : [],
  }));
  const totalWeight = pillars.reduce((sum: number, p: any) => sum + p.weight, 0);
  if (totalWeight > 0 && totalWeight !== 100) {
    const scale = 100 / totalWeight;
    let running = 0;
    pillars.forEach((p: any, i: number) => {
      if (i === pillars.length - 1) p.weight = 100 - running;
      else { p.weight = Math.round(p.weight * scale); running += p.weight; }
    });
  } else if (pillars.length > 0 && totalWeight === 0) {
    const even = Math.floor(100 / pillars.length);
    pillars.forEach((p: any, i: number) => { p.weight = i === pillars.length - 1 ? 100 - even * (pillars.length - 1) : even; });
  }
  const samplePosts = Array.isArray(voice.samplePosts) ? voice.samplePosts.filter((s: any) => s && s.text).slice(0, 5).map((s: any) => ({
    platform: String(s.platform || "unknown").toLowerCase(), text: String(s.text).slice(0, 1000), engagement: null,
  })) : [];
  const cleanArray = (a: any, max = 10, len = 80) => Array.isArray(a) ? a.map((x: any) => String(x).slice(0, len)).filter(Boolean).slice(0, max) : [];
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

export async function runBootstrap({ admin, userId, apiKey, bio, postsBlob, youtubeChannelId, userNotes }: any): Promise<any> {
  const posts = parsePostsBlob(postsBlob);
  const youtubeContent = await fetchYouTubeForBootstrap(youtubeChannelId);
  if (posts.length === 0 && (!bio || !bio.trim()) && youtubeContent.length === 0) {
    throw new Error("No content provided. Need at least a bio, some posts, or a YouTube channel ID.");
  }
  const system = bootstrapSystemPrompt();
  const user = bootstrapUserPrompt({ bio, posts, youtubeContent, userNotes });
  const { text, tokensUsed } = await anthropicMessage(apiKey, { system, user, maxTokens: 4000 });

  let parsed: any;
  try { parsed = extractJson(text); }
  catch (e) { throw new Error(`Bootstrap JSON parse failed: ${(e as Error).message}. Raw: ${text.slice(0, 200)}`); }

  const proposal = normalizeProposal(parsed);

  // Write proposal (upsert one row per user, status pending)
  await admin.from("bootstrap_proposals").upsert({
    user_id: userId, status: "pending", proposal, error: null, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return { ok: true, tokensUsed, postsCount: posts.length };
}
