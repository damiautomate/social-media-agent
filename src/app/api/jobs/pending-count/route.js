import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { adminDb } from "@/lib/firebase-admin.js";

// Counts only draft-generation jobs in flight, so the dashboard
// "Generating N..." chip doesn't tick up when the weekly research cron fires.
// Research progress is shown on the /ideas page via its own subscription.
//
// Historical jobs without a `type` field were always drafts; those are
// already completed by now and won't match status in [queued, processing].

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const snap = await adminDb
    .collection("pending_jobs")
    .where("userId", "==", auth.userId)
    .where("type", "==", "draft")
    .where("status", "in", ["queued", "processing"])
    .count()
    .get();
  return NextResponse.json({ count: snap.data().count });
}
