// Shared helpers for the process-pending-job edge function.
// Deno runtime. Raw fetch for all external APIs (no SDKs).

export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// ---------- JSON extraction (handles ```json fences) ----------
export function extractJson(text: string): any {
  const trimmed = (text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : trimmed;
  return JSON.parse(candidate);
}

// ---------- Anthropic Messages API (raw fetch) ----------
export async function anthropicMessage(
  apiKey: string,
  { system, user, maxTokens = 2000 }: { system: string; user: string; maxTokens?: number },
): Promise<{ text: string; tokensUsed: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("No text content in Claude response");
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  return { text: textBlock.text, tokensUsed };
}

// ---------- Cloudinary signed upload (sha1) ----------
async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadToCloudinary({
  cloudName, apiKey, apiSecret, file, folder, publicId, resourceType = "image",
}: {
  cloudName: string; apiKey: string; apiSecret: string;
  file: string; folder: string; publicId: string; resourceType?: "image" | "video";
}): Promise<{ secureUrl: string; publicId: string; width?: number; height?: number; duration?: number; format?: string }> {
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary credentials missing");
  if (!file) throw new Error("file required");

  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams: Record<string, string | number> = {
    folder, public_id: publicId, timestamp, overwrite: "true",
  };
  const toSign = Object.keys(signedParams).sort().map((k) => `${k}=${signedParams[k]}`).join("&");
  const signature = await sha1Hex(toSign + apiSecret);

  const form = new URLSearchParams();
  form.set("file", file); // remote URL or data URI; Cloudinary fetches/decodes
  form.set("api_key", apiKey);
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  form.set("folder", folder);
  form.set("public_id", publicId);
  form.set("overwrite", "true");

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload HTTP ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  if (!data.secure_url) throw new Error("Cloudinary returned no secure_url");
  return {
    secureUrl: data.secure_url, publicId: data.public_id,
    width: data.width, height: data.height, duration: data.duration, format: data.format,
  };
}

// ============================================================
// PROMPT BUILDER — 2026 algorithm rules. PORTED VERBATIM.
// ============================================================
export const PLATFORM_RULES_2026: Record<string, string> = {
  linkedin: `LinkedIn 2026 algorithm rules:
- Saves are 5x more powerful than likes; comments are 5-10x more powerful.
- Critical engagement window is the first 1-3 hours after posting.
- Hook MUST land in the first 150 characters (before the "See more" cutoff).
- Use short paragraphs with whitespace.
- End with a question or a clear CTA.
- NO external links in the post body — put them in the first comment.
- 1-3 contextual keywords, not hashtag stuffing.
- Concentrate 80% of content within 3 core topics for topical authority.`,

  instagram: `Instagram 2026 algorithm rules:
- Saves, shares, and DM sends are the strongest signals; likes are weakest.
- Watch time and sustained viewing beat rapid swiping.
- Max 3-5 hashtags. Caption keywords > hashtags for discovery.
- Reels: hook in the first 1-2 seconds.
- Carousels have the highest save rate.
- Original audio preferred. Always provide alt text for images.`,

  tiktok: `TikTok 2026 algorithm rules:
- Hook in the first 2 seconds.
- Structure: HOOK → TENSION → VALUE → CTA.
- 15-60 seconds is ideal.
- Toggle the AIGC label for any AI-generated content.
- Original audio preferred. No watermarks from other apps.
- Include captions on the video.`,

  facebook: `Facebook 2026 algorithm rules:
- Native posts beat link posts.
- Video and carousels are boosted.
- Community/discussion-style posts perform best.
- Don't cross-post — adapt for a casual, conversational tone.`,
};

export function pickPillar(brandConfig: any, requestedPillarId?: string): any {
  const pillars = brandConfig.contentPillars || [];
  if (requestedPillarId) {
    const found = pillars.find((p: any) => p.id === requestedPillarId);
    if (found) return found;
  }
  if (!pillars.length) return null;
  const totalWeight = pillars.reduce((s: number, p: any) => s + (p.weight || 0), 0) || 1;
  let pick = Math.random() * totalWeight;
  for (const p of pillars) {
    pick -= p.weight || 0;
    if (pick <= 0) return p;
  }
  return pillars[0];
}

export function buildSystemPrompt(brandConfig: any, platform: string, pillar: any): string {
  const identity = brandConfig.identity || {};
  const voice = brandConfig.voice || {};
  const platformCfg = brandConfig.platforms?.[platform] || {};
  const tone = (voice.tone || []).join(", ");
  const signature = (voice.signaturePhrases || []).join(" | ") || "(none provided)";
  const avoid = (voice.avoidPhrases || []).join(", ") || "(none provided)";

  const samples = (voice.samplePosts || [])
    .filter((s: any) => s.platform === platform || !s.platform)
    .slice(0, 3)
    .map((s: any, i: number) => `Sample ${i + 1} (${s.platform || "any"}):\n${s.text || ""}`)
    .join("\n\n") || "(no samples provided yet)";

  const platformBlock = PLATFORM_RULES_2026[platform] || "";
  const platformConfig = JSON.stringify(platformCfg, null, 2);

  const pillarBlock = pillar
    ? `Active pillar: ${pillar.name}\nDescription: ${pillar.description}\nAngles: ${(pillar.angles || []).join(" | ")}`
    : "Active pillar: (none specified — use best judgment)";

  return [
    `You are drafting social posts for ${identity.name || "this user"}` +
      (identity.handle ? ` (@${identity.handle})` : "") + ".",
    identity.tagline ? `Tagline: ${identity.tagline}` : "",
    "",
    `Voice tone descriptors: ${tone || "(unspecified)"}`,
    `Signature phrases the user reaches for: ${signature}`,
    `Phrases to NEVER use: ${avoid}`,
    "",
    "Sample posts that represent the user's voice:",
    samples,
    "",
    pillarBlock,
    "",
    `Target platform: ${platform}`,
    `Platform-specific user config:\n${platformConfig}`,
    "",
    platformBlock,
    "",
    "Output a SINGLE JSON object — no prose around it — with these fields:",
    `{
  "formatType": "textPost | carousel | reel | shortVideo | nativeVideo | document | single",
  "postText": "the main caption / body",
  "hashtags": ["string"],
  "hookPreview": "first 150 chars optimized for hook",
  "firstComment": "string or null (LinkedIn external links go here)",
  "contentNotes": "production notes for the human posting it",
  "carouselSlides": ["slide 1 text", "slide 2 text"],
  "videoScript": "string or null",
  "altText": "string or null",
  "engagementHooks": ["question or CTA strings"],
  "estimatedReadTime": 0
}`,
    "Respond with ONLY the JSON object. No markdown fences, no preamble.",
  ].filter(Boolean).join("\n");
}

export function buildUserPrompt({ topic, angle, context }: { topic: string; angle?: string; context?: string }): string {
  const lines = [`Topic: ${topic}`];
  if (angle) lines.push(`Angle: ${angle}`);
  if (context) lines.push(`Additional context: ${context}`);
  lines.push("Draft the post now.");
  return lines.join("\n");
}
