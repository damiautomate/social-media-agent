// Media generation for the edge function:
//   - Images: Claude prompts -> OpenAI GPT Image 2 -> Cloudinary
//   - Avatar video: HeyGen submit (webhook resolves later)
//   - B-roll: Claude scene prompts -> fal.ai submit (webhook resolves later)

import { anthropicMessage, extractJson, uploadToCloudinary } from "./shared.ts";

// ============================================================
// IMAGES (GPT Image 2)
// ============================================================
function deriveImageSlots(draft: any): { slot: string; contextText: string }[] {
  const fmt = (draft.format_type || "").toLowerCase();
  if (fmt === "carousel" && Array.isArray(draft.carousel_slides) && draft.carousel_slides.length > 0) {
    return draft.carousel_slides.map((slide: any, i: number) => ({
      slot: `slide_${i + 1}`,
      contextText: typeof slide === "string" ? slide : (slide.text || ""),
    }));
  }
  if (["reel", "shortvideo", "video", "nativevideo"].includes(fmt)) {
    return [{ slot: "cover", contextText: draft.hook_preview || draft.post_text || "" }];
  }
  if (fmt === "document") return [];
  return [{ slot: "cover", contextText: draft.post_text || "" }];
}

// GPT Image 2 sizes: 1024x1024 (square), 1024x1536 (portrait), 1536x1024 (landscape)
function sizeFor(draft: any): string {
  const platform = (draft.platform || "").toLowerCase();
  const fmt = (draft.format_type || "").toLowerCase();
  if (["reel", "shortvideo", "video", "nativevideo"].includes(fmt)) return "1024x1536";
  if (fmt === "carousel") return platform === "instagram" ? "1024x1536" : "1024x1024";
  // 2026: square is the strongest single-image format on LinkedIn/FB (landscape underperforms)
  return "1024x1024";
}

// ============================================================
// BRANDED DESIGN CARDS  (default image style)
// Vector SVG background (no fonts needed) uploaded to Cloudinary,
// then the dynamic text is overlaid via Cloudinary's l_text engine
// using a Google Font — crisp, legible, on-brand, no AI-photo look.
// ============================================================

// Cloudinary-supported Google fonts (safe choices)
const CARD_FONT = "Montserrat";

function resolveBrand(brandConfig: any) {
  const vs = brandConfig.visualStyle || brandConfig.visual_style || {};
  const id = brandConfig.identity || {};
  const palette = Array.isArray(vs.colorPalette) ? vs.colorPalette : [];
  const bg = vs.bgColor || palette[0] || "#0E1116";
  const accent = vs.accentColor || palette[1] || "#8B5CF6";
  const text = vs.textColor || "#F4F4F6";
  const muted = "#9AA0AA";
  const name = id.name || "";
  const handle = id.handle ? `@${String(id.handle).replace(/^@/, "")}` : "";
  const signature = [name, handle].filter(Boolean).join("  |  ");
  return { bg, accent, text, muted, name, handle, signature };
}

function cardDims(draft: any): { w: number; h: number } {
  const fmt = (draft.format_type || "").toLowerCase();
  const platform = (draft.platform || "").toLowerCase();
  if (fmt === "carousel" || platform === "instagram") return { w: 1080, h: 1350 };
  return { w: 1080, h: 1080 };
}

function hexToRgb(hex: string): string {
  const h = (hex || "").replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return v.slice(0, 6).toLowerCase();
}

