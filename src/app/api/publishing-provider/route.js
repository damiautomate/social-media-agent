import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { setPublishingProvider } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const provider = body?.provider;
  if (!["direct", "postiz"].includes(provider)) return NextResponse.json({ error: "provider must be 'direct' or 'postiz'" }, { status: 400 });
  await setPublishingProvider(auth.userId, provider);
  return NextResponse.json({ ok: true, provider });
}
