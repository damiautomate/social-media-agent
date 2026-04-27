import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { adminAuth } from "@/lib/firebase-admin.js";
import { bootstrapNewUser, getUser } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const record = await adminAuth.getUser(auth.userId);
  await bootstrapNewUser(auth.userId, {
    email: record.email,
    displayName: record.displayName || "",
    photoURL: record.photoURL || null,
  });

  const user = await getUser(auth.userId);
  return NextResponse.json({
    userId: auth.userId,
    hasCompletedOnboarding: !!user?.hasCompletedOnboarding,
    hasApiKey: !!user?.anthropicApiKey,
  });
}
