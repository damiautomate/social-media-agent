import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { listDrafts, updateDraft } from "@/lib/content-bank.js";

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const platform = url.searchParams.get("platform") || undefined;
  const drafts = await listDrafts(auth.userId, { status, platform });
  return NextResponse.json({ drafts });
}

export async function PATCH(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { draftId, ...partial } = body || {};
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });
  try {
    await updateDraft(auth.userId, draftId, partial);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
