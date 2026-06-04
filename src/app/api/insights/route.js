import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { listPostPerformance } from "@/lib/content-bank.js";

// Aggregates performance by the content "knobs" so we (and later the agent) can
// see what's working. Engagement = reactions + comments + shares.
function summarize(rows, key) {
  const groups = {};
  for (const r of rows) {
    const k = r[key] || "—";
    (groups[k] ||= { key: k, posts: 0, engagement: 0, withMetrics: 0 });
    groups[k].posts++;
    if (r.metrics_fetched_at) { groups[k].engagement += (r.engagement || 0); groups[k].withMetrics++; }
  }
  return Object.values(groups)
    .map((g) => ({ ...g, avgEngagement: g.withMetrics ? Math.round(g.engagement / g.withMetrics) : null }))
    .sort((a, b) => (b.avgEngagement || -1) - (a.avgEngagement || -1));
}

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rows = await listPostPerformance(auth.userId, 300);
  const measured = rows.filter((r) => r.metrics_fetched_at);
  return NextResponse.json({
    totals: {
      posts: rows.length,
      measured: measured.length,
      totalEngagement: measured.reduce((s, r) => s + (r.engagement || 0), 0),
    },
    byMediaType: summarize(rows, "media_type"),
    byLayout: summarize(rows.filter((r) => r.card_layout), "card_layout"),
    byPillar: summarize(rows.filter((r) => r.pillar), "pillar"),
    byPlatform: summarize(rows, "platform"),
    posts: rows.slice(0, 60).map((r) => ({
      id: r.id, platform: r.platform, mediaType: r.media_type, layout: r.card_layout,
      pillar: r.pillar, postedAt: r.posted_at,
      reactions: r.reactions, comments: r.comments, shares: r.shares,
      impressions: r.impressions, engagement: r.engagement,
      measured: !!r.metrics_fetched_at, source: r.metrics_source,
    })),
  });
}
