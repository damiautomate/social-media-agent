// Builds the system + user prompt for a draft generation call.
// Combines per-user brand config with 2026 platform algorithm rules.

const PLATFORM_RULES_2026 = {
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

function pickPillar(brandConfig, requestedPillarId) {
  const pillars = brandConfig.contentPillars || [];
  if (requestedPillarId) {
    const found = pillars.find((p) => p.id === requestedPillarId);
    if (found) return found;
  }
  if (!pillars.length) return null;
  const totalWeight = pillars.reduce((s, p) => s + (p.weight || 0), 0) || 1;
  let pick = Math.random() * totalWeight;
  for (const p of pillars) {
    pick -= p.weight || 0;
    if (pick <= 0) return p;
  }
  return pillars[0];
}

function buildSystemPrompt(brandConfig, platform, pillar) {
  const identity = brandConfig.identity || {};
  const voice = brandConfig.voice || {};
  const platformCfg = brandConfig.platforms?.[platform] || {};
  const tone = (voice.tone || []).join(", ");
  const signature = (voice.signaturePhrases || []).join(" | ") || "(none provided)";
  const avoid = (voice.avoidPhrases || []).join(", ") || "(none provided)";

  const samples = (voice.samplePosts || [])
    .filter((s) => s.platform === platform || !s.platform)
    .slice(0, 3)
    .map((s, i) => `Sample ${i + 1} (${s.platform || "any"}):\n${s.text || ""}`)
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
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt({ topic, angle, context }) {
  const lines = [`Topic: ${topic}`];
  if (angle) lines.push(`Angle: ${angle}`);
  if (context) lines.push(`Additional context: ${context}`);
  lines.push("Draft the post now.");
  return lines.join("\n");
}

module.exports = {
  pickPillar,
  buildSystemPrompt,
  buildUserPrompt,
};
