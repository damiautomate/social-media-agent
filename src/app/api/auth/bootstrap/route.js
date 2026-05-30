import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { bootstrapNewUser, getUser } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body = {};
  try { body = await request.json(); } catch {}

  await bootstrapNewUser(auth.userId, {
    email: auth.email,
    displayName: body.displayName || "",
    photoURL: body.photoURL || null,
  });

  const user = await getUser(auth.userId);
  return NextResponse.json({
    ok: true,
    hasCompletedOnboarding: !!user?.hasCompletedOnboarding,
  });
}
