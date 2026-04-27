import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { createIdea, listIdeas } from "@/lib/content-bank.js";

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const ideas = await listIdeas(auth.userId, { status });
  return NextResponse.json({ ideas });
}

export async function POST(request) {
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

  if (!body?.topic) {
    return NextResponse.json({ error: "topic required" }, { status: 400 });
  }

  const ideaId = await createIdea(auth.userId, body);
  return NextResponse.json({ ideaId });
}
