import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { setOnboardingComplete } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await setOnboardingComplete(auth.userId);
  return NextResponse.json({ ok: true });
}
