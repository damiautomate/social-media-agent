import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, getDraft, getBrandConfig, createPendingJob } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { draftId } = body || {};
  if (!draftId) return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  const draft = await getDraft(auth.userId, draftId);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const user = await getUser(auth.userId);
  const missing = [];
  if (!user?.anthropicApiKey) missing.push("Anthropic API key");
  if (!user?.heygenApiKey) missing.push("HeyGen API key");
  const c = user?.cloudinary || {};
  if (!c.cloudName || !c.apiKey || !c.apiSecret) missing.push("Cloudinary credentials");
  if (missing.length) return NextResponse.json({ error: `Missing: ${missing.join(", ")}. Set them in Settings.` }, { status: 400 });

  const cfg = await getBrandConfig(auth.userId);
  const av = cfg?.videoStyle?.avatar;
  if (!av?.avatarId || !av?.voiceId) return NextResponse.json({ error: "No avatar/voice selected. Settings → HeyGen → pick an avatar and voice." }, { status: 400 });
  if (draft.avatarVideoStatus === "generating") return NextResponse.json({ error: "Avatar video generation already in progress for this draft" }, { status: 429 });

  const jobId = await createPendingJob(auth.userId, { type: "avatar_video", draftId });
  return NextResponse.json({ jobId, status: "queued" });
}
