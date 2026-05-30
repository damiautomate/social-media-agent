// Supabase port of the Firestore content-bank.
// Keeps the SAME exported function names + signatures the API routes already use,
// so route code barely changes. All writes use the service_role admin client
// (bypasses RLS, exactly like Firebase Admin SDK did).
//
// Postgres columns are snake_case; we map to/from camelCase here so the rest of
// the app (UI + routes) keeps using camelCase unchanged.

import { supabaseAdmin } from "./supabase-admin.js";
import { DEFAULT_BRAND_TEMPLATE } from "../config/default-brand-template.js";

// ---------- mapping helpers ----------

// profiles row -> app user object (camelCase, with nested cloudinary/publishing)
function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    photoURL: row.photo_url,
    anthropicApiKey: row.anthropic_api_key,
    openaiApiKey: row.openai_api_key,
    heygenApiKey: row.heygen_api_key,
    falaiApiKey: row.falai_api_key,
    cloudinary: row.cloudinary || {},
    publishing: row.publishing || {},
    hasCompletedOnboarding: row.has_completed_onboarding,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

// brand_configs row -> single brandConfig object the app expects
function mapBrandConfig(row) {
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
    updatedAt: row.updated_at,
  };
}

// app brandConfig (partial) -> brand_configs columns (snake_case JSONB)
function brandConfigToColumns(partial) {
  const out = {};
  if ("identity" in partial) out.identity = partial.identity;
  if ("voice" in partial) out.voice = partial.voice;
  if ("contentPillars" in partial) out.content_pillars = partial.contentPillars;
  if ("platforms" in partial) out.platforms = partial.platforms;
  if ("visualStyle" in partial) out.visual_style = partial.visualStyle;
  if ("videoStyle" in partial) out.video_style = partial.videoStyle;
  if ("publishing" in partial) out.publishing = partial.publishing;
  if ("research" in partial) out.research = partial.research;
  return out;
}

// drafts row -> app draft object (camelCase). JSONB feature blocks are flattened
// onto the draft so existing UI fields keep working.
function mapDraft(row) {
  if (!row) return null;
  const images = row.images || {};
  const avatar = row.avatar_video || {};
  const broll = row.broll || {};
  const publish = row.publish || {};
  return {
    id: row.id,
    userId: row.user_id,
    ideaId: row.idea_id,
    jobId: row.job_id,
    platform: row.platform,
    formatType: row.format_type,
    pillar: row.pillar,
    postText: row.post_text,
    hashtags: row.hashtags || [],
    hookPreview: row.hook_preview,
    firstComment: row.first_comment,
    contentNotes: row.content_notes,
    carouselSlides: row.carousel_slides || [],
    videoScript: row.video_script,
    altText: row.alt_text,
    engagementHooks: row.engagement_hooks || [],
    estimatedReadTime: row.estimated_read_time,
    status: row.status,
    // Phase 3b images
    images: Array.isArray(images.items) ? images.items : [],
    imagesStatus: images.status || null,
    imagesError: images.error || null,
    imagesAspect: images.aspect || null,
    // Phase 3c.1 avatar video
    avatarVideoStatus: avatar.status || null,
    avatarVideoUrl: avatar.url || null,
    avatarVideoThumbnailUrl: avatar.thumbnailUrl || null,
    avatarVideoDuration: avatar.duration || null,
    avatarVideoScriptWordCount: avatar.wordCount || null,
    avatarVideoScriptHook: avatar.hook || null,
    avatarVideoError: avatar.error || null,
    // Phase 3c.2 broll
    brollStatus: broll.status || null,
    brollMode: broll.mode || null,
    brollModelId: broll.modelId || null,
    brollError: broll.error || null,
    brollClips: Array.isArray(broll.clips) ? broll.clips : [],
    // Phase 4 publish
    publishStatus: publish.status || null,
    publishProvider: publish.provider || null,
    publishProviderPostIds: publish.providerPostIds || [],
    publishMediaCount: publish.mediaCount || null,
    publishScheduledFor: publish.scheduledFor || null,
    publishError: publish.error || null,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    publishId: row.publish_id,
    tokensUsed: row.tokens_used,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIdea(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    topic: row.topic,
    angle: row.angle,
    pillar: row.pillar,
    source: row.source,
    urgency: row.urgency,
    relevanceScore: row.relevance_score,
    scoreDetail: row.score_detail || {},
    status: row.status,
    createdAt: row.created_at,
    usedAt: row.used_at,
  };
}

// ---------- users / profiles ----------

export async function bootstrapNewUser(userId, { email, displayName, photoURL }) {
  // Upsert profile (insert if missing, else touch last_active_at)
  const { data: existing } = await supabaseAdmin
    .from("profiles").select("id").eq("id", userId).maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("profiles").insert({
      id: userId,
      email: email || null,
      display_name: displayName || "",
      photo_url: photoURL || null,
      has_completed_onboarding: false,
    });
  } else {
    await supabaseAdmin.from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", userId);
  }

  // Ensure a brand_configs row exists, seeded from the template
  const { data: brand } = await supabaseAdmin
    .from("brand_configs").select("user_id").eq("user_id", userId).maybeSingle();

  if (!brand) {
    const t = DEFAULT_BRAND_TEMPLATE;
    await supabaseAdmin.from("brand_configs").insert({
      user_id: userId,
      identity: t.identity || {},
      voice: t.voice || {},
      content_pillars: t.contentPillars || [],
      platforms: t.platforms || {},
      visual_style: t.visualStyle || {},
      video_style: t.videoStyle || {},
      publishing: t.publishing || {},
      research: t.research || {},
    });
  } else {
    // Backfill research block for older rows (non-destructive)
    const { data: row } = await supabaseAdmin
      .from("brand_configs").select("research").eq("user_id", userId).single();
    if (!row?.research || Object.keys(row.research).length === 0) {
      await supabaseAdmin.from("brand_configs")
        .update({ research: DEFAULT_BRAND_TEMPLATE.research })
        .eq("user_id", userId);
    }
  }
}

