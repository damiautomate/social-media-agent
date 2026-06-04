import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { updatePostMetricsManual } from "@/lib/content-bank.js";

// Manual metrics entry — fallback for platforms whose API won't give us numbers.
export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await updatePostMetricsManual(auth.userId, body.id, body);
  return NextResponse.json({ ok: true });
}
