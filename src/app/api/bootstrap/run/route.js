import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { adminDb } from "@/lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = await getUser(auth.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.anthropicApiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured. Set one in Settings." },
      { status: 400 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bio = String(body.bio || "").slice(0, 5000);
  const postsBlob = String(body.postsBlob || "").slice(0, 30000);
  const youtubeChannelId = String(body.youtubeChannelId || "").slice(0, 100);
  const userNotes = String(body.userNotes || "").slice(0, 2000);

  if (!bio.trim() && !postsBlob.trim() && !youtubeChannelId.trim()) {
    return NextResponse.json(
      { error: "Provide at least a bio, some posts, or a YouTube channel ID." },
      { status: 400 },
    );
  }

  // Don't queue if one's already in flight
  const existing = await adminDb
    .collection("pending_jobs")
    .where("userId", "==", auth.userId)
    .where("type", "==", "bootstrap")
    .where("status", "in", ["queued", "processing"])
    .limit(1)
    .get();
  if (!existing.empty) {
    return NextResponse.json(
      { error: "A bootstrap analysis is already in progress." },
      { status: 429 },
    );
  }

  const ref = await adminDb.collection("pending_jobs").add({
    userId: auth.userId,
    type: "bootstrap",
    bio,
    postsBlob,
    youtubeChannelId,
    userNotes,
    status: "queued",
    error: null,
    completedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ jobId: ref.id, status: "queued" });
}
