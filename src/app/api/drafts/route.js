import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { listDrafts, updateDraft } from "@/lib/content-bank.js";

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const platform = url.searchParams.get("platform") || undefined;

  const drafts = await listDrafts(auth.userId, { status, platform });
  return NextResponse.json({ drafts });
}

export async function PATCH(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { draftId, ...patch } = body || {};
  if (!draftId) {
    return NextResponse.json({ error: "draftId required" }, { status: 400 });
  }

  const allowed = [
    "status",
    "postText",
    "hashtags",
    "firstComment",
    "contentNotes",
    "scheduledFor",
  ];
  const filtered = {};
  for (const key of allowed) {
    if (key in patch) filtered[key] = patch[key];
  }

  try {
    await updateDraft(auth.userId, draftId, filtered);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Update failed" },
      { status: err.status || 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
