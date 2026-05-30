// Supabase Edge Function: video-webhook
// Receives provider callbacks (HeyGen avatar, fal.ai B-roll), mirrors the
// finished video into Cloudinary, and updates the draft's avatar_video / broll block.
//
// Set this function's URL as:
//   - HeyGen callback_url (passed per-request by process-pending-job)
//   - fal.ai webhook target
// And set VIDEO_WEBHOOK_URL in process-pending-job to point here.
//
// Resolution is keyed by external_id stored in public.video_jobs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function mirrorToCloudinary(profile: any, remoteUrl: string, draftId: string, slot: string) {
  const c = profile.cloudinary || {};
  if (!c.cloudName || !c.apiKey || !c.apiSecret) return remoteUrl; // fall back to provider URL
  const folder = `${c.folder || "social-agent"}/drafts/${draftId}/video`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signed: Record<string, string | number> = { folder, public_id: slot, timestamp, overwrite: "true" };
  const toSign = Object.keys(signed).sort().map((k) => `${k}=${signed[k]}`).join("&");
  const signature = await sha1Hex(toSign + c.apiSecret);
  const form = new URLSearchParams();
  form.set("file", remoteUrl);
  form.set("api_key", c.apiKey);
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  form.set("folder", folder);
  form.set("public_id", slot);
  form.set("overwrite", "true");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloudName)}/video/upload`, { method: "POST", body: form });
  if (!res.ok) return remoteUrl;
  const data = await res.json();
  return data.secure_url || remoteUrl;
}

async function resolveAvatar(vjob: any, videoUrl: string, thumbnailUrl: string | null, duration: number | null) {
  const { data: profile } = await admin.from("profiles").select("cloudinary").eq("id", vjob.user_id).single();
  const mirrored = await mirrorToCloudinary(profile, videoUrl, vjob.draft_id, "avatar");
  const { data: draft } = await admin.from("drafts").select("avatar_video").eq("id", vjob.draft_id).single();
  const prev = draft?.avatar_video || {};
  await admin.from("drafts").update({
    avatar_video: { ...prev, status: "ready", url: mirrored, thumbnailUrl: thumbnailUrl || prev.thumbnailUrl || null, duration: duration || prev.duration || null, error: null },
    updated_at: new Date().toISOString(),
  }).eq("id", vjob.draft_id);
  await admin.from("video_jobs").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", vjob.id);
}

async function failAvatar(vjob: any, error: string) {
  const { data: draft } = await admin.from("drafts").select("avatar_video").eq("id", vjob.draft_id).single();
  const prev = draft?.avatar_video || {};
  await admin.from("drafts").update({ avatar_video: { ...prev, status: "failed", error: error.slice(0, 500) }, updated_at: new Date().toISOString() }).eq("id", vjob.draft_id);
  await admin.from("video_jobs").update({ status: "failed", error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", vjob.id);
}

async function resolveBrollClip(vjob: any, videoUrl: string, duration: number | null) {
  const { data: profile } = await admin.from("profiles").select("cloudinary").eq("id", vjob.user_id).single();
  const mirrored = await mirrorToCloudinary(profile, videoUrl, vjob.draft_id, `broll_${vjob.slot}`);
  const { data: draft } = await admin.from("drafts").select("broll").eq("id", vjob.draft_id).single();
  const broll = draft?.broll || { clips: [] };
  const clips = Array.isArray(broll.clips) ? broll.clips.filter((c: any) => c.slot !== vjob.slot) : [];
  clips.push({ slot: vjob.slot, url: mirrored, prompt: vjob.prompt, duration: duration || null, intent: "" });

  // Count expected vs ready clips for this draft
  const { data: allJobs } = await admin.from("video_jobs").select("status").eq("draft_id", vjob.draft_id).eq("kind", "broll");
  const total = (allJobs || []).length;
  const ready = (allJobs || []).filter((j: any) => j.status === "ready").length + 1; // +1 = this one
  const failed = (allJobs || []).filter((j: any) => j.status === "failed").length;
  let status = "generating";
  if (ready + failed >= total) status = failed > 0 ? "partial" : "ready";

  await admin.from("drafts").update({
    broll: { ...broll, status, clips, error: failed > 0 ? `${failed} clip(s) failed` : null },
    updated_at: new Date().toISOString(),
  }).eq("id", vjob.draft_id);
  await admin.from("video_jobs").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", vjob.id);
}

async function failBrollClip(vjob: any, error: string) {
  await admin.from("video_jobs").update({ status: "failed", error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", vjob.id);
  const { data: allJobs } = await admin.from("video_jobs").select("status").eq("draft_id", vjob.draft_id).eq("kind", "broll");
  const total = (allJobs || []).length;
  const ready = (allJobs || []).filter((j: any) => j.status === "ready").length;
  const failed = (allJobs || []).filter((j: any) => j.status === "failed").length;
  if (ready + failed >= total) {
    const { data: draft } = await admin.from("drafts").select("broll").eq("id", vjob.draft_id).single();
    const broll = draft?.broll || { clips: [] };
    await admin.from("drafts").update({
      broll: { ...broll, status: ready > 0 ? "partial" : "failed", error: `${failed} clip(s) failed` },
      updated_at: new Date().toISOString(),
    }).eq("id", vjob.draft_id);
  }
}

// Find the video_job this callback refers to.
async function findJob(externalId: string) {
  if (!externalId) return null;
  const { data } = await admin.from("video_jobs").select("*").eq("external_id", externalId).eq("status", "submitted").maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  let body: any;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  try {
    // --- HeyGen callback shape: { event_type, event_data: { video_id, url, ... } } ---
    if (body?.event_type || body?.event_data?.video_id) {
      const videoId = body.event_data?.video_id || body.video_id;
      const vjob = await findJob(videoId);
      if (!vjob) return new Response(JSON.stringify({ ok: true, note: "no matching job" }), { status: 200 });
      const type = body.event_type || "";
      if (type.includes("fail") || body.event_data?.status === "failed") {
        await failAvatar(vjob, body.event_data?.msg || "HeyGen reported failure");
      } else {
        const url = body.event_data?.url || body.event_data?.video_url;
        const thumb = body.event_data?.thumbnail_url || null;
        const duration = body.event_data?.duration || null;
        if (!url) await failAvatar(vjob, "HeyGen callback missing video url");
        else await resolveAvatar(vjob, url, thumb, duration);
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // --- fal.ai webhook shape: { request_id, status, payload: { video: { url } } } ---
    if (body?.request_id || body?.requestId) {
      const requestId = body.request_id || body.requestId;
      const vjob = await findJob(requestId);
      if (!vjob) return new Response(JSON.stringify({ ok: true, note: "no matching job" }), { status: 200 });
      const status = body.status || (body.payload ? "OK" : "");
      if (String(status).toUpperCase().includes("ERROR") || body.error) {
        await failBrollClip(vjob, body.error || "fal.ai reported error");
      } else {
        const url = body.payload?.video?.url || body.payload?.video_url || body.video?.url;
        const duration = body.payload?.duration || null;
        if (!url) await failBrollClip(vjob, "fal.ai callback missing video url");
        else await resolveBrollClip(vjob, url, duration);
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true, note: "unrecognized payload" }), { status: 200 });
  } catch (err) {
    console.error("video-webhook error", err);
    return new Response(JSON.stringify({ ok: false, error: String((err as Error)?.message || err) }), { status: 200 });
  }
});
