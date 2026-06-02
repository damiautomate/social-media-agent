import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, getDraft, createPendingJob, updateDraft, getSocialConnectionWithTokens } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { draftId, mode, scheduledAt } = body || {};
  if (!draftId) return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  const safeMode = mode === "schedule" ? "schedule" : "now";

  let scheduledIso = null;
  if (safeMode === "schedule") {
    if (!scheduledAt) return NextResponse.json({ error: "scheduledAt required for schedule mode" }, { status: 400 });
    const t = new Date(scheduledAt);
    if (isNaN(t.getTime())) return NextResponse.json({ error: "scheduledAt is not a valid datetime" }, { status: 400 });
    if (t.getTime() < Date.now() + 60000) return NextResponse.json({ error: "scheduledAt must be at least 1 min in the future" }, { status: 400 });
    scheduledIso = t.toISOString();
  }

  const draft = await getDraft(auth.userId, draftId);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (!draft.postText) return NextResponse.json({ error: "Draft has no postText" }, { status: 400 });

  const user = await getUser(auth.userId);
  const pub = user?.publishing || {};
  if (!pub.provider) return NextResponse.json({ error: "No publishing provider configured. Choose Postiz or Direct in Settings → Publishing." }, { status: 400 });
  const targetKey = String(draft.platform || "").toLowerCase();

  if (pub.provider === "direct") {
    // DIY: require a connected channel for this platform
    const conn = await getSocialConnectionWithTokens(auth.userId, targetKey);
    if (!conn) return NextResponse.json({ error: `No connected ${draft.platform} account. Settings → Channels → Connect.` }, { status: 400 });
  } else {
    if (!pub.postiz?.apiKey || !pub.postiz?.baseUrl) {
      return NextResponse.json({ error: "Postiz config incomplete. Settings → Publishing." }, { status: 400 });
    }
    const integrations = Array.isArray(pub.integrations) ? pub.integrations : [];
    if (!integrations.some((i) => (i.platformKey || "").toLowerCase() === targetKey)) {
      return NextResponse.json({ error: `No Postiz integration mapped for platform "${draft.platform}". Settings → Publishing → Platform mappings.` }, { status: 400 });
    }
  }

  if (draft.status !== "approved") {
    await updateDraft(auth.userId, draftId, { status: "approved" });
  }
  if (draft.publishStatus === "publishing" || draft.publishStatus === "scheduling") {
    return NextResponse.json({ error: "Publish/schedule already in progress for this draft" }, { status: 429 });
  }

  const jobId = await createPendingJob(auth.userId, { type: "publish", draftId, mode: safeMode, scheduledAt: scheduledIso });
  return NextResponse.json({ jobId, status: "queued", mode: safeMode, scheduledAt: scheduledIso });
}
