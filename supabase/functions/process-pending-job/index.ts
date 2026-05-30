// Supabase Edge Function: process-pending-job
// Triggered by a Database Webhook on INSERT to public.pending_jobs.
// Receives { type: "INSERT", table, record } — `record` is the new job row.
//
// Uses the service_role client (auto-provided env) which bypasses RLS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  pickPillar, buildSystemPrompt, buildUserPrompt, anthropicMessage, extractJson,
} from "./shared.ts";
import { runResearch } from "./research.ts";
import { runBootstrap } from "./bootstrap.ts";
import { runImageGeneration, runAvatarVideo, runBroll } from "./media.ts";
import { runPublish } from "./publish.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Optional: set this to the video-webhook function URL so providers can call back.
const VIDEO_WEBHOOK_URL = Deno.env.get("VIDEO_WEBHOOK_URL") || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function camelBrand(row: any) {
  if (!row) return null;
  return {
    identity: row.identity || {},
    voice: row.voice || {},
    contentPillars: row.content_pillars || [],
    platforms: row.platforms || {},
    visualStyle: row.visual_style || {},
    videoStyle: row.video_style || {},
    publishing: row.publishing || {},
    research: row.research || {},
  };
}

async function loadContext(userId: string) {
  const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
  const { data: brandRow } = await admin.from("brand_configs").select("*").eq("user_id", userId).single();
  return { profile, brandConfig: camelBrand(brandRow) };
}

async function handleDraft(job: any) {
  const { profile, brandConfig } = await loadContext(job.user_id);
  if (!profile?.anthropic_api_key) throw new Error("API key not configured");
  if (!brandConfig) throw new Error("Brand config not found");

  const pillar = pickPillar(brandConfig, job.pillar);
  const system = buildSystemPrompt(brandConfig, job.platform, pillar);
  const user = buildUserPrompt({ topic: job.topic, angle: job.angle, context: job.context });
  const { text, tokensUsed } = await anthropicMessage(profile.anthropic_api_key, { system, user, maxTokens: 2000 });

  let draft: any;
  try { draft = extractJson(text); }
  catch (e) { throw new Error(`Draft JSON parse failed: ${(e as Error).message}`); }

  const { data: inserted } = await admin.from("drafts").insert({
    user_id: job.user_id,
    idea_id: job.idea_id || null,
    job_id: job.id,
    platform: job.platform,
    format_type: draft.formatType || "textPost",
    pillar: pillar?.id || job.pillar || "",
    post_text: draft.postText || "",
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    hook_preview: draft.hookPreview || "",
    first_comment: draft.firstComment || null,
    content_notes: draft.contentNotes || "",
    carousel_slides: Array.isArray(draft.carouselSlides) ? draft.carouselSlides : [],
    video_script: draft.videoScript || null,
    alt_text: draft.altText || null,
    engagement_hooks: Array.isArray(draft.engagementHooks) ? draft.engagementHooks : [],
    estimated_read_time: Number(draft.estimatedReadTime) || 0,
    status: "pending",
    tokens_used: tokensUsed,
  }).select("id").single();

  await admin.from("pending_jobs").update({ status: "completed", result_draft_id: inserted.id, completed_at: new Date().toISOString() }).eq("id", job.id);
  if (job.idea_id) {
    await admin.from("ideas").update({ status: "used", used_at: new Date().toISOString() }).eq("id", job.idea_id);
  }
  return { draftId: inserted.id };
}

function keysFromProfile(profile: any) {
  const c = profile.cloudinary || {};
  return {
    anthropic: profile.anthropic_api_key,
    openai: profile.openai_api_key,
    heygen: profile.heygen_api_key,
    falai: profile.falai_api_key,
    cloudinaryCloud: c.cloudName, cloudinaryKey: c.apiKey, cloudinarySecret: c.apiSecret, cloudinaryFolder: c.folder,
  };
}

async function processJob(job: any) {
  await admin.from("pending_jobs").update({ status: "processing" }).eq("id", job.id);

  const finish = async (extra: any = {}) => {
    await admin.from("pending_jobs").update({ status: "completed", completed_at: new Date().toISOString(), ...extra }).eq("id", job.id);
  };

  switch (job.type) {
    case "draft": {
      await handleDraft(job); // sets its own completed status
      return;
    }
    case "research": {
      const { profile, brandConfig } = await loadContext(job.user_id);
      if (!profile?.anthropic_api_key) throw new Error("API key not configured");
      await runResearch({ admin, userId: job.user_id, jobId: job.id, brandConfig, apiKey: profile.anthropic_api_key });
      await finish();
      return;
    }
    case "bootstrap": {
      const { profile } = await loadContext(job.user_id);
      if (!profile?.anthropic_api_key) throw new Error("API key not configured");
      const ctx = job.context ? JSON.parse(job.context) : {};
      await runBootstrap({ admin, userId: job.user_id, apiKey: profile.anthropic_api_key, ...ctx });
      await finish();
      return;
    }
    case "images": {
      const { profile, brandConfig } = await loadContext(job.user_id);
      await runImageGeneration({ admin, userId: job.user_id, draftId: job.draft_id, brandConfig, keys: keysFromProfile(profile) });
      await finish();
      return;
    }
    case "avatar_video": {
      const { profile, brandConfig } = await loadContext(job.user_id);
      await runAvatarVideo({ admin, userId: job.user_id, draftId: job.draft_id, brandConfig, keys: keysFromProfile(profile), webhookUrl: VIDEO_WEBHOOK_URL });
      await finish(); // job done once submitted; webhook resolves the draft
      return;
    }
    case "broll": {
      const { profile, brandConfig } = await loadContext(job.user_id);
      await runBroll({ admin, userId: job.user_id, draftId: job.draft_id, brandConfig, keys: keysFromProfile(profile), mode: job.mode, clipCount: job.clip_count, webhookUrl: VIDEO_WEBHOOK_URL });
      await finish();
      return;
    }
    case "publish": {
      const { profile } = await loadContext(job.user_id);
      await runPublish({ admin, userId: job.user_id, draftId: job.draft_id, publishing: profile.publishing || {}, mode: job.mode, scheduledAt: job.scheduled_at });
      await finish();
      return;
    }
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

Deno.serve(async (req) => {
  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const job = payload?.record;
  if (!job?.id) {
    return new Response(JSON.stringify({ error: "No job record" }), { status: 400 });
  }
  if (!job.user_id) {
    await admin.from("pending_jobs").update({ status: "failed", error: "Job missing user_id", completed_at: new Date().toISOString() }).eq("id", job.id);
    return new Response(JSON.stringify({ error: "Job missing user_id" }), { status: 200 });
  }

  try {
    await processJob(job);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("processJob failed", err);
    await admin.from("pending_jobs").update({
      status: "failed", error: String((err as Error)?.message || err).slice(0, 500), completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return new Response(JSON.stringify({ ok: false, error: String((err as Error)?.message || err) }), { status: 200 });
  }
});