function shade(hex: string, pct: number): string {
  const h = hexToRgb(hex);
  const num = parseInt(h, 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const f = pct / 100;
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c + (f < 0 ? c * f : (255 - c) * f))));
  r = adj(r); g = adj(g); b = adj(b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function encodeOverlayText(s: string): string {
  const cleaned = (s || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return encodeURIComponent(cleaned)
    .replace(/%2C/g, "%252C").replace(/%2F/g, "%252F").replace(/%5C/g, "%255C");
}

// Big, frame-filling headline sizes (the old sizes were far too small → empty cards)
function headlineSize(len: number, w: number): number {
  if (len <= 28) return Math.round(w * 0.115);
  if (len <= 45) return Math.round(w * 0.095);
  if (len <= 70) return Math.round(w * 0.078);
  if (len <= 100) return Math.round(w * 0.064);
  if (len <= 140) return Math.round(w * 0.054);
  return Math.round(w * 0.046);
}

// ---- AI designs the card: picks a layout + writes punchy display copy ----
async function buildCardSpec(apiKey: string, draft: any): Promise<any> {
  const system = [
    "You are an expert social-media graphic designer creating ONE branded image card for a post.",
    "Pick the layout that best fits the post, then write SHORT display copy (this is a big graphic, not a paragraph).",
    "",
    "Layouts:",
    '- "stat": use when the post hinges on a striking number/percentage/metric.',
    '- "quote": use when one punchy opinion or insight reads great as a bold standalone line.',
    '- "statement": default — a strong declarative hook.',
    "",
    "Rules:",
    "- headline: MAX 90 characters. Punchy, high-contrast, rewritten for impact — NOT the raw post text. No hashtags, no emojis.",
    "- eyebrow: 1-3 word topic tag (e.g. 'CRM Strategy'). Optional but preferred.",
    "- For stat: provide stat.value (e.g. '79%', '3x', '$2M') and stat.caption (<= 55 chars). headline becomes a short supporting line.",
    "- subtext: optional supporting line <= 70 chars.",
    "- Keep it tight. Big and bold beats long.",
    "",
    "Respond with ONLY this JSON (no prose, no fences):",
    '{ "layout": "statement|quote|stat", "eyebrow": "", "headline": "", "subtext": "", "stat": { "value": "", "caption": "" } }',
  ].join("\n");
  const user = `Platform: ${draft.platform}\nPost:\n${(draft.post_text || "").slice(0, 1400)}\n\nDesign the card. JSON only.`;
  try {
    const { text } = await anthropicMessage(apiKey, { system, user, maxTokens: 600 });
    const spec = extractJson(text);
    return {
      layout: ["statement", "quote", "stat"].includes(spec.layout) ? spec.layout : "statement",
      eyebrow: (spec.eyebrow || "").toString().slice(0, 40),
      headline: (spec.headline || "").toString().slice(0, 120),
      subtext: (spec.subtext || "").toString().slice(0, 90),
      stat: spec.stat && spec.stat.value ? { value: String(spec.stat.value).slice(0, 12), caption: String(spec.stat.caption || "").slice(0, 70) } : null,
    };
  } catch {
    // Fallback to the hook if the model call/parse fails
    const hook = (draft.hook_preview || (draft.post_text || "").split("\n").filter(Boolean)[0] || "").slice(0, 110);
    return { layout: "statement", eyebrow: (draft.pillar || "").toString().slice(0, 40), headline: hook, subtext: "", stat: null };
  }
}

// Layout-aware vector background (no text → no font dependency for the bg)
function buildCardBackgroundSvg(brand: any, layout: string, w: number, h: number): string {
  const pad = Math.round(w * 0.085);
  const accent = brand.accent;
  let flourish = "";
  if (layout === "quote") {
    // big quotation mark glyph drawn as shapes, top-left, low opacity
    const qx = pad, qy = Math.round(h * 0.16), s = Math.round(w * 0.12);
    const mark = (ox: number) =>
      `<path d="M ${ox} ${qy + s} C ${ox} ${qy + s * 0.35}, ${ox + s * 0.35} ${qy}, ${ox + s * 0.55} ${qy} L ${ox + s * 0.55} ${qy + s * 0.32} C ${ox + s * 0.42} ${qy + s * 0.32}, ${ox + s * 0.3} ${qy + s * 0.5}, ${ox + s * 0.3} ${qy + s} Z" fill="${accent}" fill-opacity="0.9"/>`;
    flourish = `${mark(qx)}${mark(qx + s * 0.7)}`;
  } else if (layout === "stat") {
    // accent arc ring reminiscent of a progress dial, upper area
    const cx = Math.round(w * 0.30), cy = Math.round(h * 0.34), r = Math.round(w * 0.16);
    flourish = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${shade(brand.bg, 18)}" stroke-width="14"/>
      <path d="M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - r * 0.6} ${cy + r * 0.8}" fill="none" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`;
  } else {
    flourish = `<rect x="${pad}" y="${Math.round(h * 0.24)}" width="72" height="9" rx="4" fill="${accent}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${shade(brand.bg, 6)}"/>
      <stop offset="1" stop-color="${shade(brand.bg, -14)}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.88" cy="0.08" r="0.85">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${flourish}
  <rect x="${pad}" y="${h - Math.round(pad * 0.62)}" width="${w - pad * 2}" height="3" rx="1.5" fill="${accent}" fill-opacity="0.4"/>
</svg>`;
}

// Build the Cloudinary delivery URL with text overlays for the chosen layout.
function buildCardUrl(cloudName: string, basePublicId: string, brand: any, spec: any, w: number, h: number): string {
  const pad = Math.round(w * 0.085);
  const wrapW = w - pad * 2;
  const textRgb = hexToRgb(brand.text);
  const accentRgb = hexToRgb(brand.accent);
  const mutedRgb = hexToRgb(brand.muted);
  const layers = [`c_fill,w_${w},h_${h}`];

  const L = (font: number, weight: string, text: string, color: string, opts: string) =>
    `l_text:${CARD_FONT}_${font}_${weight}:${encodeOverlayText(text)},co_rgb:${color}${opts}`;

  // Eyebrow (top)
  if (spec.eyebrow) {
    layers.push(L(Math.round(w * 0.03), "bold", spec.eyebrow.toUpperCase(), accentRgb, `,g_north_west,x_${pad},y_${Math.round(h * 0.13)},w_${wrapW},c_fit`));
  }

  if (spec.layout === "stat" && spec.stat) {
    // HUGE stat value, then caption, then supporting headline — vertically arranged
    layers.push(L(Math.round(w * 0.22), "bold", spec.stat.value, accentRgb, `,g_north_west,x_${pad},y_${Math.round(h * 0.26)}`));
    if (spec.stat.caption) layers.push(L(Math.round(w * 0.045), "bold", spec.stat.caption, textRgb, `,g_north_west,x_${pad},y_${Math.round(h * 0.50)},w_${wrapW},c_fit`));
    if (spec.headline) layers.push(L(Math.round(w * 0.038), "normal", spec.headline, mutedRgb, `,g_north_west,x_${pad},y_${Math.round(h * 0.64)},w_${wrapW},c_fit`));
  } else {
    // statement / quote — big centered headline (quote uses accent color)
    const hl = spec.headline || "";
    const fs = headlineSize(hl.length, w);
    const color = spec.layout === "quote" ? accentRgb : textRgb;
    layers.push(L(fs, "bold", hl, color, `,g_center,y_-${Math.round(h * 0.03)},w_${wrapW},c_fit`));
    if (spec.subtext) {
      layers.push(L(Math.round(w * 0.036), "normal", spec.subtext, mutedRgb, `,g_center,y_${Math.round(h * 0.20)},w_${wrapW},c_fit`));
    }
  }

  // Signature (bottom)
  if (brand.signature) {
    layers.push(L(Math.round(w * 0.027), "bold", brand.signature, mutedRgb, `,g_south_west,x_${pad},y_${Math.round(pad * 0.7)}`));
  }

  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/${layers.join("/")}/${basePublicId}.png`;
}

async function renderBrandedCards({ admin, draft, brandConfig, keys }: any) {
  const brand = resolveBrand(brandConfig);
  const { w, h } = cardDims(draft);
  const folder = `${keys.cloudinaryFolder || "social-agent"}/drafts/${draft.id}`;

  // 1) AI designs the card (layout + display copy)
  const spec = await buildCardSpec(keys.anthropic, draft);

  // 2) upload the layout-aware vector background
  const svg = buildCardBackgroundSvg(brand, spec.layout, w, h);
  const dataUri = `data:image/svg+xml;base64,${base64Encode(svg)}`;
  const uploaded = await uploadToCloudinary({
    cloudName: keys.cloudinaryCloud, apiKey: keys.cloudinaryKey, apiSecret: keys.cloudinarySecret,
    file: dataUri, folder, publicId: "card-bg", resourceType: "image",
  });

  // 3) build the delivery URL with text overlays
  const url = buildCardUrl(keys.cloudinaryCloud, uploaded.publicId, brand, spec, w, h);

  return [{
    slot: "cover", url, cloudinaryPublicId: uploaded.publicId,
    width: w, height: h, model: "branded-card", size: `${w}x${h}`,
    style: "branded", layout: spec.layout, headline: spec.headline, generatedAt: Date.now(),
  }];
}

function base64Encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function imagePrompterSystem(brandConfig: any): string {
  const identity = brandConfig.identity || {};
  const visualStyle = brandConfig.visualStyle || brandConfig.visual_style || {};
  const aestheticLines: string[] = [];
  if (visualStyle.description) aestheticLines.push(`Overall aesthetic: ${visualStyle.description}`);
  if (visualStyle.aesthetic) aestheticLines.push(`Style category: ${visualStyle.aesthetic}`);
  if (Array.isArray(visualStyle.colorPalette) && visualStyle.colorPalette.length) aestheticLines.push(`Color palette: ${visualStyle.colorPalette.join(", ")}`);
  if (Array.isArray(visualStyle.avoidElements) && visualStyle.avoidElements.length) aestheticLines.push(`Avoid: ${visualStyle.avoidElements.join("; ")}`);
  const aestheticBlock = aestheticLines.length ? aestheticLines.join("\n") : "No specific visual style configured — default to clean, modern, content-focused imagery.";
  return [
    `You are an award-winning editorial photo director choosing the cover image for ${identity.name || "this creator"}'s social posts.`,
    "", "## Visual brand", aestheticBlock,
    "", "## Approach: CONCEPTUAL & EDITORIAL — not literal, not stocky",
    "Do NOT illustrate the post literally (no 'person at a laptop', no 'team in a meeting', no generic office). Instead, find ONE strong CONCEPTUAL image — a metaphor or visual idea — that captures the post's core THESIS, the way a great magazine or a brand like Stripe/Apple would.",
    "Think: a single striking subject or object, bold composition, intentional negative space, editorial lighting. The image should make someone stop and think, and it should still make sense paired with the post's idea.",
    "Aim for authentic, photographic realism (shot on a real camera, natural/studio light, real textures) OR a clean conceptual still-life / minimal scene. Either way it must look intentional and art-directed, never like a stock photo.",
    "Explicitly AVOID: literal depictions of the post's words, generic office/laptop/handshake stock scenes, 3D render, CGI, glossy hyper-saturation, neon glow, glowing holographic dashboards, floating data, plastic skin, lens flare, 'futuristic tech' clichés, and any text/letters/numbers.",
    "", "## Your job", "For each slot listed in the user message, write ONE image prompt for a high-quality text-to-image model.",
    "", "Rules for each prompt:",
    "1. 35-80 words. Start by naming the CONCEPT/metaphor, then describe the single hero subject, composition, lighting, and mood.",
    "2. NEVER include text/typography in the image.",
    "3. Reserve clean negative space (top or one side) so it composes well in-feed.",
    "4. Apply the brand palette subtly as color grading. Keep a consistent art-directed look across slots.",
    "5. If a person appears, anonymous and incidental (no faces front-and-center, no specific identity/celebrity).",
    "6. End every prompt with: 'Editorial photography, art-directed, authentic texture. No CGI, no 3D render, no glossy gradients, no glowing screens, no text.'",
    "", "## Output format", "Respond with ONLY a single JSON object, no prose, no fences:",
    `{ "prompts": [ { "slot": "<the slot name from input>", "prompt": "<the image prompt>" } ] }`,
    "Order MUST match the input slot order. Return exactly one prompt per input slot.",
  ].join("\n");
}

function imagePrompterUser(draft: any, slots: any[]): string {
  const slotLines = slots.map((s, i) => `[${i + 1}] slot="${s.slot}" — contextText: ${s.contextText.slice(0, 500)}`).join("\n\n");
  return [
    `Platform: ${draft.platform || "(none)"}`, `Format: ${draft.format_type || "(none)"}`,
    `Pillar: ${draft.pillar || "(none)"}`, `Hook: ${draft.hook_preview || "(none)"}`,
    "", "Post body (for tone reference, do NOT render as text in the image):", (draft.post_text || "").slice(0, 800),
    "", "## Slots needing image prompts", slotLines,
    "", "Write one prompt per slot per the system instructions. JSON only.",
  ].join("\n");
}

// OpenAI GPT Image 2 — always returns b64_json
async function generateImageOpenAI({ apiKey, prompt, size, quality = "medium" }: any): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-2", prompt, size, quality, n: 1 }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI images HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");
  return `data:image/png;base64,${b64}`;
}

async function mapWithConcurrency(items: any[], limit: number, fn: (item: any, i: number) => Promise<any>): Promise<any[]> {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = { ok: true, value: await fn(items[i], i) }; }
      catch (err) { results[i] = { ok: false, error: String((err as Error)?.message || err) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runImageGeneration({ admin, userId, draftId, brandConfig, keys }: any): Promise<any> {
  const { data: draft } = await admin.from("drafts").select("*").eq("id", draftId).single();
  if (!draft || draft.user_id !== userId) throw new Error("Draft not found");

  await admin.from("drafts").update({ images: { status: "generating", error: null }, updated_at: new Date().toISOString() }).eq("id", draftId);

  try {
    const vs = brandConfig.visualStyle || brandConfig.visual_style || {};
    const imageStyle = (vs.imageStyle || "branded").toLowerCase(); // "branded" (default) | "photo"

    // ---- DEFAULT: designer-grade branded card (text-on-brand, no AI-photo look) ----
    if (imageStyle !== "photo") {
      const items = await renderBrandedCards({ admin, draft, brandConfig, keys });
      const dims = cardDims(draft);
      await admin.from("drafts").update({
        images: { status: "ready", items, aspect: `${dims.w}x${dims.h}`, style: "branded", error: null },
        updated_at: new Date().toISOString(),
      }).eq("id", draftId);
      return { imagesCreated: items.length, style: "branded" };
    }

    // ---- ALTERNATE: photographic image via OpenAI (authentic-realism prompts) ----
    const slots = deriveImageSlots(draft);
    if (slots.length === 0) {
      await admin.from("drafts").update({ images: { status: "none", error: "No image slots for this draft format" }, updated_at: new Date().toISOString() }).eq("id", draftId);
      return { imagesCreated: 0, note: "No slots" };
    }
    const size = sizeFor(draft);
    const { text } = await anthropicMessage(keys.anthropic, { system: imagePrompterSystem(brandConfig), user: imagePrompterUser(draft, slots), maxTokens: 2000 });
    let parsed: any;
    try { parsed = extractJson(text); } catch (e) { throw new Error(`Prompter JSON parse failed: ${(e as Error).message}`); }
    const rawPrompts = Array.isArray(parsed?.prompts) ? parsed.prompts : [];
    const aligned = slots.map((s, i) => {
      const found = rawPrompts[i] || rawPrompts.find((p: any) => p.slot === s.slot);
      return { slot: s.slot, prompt: found?.prompt ? String(found.prompt).slice(0, 1200) : `Modern, clean illustration matching the brand aesthetic for: ${s.contextText.slice(0, 200)}` };
    });

    const folder = `${keys.cloudinaryFolder || "social-agent"}/drafts/${draftId}`;
    const slotResults = await mapWithConcurrency(aligned, 3, async (p: any) => {
      const dataUri = await generateImageOpenAI({ apiKey: keys.openai, prompt: p.prompt, size, quality: brandConfig.visualStyle?.imageQuality || brandConfig.visual_style?.imageQuality || "medium" });
      const uploaded = await uploadToCloudinary({
        cloudName: keys.cloudinaryCloud, apiKey: keys.cloudinaryKey, apiSecret: keys.cloudinarySecret,
        file: dataUri, folder, publicId: p.slot, resourceType: "image",
      });
      return { slot: p.slot, prompt: p.prompt, url: uploaded.secureUrl, cloudinaryPublicId: uploaded.publicId, width: uploaded.width, height: uploaded.height, model: "gpt-image-2", size, generatedAt: Date.now() };
    });

    const succeeded = slotResults.filter((r) => r.ok).map((r) => r.value);
    const failed = slotResults.map((r, i) => r.ok ? null : { slot: aligned[i].slot, error: r.error }).filter(Boolean) as any[];
    let status: string;
    if (succeeded.length === 0) status = "failed";
    else if (failed.length > 0) status = "partial";
    else status = "ready";

    await admin.from("drafts").update({
      images: { status, items: succeeded, aspect: size, error: failed.length ? `${failed.length} slot(s) failed: ${failed.map((f) => f.slot).join(", ")}` : null },
      updated_at: new Date().toISOString(),
    }).eq("id", draftId);

    return { imagesCreated: succeeded.length, imagesFailed: failed.length };
  } catch (err) {
    await admin.from("drafts").update({ images: { status: "failed", error: String((err as Error)?.message || err).slice(0, 500) }, updated_at: new Date().toISOString() }).eq("id", draftId);
    throw err;
  }
}

// ============================================================
// AVATAR VIDEO (HeyGen submit; webhook resolves)
// ============================================================
async function scriptifyForAvatar(apiKey: string, draft: any): Promise<{ script: string; hook: string; wordCount: number }> {
  const system = [
    "You convert a social media post into a SPOKEN script for an AI avatar video (talking head).",
    "Rules:",
    "1. Natural spoken language — contractions, short sentences, conversational rhythm.",
    "2. Strong hook in the first sentence (the first 3 seconds matter most).",
    "3. 60-130 words total (~30-60s spoken). No stage directions, no emojis, no hashtags.",
    "4. End with a clear spoken CTA.",
    "Output ONLY a JSON object: { \"script\": \"...\", \"hook\": \"first sentence\" }",
  ].join("\n");
  const user = `Platform: ${draft.platform}\nPost:\n${(draft.post_text || "").slice(0, 1500)}\n\nWrite the spoken script. JSON only.`;
  const { text } = await anthropicMessage(apiKey, { system, user, maxTokens: 1000 });
  const parsed = extractJson(text);
  const script = String(parsed.script || "").trim();
  return { script, hook: String(parsed.hook || script.split(".")[0] || "").trim(), wordCount: script.split(/\s+/).filter(Boolean).length };
}

export async function runAvatarVideo({ admin, userId, draftId, brandConfig, keys, webhookUrl }: any): Promise<any> {
  const { data: draft } = await admin.from("drafts").select("*").eq("id", draftId).single();
  if (!draft || draft.user_id !== userId) throw new Error("Draft not found");

  const avatar = brandConfig.videoStyle?.avatar || brandConfig.video_style?.avatar;
  if (!avatar?.avatarId || !avatar?.voiceId) throw new Error("No avatar/voice selected");

  await admin.from("drafts").update({ avatar_video: { status: "generating", error: null }, updated_at: new Date().toISOString() }).eq("id", draftId);

  try {
    const { script, hook, wordCount } = await scriptifyForAvatar(keys.anthropic, draft);
    if (!script) throw new Error("Failed to produce avatar script");

    const charSettings = avatar.avatarType === "talking_photo"
      ? { type: "talking_photo", talking_photo_id: avatar.avatarId }
      : { type: "avatar", avatar_id: avatar.avatarId, avatar_style: "normal" };

    const bg = brandConfig.videoStyle?.backgroundColor || brandConfig.video_style?.backgroundColor || "#0F1B2D";

    const body = {
      video_inputs: [{
        character: charSettings,
        voice: { type: "text", input_text: script, voice_id: avatar.voiceId },
        background: { type: "color", value: bg },
      }],
      dimension: { width: 720, height: 1280 },
      callback_url: webhookUrl || undefined,
    };

    const res = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: { "X-Api-Key": keys.heygen, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HeyGen generate HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const videoId = data?.data?.video_id;
    if (!videoId) throw new Error("HeyGen returned no video_id");

    // Track external job for webhook resolution
    await admin.from("video_jobs").insert({
      user_id: userId, draft_id: draftId, kind: "avatar", provider: "heygen",
      external_id: videoId, prompt: hook, status: "submitted",
    });
    // Stash script metadata onto the draft block (status stays generating)
    await admin.from("drafts").update({
      avatar_video: { status: "generating", externalId: videoId, script, hook, wordCount, error: null },
      updated_at: new Date().toISOString(),
    }).eq("id", draftId);

    return { submitted: true, externalId: videoId, wordCount };
  } catch (err) {
    await admin.from("drafts").update({ avatar_video: { status: "failed", error: String((err as Error)?.message || err).slice(0, 500) }, updated_at: new Date().toISOString() }).eq("id", draftId);
    throw err;
  }
}

// ============================================================
// B-ROLL (fal.ai submit; webhook resolves)
// ============================================================
const FALAI_MODELS: Record<string, string> = {
  "kling-2.6-pro": "fal-ai/kling-video/v2.6/pro/text-to-video",
  "kling-2.5-turbo-pro": "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
  "kling-2.1-standard": "fal-ai/kling-video/v2.1/standard/text-to-video",
  "veo3-fast": "fal-ai/veo3/fast",
  "veo3-standard": "fal-ai/veo3",
};

async function scenePrompts(apiKey: string, draft: any, count: number): Promise<{ slot: string; prompt: string; intent: string }[]> {
  const system = [
    "You write cinematic B-roll video generation prompts for short-form social content.",
    `Produce exactly ${count} scene prompt(s) that visually support the post.`,
    "Each prompt: 25-60 words, describes a single continuous shot (camera move, subject, setting, lighting, mood). No text/typography in frame. No specific real people.",
    "Output ONLY JSON: { \"scenes\": [ { \"slot\": \"scene_1\", \"prompt\": \"...\", \"intent\": \"what this shot conveys\" } ] }",
  ].join("\n");
  const user = `Platform: ${draft.platform}\nFormat: ${draft.format_type}\nPost:\n${(draft.post_text || "").slice(0, 1200)}\n\nWrite ${count} scene prompt(s). JSON only.`;
  const { text } = await anthropicMessage(apiKey, { system, user, maxTokens: 2000 });
  const parsed = extractJson(text);
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  return Array.from({ length: count }, (_, i) => {
    const s = scenes[i] || {};
    return { slot: s.slot || `scene_${i + 1}`, prompt: s.prompt ? String(s.prompt).slice(0, 1000) : `Cinematic establishing shot supporting: ${(draft.post_text || "").slice(0, 120)}`, intent: s.intent || "" };
  });
}

export async function runBroll({ admin, userId, draftId, brandConfig, keys, mode, clipCount, webhookUrl }: any): Promise<any> {
  const { data: draft } = await admin.from("drafts").select("*").eq("id", draftId).single();
  if (!draft || draft.user_id !== userId) throw new Error("Draft not found");

  const brollCfg = brandConfig.videoStyle?.broll || brandConfig.video_style?.broll || {};
  const modelId = brollCfg.modelId || "kling-2.6-pro";
  const endpoint = FALAI_MODELS[modelId] || FALAI_MODELS["kling-2.6-pro"];
  const duration = String(brollCfg.duration || "5");
  const count = mode === "storyboard" ? Math.min(Math.max(Number(clipCount) || brollCfg.storyboardClipCount || 3, 2), 5) : 1;

  await admin.from("drafts").update({ broll: { status: "generating", mode, modelId, error: null, clips: [] }, updated_at: new Date().toISOString() }).eq("id", draftId);

  try {
    const scenes = await scenePrompts(keys.anthropic, draft, count);

    // Submit each scene to fal.ai queue; track each as a video_job
    for (const scene of scenes) {
      const res = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Key ${keys.falai}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scene.prompt,
          duration,
          aspect_ratio: "9:16",
          ...(webhookUrl ? {} : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`fal.ai submit HTTP ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = await res.json();
      const requestId = data?.request_id || data?.requestId;
      if (!requestId) throw new Error("fal.ai returned no request_id");
      await admin.from("video_jobs").insert({
        user_id: userId, draft_id: draftId, kind: "broll", provider: "falai",
        external_id: requestId, slot: scene.slot, prompt: scene.prompt, status: "submitted",
      });
    }

    return { submitted: true, scenes: scenes.length, modelId };
  } catch (err) {
    await admin.from("drafts").update({ broll: { status: "failed", mode, modelId, error: String((err as Error)?.message || err).slice(0, 500), clips: [] }, updated_at: new Date().toISOString() }).eq("id", draftId);
    throw err;
  }
}
