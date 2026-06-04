// LEARNING LOOP — Phase B: pull real performance back from the platforms and
// write it onto post_performance rows. Best-effort per platform (each API exposes
// different metrics; LinkedIn-personal gives engagement counts, Meta gives more).

import { decryptToken } from "./crypto.ts";

const GRAPH = "https://graph.facebook.com/v23.0";

async function getConn(admin: any, userId: string, platform: string) {
  const { data } = await admin.from("social_connections")
    .select("*").eq("user_id", userId).eq("platform", platform).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { accessToken: await decryptToken(data.access_token), meta: data.meta || {} };
}

// ---- LinkedIn: socialActions → likes (reactions) + comments. Needs r_member_social. ----
async function fetchLinkedIn(conn: any, postUrn: string) {
  const res = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, "X-Restli-Protocol-Version": "2.0.0" },
  });
  if (!res.ok) throw new Error(`LI socialActions HTTP ${res.status}`);
  const d = await res.json();
  const reactions = d?.likesSummary?.totalLikes ?? d?.likesSummary?.aggregatedTotalLikes ?? 0;
  const comments = d?.commentsSummary?.count ?? d?.commentsSummary?.aggregatedTotalComments ?? 0;
  return { reactions, comments }; // impressions not available for member posts
}

// ---- Facebook Page post: summaries + insights ----
async function fetchFacebook(conn: any, postId: string) {
  const token = conn.accessToken;
  const out: any = {};
  const r = await fetch(`${GRAPH}/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(token)}`);
  if (r.ok) {
    const d = await r.json();
    out.reactions = d?.likes?.summary?.total_count ?? 0;
    out.comments = d?.comments?.summary?.total_count ?? 0;
    out.shares = d?.shares?.count ?? 0;
  }
  const ir = await fetch(`${GRAPH}/${postId}/insights?metric=post_impressions,post_clicks&access_token=${encodeURIComponent(token)}`);
  if (ir.ok) {
    const id = await ir.json();
    for (const m of id.data || []) {
      if (m.name === "post_impressions") out.impressions = m.values?.[0]?.value ?? null;
      if (m.name === "post_clicks") out.clicks = m.values?.[0]?.value ?? null;
    }
  }
  return out;
}

// ---- Instagram media: like/comment counts + best-effort reach ----
async function fetchInstagram(conn: any, mediaId: string) {
  const token = conn.accessToken;
  const out: any = {};
  const r = await fetch(`${GRAPH}/${mediaId}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`);
  if (r.ok) { const d = await r.json(); out.reactions = d?.like_count ?? 0; out.comments = d?.comments_count ?? 0; }
  const ir = await fetch(`${GRAPH}/${mediaId}/insights?metric=reach&access_token=${encodeURIComponent(token)}`);
  if (ir.ok) { const id = await ir.json(); const reach = (id.data || []).find((m: any) => m.name === "reach"); if (reach) out.impressions = reach.values?.[0]?.value ?? null; }
  return out;
}

const FETCHERS: Record<string, (c: any, id: string) => Promise<any>> = {
  linkedin: fetchLinkedIn,
  facebook: fetchFacebook,
  instagram: fetchInstagram,
  // tiktok: needs the video.list scope + resolving publish_id → video_id; added later.
};

export async function runMetricsRefresh({ admin, userId }: any): Promise<any> {
  const { data: rows } = await admin.from("post_performance")
    .select("*").eq("user_id", userId).not("provider_post_id", "is", null)
    .order("posted_at", { ascending: false }).limit(120);

  const byPlatform: Record<string, any[]> = {};
  for (const r of rows || []) (byPlatform[r.platform] ||= []).push(r);

  let updated = 0, skipped = 0;
  for (const [platform, list] of Object.entries(byPlatform)) {
    const fetcher = FETCHERS[platform];
    if (!fetcher) { skipped += list.length; continue; }
    const conn = await getConn(admin, userId, platform);
    if (!conn) { skipped += list.length; continue; }

    for (const row of list) {
      try {
        const m = await fetcher(conn, row.provider_post_id);
        if (!m) { skipped++; continue; }
        const reactions = m.reactions ?? row.reactions ?? 0;
        const comments = m.comments ?? row.comments ?? 0;
        const shares = m.shares ?? row.shares ?? 0;
        const impressions = m.impressions ?? row.impressions ?? null;
        const clicks = m.clicks ?? row.clicks ?? null;
        const engagement = (reactions || 0) + (comments || 0) + (shares || 0);
        const engagement_rate = impressions ? Number((engagement / impressions).toFixed(4)) : null;
        await admin.from("post_performance").update({
          reactions, comments, shares, impressions, clicks, engagement, engagement_rate,
          metrics_source: "api", metrics_fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        updated++;
      } catch (_e) { skipped++; }
    }
  }
  return { updated, skipped };
}
