import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { adminDb } from "@/lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const ref = adminDb.collection("bootstrap_proposals").doc(auth.userId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true });
  }
  if (snap.data().status === "pending") {
    await ref.set(
      { status: "dismissed", reviewedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  return NextResponse.json({ ok: true });
}
