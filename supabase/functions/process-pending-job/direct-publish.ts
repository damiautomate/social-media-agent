// DIY direct publishing — posts straight to each platform's API using the
// user's own stored OAuth token (decrypted here). Called by the edge function
// when publishing.provider === "direct".
//
// Mirrors the Postiz publish contract: updates the draft's `publish` block to
// publishing → published / failed, sets status, records provider post ids.

import { decryptToken } from "./crypto.ts";

const GRAPH = "https://graph.facebook.com/v23.0";

// Pull the active connection row (with decrypted tokens) for a user+platform.
async function getConnection(admin: any, userId: string, platform: string) {
  const { data } = await admin.from("social_connections")
    .select("*").eq("user_id", userId).eq("platform", platform).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return {
    accountId: data.account_id, meta: data.meta || {}, scope: data.scope,
    accessToken: await decryptToken(data.access_token),
    refreshToken: data.refresh_token ? await decryptToken(data.refresh_token) : null,
    tokenExpiresAt: data.token_expires_at,
  };
}

// JSONB columns normally arrive parsed, but guard against string-encoded values.
function j(v: any) {
  if (v == null) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

function composeText(draft: any) {
  const raw = j(draft.hashtags) || [];
  const tags = (Array.isArray(raw) ? raw : [])
    .map((h: string) => `#${String(h).replace(/^#+/, "")}`) // strip any existing # so we never double it
    .join(" ");
  return draft.post_text + (tags ? `\n\n${tags}` : "");
}

// Collect media URLs (already hosted on Cloudinary) in preference order.
function media(draft: any, pref: string) {
  const imagesBlock = j(draft.images) || {};
  const avatarBlock = j(draft.avatar_video) || {};
  const brollBlock = j(draft.broll) || {};
  const images = (imagesBlock.items || []).map((i: any) => i.url).filter(Boolean);
  const avatar = avatarBlock.status === "ready" && avatarBlock.url ? [avatarBlock.url] : [];
  const broll = (brollBlock.clips || []).map((c: any) => c.url).filter(Boolean);
  const videos = [...avatar, ...broll];
  if (pref === "text_only") return { images: [], videos: [] };
  return { images, videos };
}

// ---------- LinkedIn (legacy /v2/assets + /v2/ugcPosts) ----------
// Works on the "Share on LinkedIn" product with w_member_social — no Community
// Management API needed. Handles text, single image, and multi-image. Legacy
// endpoints are slated for eventual sunset; migrate to versioned /rest when the
// app gains Community Management API access.

// Register an upload slot, PUT the bytes, return the asset URN (urn:li:digitalmediaAsset:...).
async function linkedinUploadImage(token: string, ownerUrn: string, imageUrl: string): Promise<string> {
  const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: ownerUrn,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  });
  if (!regRes.ok) throw new Error(`LinkedIn registerUpload HTTP ${regRes.status}: ${(await regRes.text()).slice(0, 200)}`);
  const reg = await regRes.json();
  const asset = reg?.value?.asset;
  const uploadUrl = reg?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  if (!asset || !uploadUrl) throw new Error("LinkedIn registerUpload returned no asset/uploadUrl");

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Fetch image bytes HTTP ${imgRes.status}`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());

  // Byte upload is a PUT with the bearer token (LinkedIn's --upload-file flow).
  const putRes = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: bytes });
  if (!putRes.ok && putRes.status !== 201) throw new Error(`LinkedIn image upload HTTP ${putRes.status}: ${(await putRes.text()).slice(0, 200)}`);
  return asset;
}

async function publishLinkedIn(conn: any, draft: any, pref: string) {
  const author = conn.meta.memberUrn || `urn:li:person:${conn.accountId}`;
  const token = conn.accessToken;
  const { images } = media(draft, pref);

  // Upload each available image → asset URNs (skip any that fail rather than abort)
  const assets: string[] = [];
  for (const url of images.slice(0, 9)) {
    try { assets.push(await linkedinUploadImage(token, author, url)); }
    catch (e) { console.warn("LI image skip:", (e as Error).message); }
  }

  const altBase = (draft.alt_text || draft.hook_preview || "image").slice(0, 200);
  const share: any = {
    shareCommentary: { text: composeText(draft) },
    shareMediaCategory: assets.length > 0 ? "IMAGE" : "NONE",
  };
  if (assets.length > 0) {
    share.media = assets.map((a, i) => ({
      status: "READY",
      media: a,
      description: { text: altBase },
      title: { text: `${altBase}${assets.length > 1 ? " " + (i + 1) : ""}`.slice(0, 200) },
    }));
  }

  const body = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: { "com.linkedin.ugc.ShareContent": share },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LinkedIn ugcPosts HTTP ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const id = res.headers.get("x-restli-id") || (await res.json().catch(() => ({})))?.id || null;
  return { postIds: id ? [id] : [], imagesPosted: assets.length };
}

// ---------- Facebook Page ----------
async function publishFacebook(conn: any, draft: any, pref: string) {
  const pageId = conn.meta.pageId || conn.accountId;
  const token = conn.accessToken; // page token
  const { images } = media(draft, pref);
  const message = composeText(draft);

  if (images.length > 0) {
    // Single photo post (multi-photo would need unpublished children + feed attach).
    const p = new URLSearchParams({ url: images[0], caption: message, access_token: token });
    const res = await fetch(`${GRAPH}/${pageId}/photos`, { method: "POST", body: p });
    if (!res.ok) throw new Error(`FB photos HTTP ${res.status}: ${(await res.text()).slice(0, 250)}`);
    const d = await res.json();
    return { postIds: [d.post_id || d.id].filter(Boolean) };
  }
  const p = new URLSearchParams({ message, access_token: token });
  const res = await fetch(`${GRAPH}/${pageId}/feed`, { method: "POST", body: p });
  if (!res.ok) throw new Error(`FB feed HTTP ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const d = await res.json();
  return { postIds: [d.id].filter(Boolean) };
}

