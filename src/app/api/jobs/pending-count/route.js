import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { adminDb } from "@/lib/firebase-admin.js";

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const snap = await adminDb
    .collection("pending_jobs")
    .where("userId", "==", auth.userId)
    .where("status", "in", ["queued", "processing"])
    .count()
    .get();
  return NextResponse.json({ count: snap.data().count });
}
