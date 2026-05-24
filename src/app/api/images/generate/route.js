import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { adminDb } from "@/lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { getUser, getDraft } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { draftId } = body || {};
  if (!draftId) {
    return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  }

  const draft = await getDraft(auth.userId, draftId);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  // Pre-flight: make sure all the keys we'll need exist before queueing.
  const user = await getUser(auth.userId);
  const missing = [];
  if (!user?.anthropicApiKey) missing.push("Anthropic API key");
  if (!user?.openaiApiKey) missing.push("OpenAI API key");
  const c = user?.cloudinary || {};
  if (!c.cloudName || !c.apiKey || !c.apiSecret) missing.push("Cloudinary credentials");
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing: ${missing.join(", ")}. Set them in Settings.` },
      { status: 400 },
    );
  }

  // Don't pile up jobs on the same draft.
  if (draft.imagesStatus === "generating") {
    return NextResponse.json(
      { error: "Image generation already in progress for this draft" },
      { status: 429 },
    );
  }

  const ref = await adminDb.collection("pending_jobs").add({
    userId: auth.userId,
    type: "images",
    draftId,
    status: "queued",
    error: null,
    completedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ jobId: ref.id, status: "queued" });
}