// ---------- Instagram (Business) — 2-step container → publish ----------
async function publishInstagram(conn: any, draft: any, pref: string) {
  const igId = conn.meta.igBusinessId || conn.accountId;
  const token = conn.accessToken; // page token
  const { images, videos } = media(draft, pref);
  const caption = composeText(draft);
  if (images.length === 0 && videos.length === 0) {
    throw new Error("Instagram requires an image or video — text-only posts aren't supported.");
  }

  // Build the media container (image or reel video)
  const params = new URLSearchParams({ caption, access_token: token });
  if (videos.length > 0) { params.set("media_type", "REELS"); params.set("video_url", videos[0]); }
  else { params.set("image_url", images[0]); }

  const cRes = await fetch(`${GRAPH}/${igId}/media`, { method: "POST", body: params });
  if (!cRes.ok) throw new Error(`IG container HTTP ${cRes.status}: ${(await cRes.text()).slice(0, 250)}`);
  const container = await cRes.json();

  // Video containers need processing time — poll status briefly
  if (videos.length > 0) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await fetch(`${GRAPH}/${container.id}?fields=status_code&access_token=${encodeURIComponent(token)}`);
      const sd = await st.json().catch(() => ({}));
      if (sd.status_code === "FINISHED") break;
      if (sd.status_code === "ERROR") throw new Error("IG video processing failed");
    }
  }

  const pubRes = await fetch(`${GRAPH}/${igId}/media_publish`, {
    method: "POST", body: new URLSearchParams({ creation_id: container.id, access_token: token }),
  });
  if (!pubRes.ok) throw new Error(`IG publish HTTP ${pubRes.status}: ${(await pubRes.text()).slice(0, 250)}`);
  const pd = await pubRes.json();
  return { postIds: [pd.id].filter(Boolean) };
}

// ---------- TikTok (Direct Post, PULL_FROM_URL) ----------
async function publishTikTok(conn: any, draft: any, pref: string) {
  const token = conn.accessToken;
  const { videos } = media(draft, pref);
  if (videos.length === 0) throw new Error("TikTok requires a video (avatar video or B-roll).");

  const init = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: (draft.post_text || "").slice(0, 2200),
        privacy_level: "SELF_ONLY", // unaudited clients are forced private regardless; explicit for safety
        disable_comment: false, disable_duet: false, disable_stitch: false,
      },
      source_info: { source: "PULL_FROM_URL", video_url: videos[0] },
    }),
  });
  if (!init.ok) throw new Error(`TikTok init HTTP ${init.status}: ${(await init.text()).slice(0, 250)}`);
  const d = await init.json();
  const publishId = d?.data?.publish_id;
  if (!publishId) throw new Error("TikTok returned no publish_id");
  // TikTok pulls + processes async; the post id is the publish_id for tracking.
  return { postIds: [publishId] };
}

const PUBLISHERS: Record<string, any> = {
  linkedin: (c: any, d: any, p: string) => publishLinkedIn(c, d, p),
  facebook: (c: any, d: any, p: string) => publishFacebook(c, d, p),
  instagram: (c: any, d: any, p: string) => publishInstagram(c, d, p),
  tiktok: (c: any, d: any, p: string) => publishTikTok(c, d, p),
};

export async function runDirectPublish({ admin, userId, draftId, mediaPreference }: any) {
  const { data: draft } = await admin.from("drafts").select("*").eq("id", draftId).single();
  if (!draft || draft.user_id !== userId) throw new Error("Draft not found");
  const platform = String(draft.platform || "").toLowerCase();

  await admin.from("drafts").update({ publish: { status: "publishing", provider: "direct", error: null }, updated_at: new Date().toISOString() }).eq("id", draftId);

  try {
    const publisher = PUBLISHERS[platform];
    if (!publisher) throw new Error(`No direct publisher for platform "${platform}"`);
    const conn = await getConnection(admin, userId, platform);
    if (!conn) throw new Error(`No connected ${platform} account. Connect it in Settings → Channels.`);
    if (conn.tokenExpiresAt && new Date(conn.tokenExpiresAt).getTime() < Date.now()) {
      throw new Error(`Your ${platform} connection expired — reconnect it in Settings → Channels.`);
    }

    const { postIds } = await publisher(conn, draft, mediaPreference || "video_first");

    await admin.from("drafts").update({
      status: "published",
      publish: { status: "published", provider: "direct", providerPostIds: postIds, publishedAt: new Date().toISOString(), error: null },
      published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", draftId);
    return { ok: true, postIds };
  } catch (err) {
    await admin.from("drafts").update({
      publish: { status: "failed", provider: "direct", error: String((err as Error)?.message || err).slice(0, 500) },
      updated_at: new Date().toISOString(),
    }).eq("id", draftId);
    throw err;
  }
}
