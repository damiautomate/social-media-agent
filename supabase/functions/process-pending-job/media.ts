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
  if (platform === "linkedin" || platform === "facebook") return "1536x1024";
  return "1024x1024";
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
    `You are writing image generation prompts for ${identity.name || "this creator"}'s social media posts.`,
    "", "## Visual brand", aestheticBlock,
    "", "## Your job", "For each slot listed in the user message, write ONE detailed image prompt suitable for a high-quality text-to-image model.",
    "", "Rules for each prompt:",
    "1. 30-80 words. Specific, visual, scene-driven — not abstract.",
    "2. NEVER include text/typography in the image. No words, captions, titles, watermarks, signage, or readable text of any kind.",
    "3. Anchor the visual to the slot's contextText, but translate it into a SCENE, not a literal illustration of the words.",
    "4. Bake the visual brand into every prompt (palette hints, mood, composition style) so all images feel like one coherent set.",
    "5. For carousels, vary scenes across slides while keeping the visual brand consistent — same world, different shots.",
    "6. Explicitly avoid the avoid-list items.",
    "7. No people's faces unless the contextText demands it. If a person appears, describe them as anonymous (no celebrity / specific identity).",
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