export async function getUser(userId) {
  const { data } = await supabaseAdmin
    .from("profiles").select("*").eq("id", userId).maybeSingle();
  return mapProfile(data);
}

export async function setApiKey(userId, apiKey) {
  await supabaseAdmin.from("profiles")
    .update({ anthropic_api_key: apiKey, last_active_at: new Date().toISOString() })
    .eq("id", userId);
}

export async function setOpenaiApiKey(userId, apiKey) {
  await supabaseAdmin.from("profiles").update({ openai_api_key: apiKey }).eq("id", userId);
}
export async function setHeygenApiKey(userId, apiKey) {
  await supabaseAdmin.from("profiles").update({ heygen_api_key: apiKey }).eq("id", userId);
}
export async function setFalaiApiKey(userId, apiKey) {
  await supabaseAdmin.from("profiles").update({ falai_api_key: apiKey }).eq("id", userId);
}
export async function setCloudinary(userId, cloudinary) {
  await supabaseAdmin.from("profiles").update({ cloudinary }).eq("id", userId);
}

// Publishing config helpers (Phase 4)
export async function setPostizConfig(userId, { baseUrl, apiKey }) {
  const user = await getUser(userId);
  const publishing = { ...(user?.publishing || {}), postiz: { baseUrl, apiKey } };
  await supabaseAdmin.from("profiles").update({ publishing }).eq("id", userId);
}
export async function setPublishingProvider(userId, provider) {
  const user = await getUser(userId);
  const publishing = { ...(user?.publishing || {}), provider };
  await supabaseAdmin.from("profiles").update({ publishing }).eq("id", userId);
}
export async function setPublishingIntegrations(userId, integrations) {
  const user = await getUser(userId);
  const publishing = { ...(user?.publishing || {}), integrations };
  await supabaseAdmin.from("profiles").update({ publishing }).eq("id", userId);
}

export async function setOnboardingComplete(userId) {
  await supabaseAdmin.from("profiles")
    .update({ has_completed_onboarding: true, last_active_at: new Date().toISOString() })
    .eq("id", userId);
}

// ---------- brand config ----------

export async function getBrandConfig(userId) {
  const { data } = await supabaseAdmin
    .from("brand_configs").select("*").eq("user_id", userId).maybeSingle();
  return mapBrandConfig(data);
}

export async function updateBrandConfig(userId, partial) {
  const cols = brandConfigToColumns(partial || {});
  cols.updated_at = new Date().toISOString();
  await supabaseAdmin.from("brand_configs").update(cols).eq("user_id", userId);
  return getBrandConfig(userId);
}

