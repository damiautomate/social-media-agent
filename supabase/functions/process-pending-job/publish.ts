// Publishing via Postiz (provider registry pattern; Postiz implemented).

function normalizeBaseUrl(b: string): string {
  if (!b) return "";
  const u = b.replace(/\/+$/, "");
  if (u.endsWith("/public/v1")) return u;
  if (u.endsWith("/api")) return `${u}/public/v1`;
  return `${u}/public/v1`;
}

// Collects ordered media URLs from the draft per the user's media preference.
function collectMedia(draft: any, mediaPreference: string): string[] {
  const images = (draft.images?.items || []).map((i: any) => i.url).filter(Boolean);
  const avatar = draft.avatar_video?.status === "ready" && draft.avatar_video?.url ? [draft.avatar_video.url] : [];
  const broll = (draft.broll?.clips || []).map((c: any) => c.url).filter(Boolean);
  switch (mediaPreference) {
    case "image_first": return [...images, ...avatar, ...broll];
    case "broll_first": return [...broll, ...avatar, ...images];
    case "text_only": return [];
    case "video_first":
    default: return [...avatar, ...broll, ...images];
  }
}

async function postizUploadFromUrl(baseUrl: string, apiKey: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/upload-from-url`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id || data?.path || data?.url || null;
  } catch { return null; }
}

export async function runPublish({ admin, userId, draftId, publishing, mode, scheduledAt }: any): Promise<any> {
  const { data: draft } = await admin.from("drafts").select("*").eq("id", draftId).single();
  if (!draft || draft.user_id !== userId) throw new Error("Draft not found");

  const targetKey = String(draft.platform || "").toLowerCase();
  const integrations = Array.isArray(publishing.integrations) ? publishing.integrations : [];
  const match = integrations.find((i: any) => (i.platformKey || "").toLowerCase() === targetKey);
  if (!match) throw new Error(`No Postiz integration mapped for platform "${draft.platform}"`);

  const provider = publishing.provider || "postiz";
  const statusKey = mode === "schedule" ? "scheduling" : "publishing";
  await admin.from("drafts").update({ publish: { status: statusKey, provider, error: null }, updated_at: new Date().toISOString() }).eq("id", draftId);

  try {
    if (provider !== "postiz") throw new Error(`Unsupported provider: ${provider}`);
    const baseUrl = publishing.postiz?.baseUrl;
    const apiKey = publishing.postiz?.apiKey;
    if (!baseUrl || !apiKey) throw new Error("Postiz config incomplete");

    const mediaPreference = publishing.mediaPreference || "video_first";
    const mediaUrls = collectMedia(draft, mediaPreference);
    const uploadedMedia: string[] = [];
    for (const url of mediaUrls.slice(0, 4)) {
      const id = await postizUploadFromUrl(baseUrl, apiKey, url);
      if (id) uploadedMedia.push(id);
    }

    // Compose Postiz post body
    const content = draft.post_text + (draft.hashtags?.length ? "\n\n" + draft.hashtags.map((h: string) => `#${h}`).join(" ") : "");
    const postBody: any = {
      type: mode === "schedule" ? "schedule" : "now",
      posts: [{
        integration: { id: match.integrationId },
        value: [{ content, image: uploadedMedia.map((m) => ({ id: m })) }],
      }],
    };
    if (mode === "schedule") postBody.date = scheduledAt;

    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/posts`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(postBody),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Postiz posts HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const postIds = Array.isArray(data) ? data.map((p: any) => p.id || p.postId).filter(Boolean) : (data?.id ? [data.id] : []);

    if (mode === "schedule") {
      await admin.from("drafts").update({
        status: "approved",
        publish: { status: "scheduled", provider, providerPostIds: postIds, mediaCount: uploadedMedia.length, scheduledFor: scheduledAt, error: null },
        scheduled_for: scheduledAt, updated_at: new Date().toISOString(),
      }).eq("id", draftId);
    } else {
      await admin.from("drafts").update({
        status: "published",
        publish: { status: "published", provider, providerPostIds: postIds, mediaCount: uploadedMedia.length, publishedAt: new Date().toISOString(), error: null },
        published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", draftId);
    }

    return { ok: true, mode, postIds, mediaCount: uploadedMedia.length };
  } catch (err) {
    await admin.from("drafts").update({ publish: { status: "failed", provider, error: String((err as Error)?.message || err).slice(0, 500) }, updated_at: new Date().toISOString() }).eq("id", draftId);
    throw err;
  }
}
