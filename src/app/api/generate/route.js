import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { createPendingJob, getUser, getBrandConfig, createIdea } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { topic, platform, angle, pillar, context, ideaId } = body || {};
  if (!topic || !platform) return NextResponse.json({ error: "topic and platform are required" }, { status: 400 });

  const user = await getUser(auth.userId);
  if (!user?.anthropicApiKey) return NextResponse.json({ error: "Anthropic API key not configured. Add it in Settings." }, { status: 400 });
  const brand = await getBrandConfig(auth.userId);
  if (!brand) return NextResponse.json({ error: "Brand config missing. Complete onboarding first." }, { status: 400 });

  let resolvedIdeaId = ideaId || null;
  if (!resolvedIdeaId) {
    resolvedIdeaId = await createIdea(auth.userId, { topic, angle: angle || null, pillar: pillar || null, source: "manual", status: "in_progress" });
  }
  const jobId = await createPendingJob(auth.userId, {
    type: "draft", ideaId: resolvedIdeaId, platform, topic, angle: angle || null, pillar: pillar || null, context: context || null,
  });
  return NextResponse.json({ jobId, ideaId: resolvedIdeaId });
}