// ---------- ideas ----------

export async function listIdeas(userId, { status, limit = 50 } = {}) {
  let q = supabaseAdmin.from("ideas").select("*").eq("user_id", userId);
  if (status) q = q.eq("status", status);
  q = q.order("created_at", { ascending: false }).limit(limit);
  const { data } = await q;
  return (data || []).map(mapIdea);
}

export async function createIdea(userId, idea) {
  const { data } = await supabaseAdmin.from("ideas").insert({
    user_id: userId,
    topic: idea.topic,
    angle: idea.angle || null,
    pillar: idea.pillar || null,
    source: idea.source || "manual",
    urgency: idea.urgency || "normal",
    relevance_score: idea.relevanceScore || 0,
    score_detail: idea.scoreDetail || {},
    status: idea.status || "new",
  }).select("id").single();
  return data.id;
}

// ---------- pending jobs ----------

export async function createPendingJob(userId, job) {
  const { data } = await supabaseAdmin.from("pending_jobs").insert({
    user_id: userId,
    type: job.type || "draft",
    idea_id: job.ideaId || null,
    platform: job.platform || null,
    topic: job.topic || null,
    angle: job.angle || null,
    pillar: job.pillar || null,
    context: job.context || null,
    draft_id: job.draftId || null,
    mode: job.mode || null,
    clip_count: job.clipCount || null,
    scheduled_at: job.scheduledAt || null,
    status: "queued",
  }).select("id").single();
  return data.id;
}

export async function createResearchJob(userId) {
  const { data } = await supabaseAdmin.from("pending_jobs").insert({
    user_id: userId, type: "research", status: "queued",
  }).select("id").single();
  return data.id;
}

export async function hasActiveResearchJob(userId) {
  const { data } = await supabaseAdmin.from("pending_jobs")
    .select("id").eq("user_id", userId).eq("type", "research")
    .in("status", ["queued", "processing"]).limit(1);
  return (data || []).length > 0;
}

// ---------- drafts ----------

export async function listDrafts(userId, { status, platform, limit = 100 } = {}) {
  let q = supabaseAdmin.from("drafts").select("*").eq("user_id", userId);
  if (status) q = q.eq("status", status);
  if (platform) q = q.eq("platform", platform);
  q = q.order("created_at", { ascending: false }).limit(limit);
  const { data } = await q;
  return (data || []).map(mapDraft);
}

export async function getDraft(userId, draftId) {
  const { data } = await supabaseAdmin
    .from("drafts").select("*").eq("id", draftId).maybeSingle();
  if (!data || data.user_id !== userId) return null;
  return mapDraft(data);
}

// Accepts camelCase partials for the base draft fields; status/edits etc.
export async function updateDraft(userId, draftId, partial) {
  const draft = await getDraft(userId, draftId);
  if (!draft) {
    const err = new Error("Draft not found");
    err.status = 404;
    throw err;
  }
  const cols = {};
  if ("status" in partial) cols.status = partial.status;
  if ("postText" in partial) cols.post_text = partial.postText;
  if ("firstComment" in partial) cols.first_comment = partial.firstComment;
  if ("hashtags" in partial) cols.hashtags = partial.hashtags;
  if ("hookPreview" in partial) cols.hook_preview = partial.hookPreview;
  if ("contentNotes" in partial) cols.content_notes = partial.contentNotes;
  if ("scheduledFor" in partial) cols.scheduled_for = partial.scheduledFor;
  cols.updated_at = new Date().toISOString();
  await supabaseAdmin.from("drafts").update(cols).eq("id", draftId);
}

// ---------- stats ----------

async function countDrafts(userId, status) {
  const { count } = await supabaseAdmin
    .from("drafts").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", status);
  return count || 0;
}

export async function getStats(userId) {
  const [pending, approved, published, ideasCount] = await Promise.all([
    countDrafts(userId, "pending"),
    countDrafts(userId, "approved"),
    countDrafts(userId, "published"),
    (async () => {
      const { count } = await supabaseAdmin
        .from("ideas").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "new");
      return count || 0;
    })(),
  ]);
  return { pending, approved, published, ideas: ideasCount };
}
