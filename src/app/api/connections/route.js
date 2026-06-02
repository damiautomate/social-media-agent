import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { listSocialConnections, deleteSocialConnection } from "@/lib/content-bank.js";

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const connections = await listSocialConnections(auth.userId);
  return NextResponse.json({ connections });
}

export async function DELETE(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body?.platform) return NextResponse.json({ error: "platform required" }, { status: 400 });
  await deleteSocialConnection(auth.userId, body.platform);
  return NextResponse.json({ ok: true });
}
