import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { supabaseAdmin } from "@/lib/supabase-admin.js";
import { getUser } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = await getUser(auth.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.anthropicApiKey) return NextResponse.json({ error: "Anthropic API key not configured. Set one in Settings." }, { status: 400 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const bio = String(body.bio || "").slice(0, 5000);
  const postsBlob = String(body.postsBlob || "").slice(0, 30000);
  const youtubeChannelId = String(body.youtubeChannelId || "").slice(0, 100);
  const userNotes = String(body.userNotes || "").slice(0, 2000);
  if (!bio.trim() && !postsBlob.trim() && !youtubeChannelId.trim()) {
    return NextResponse.json({ error: "Provide at least a bio, some posts, or a YouTube channel ID." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.from("pending_jobs")
    .select("id").eq("user_id", auth.userId).eq("type", "bootstrap")
    .in("status", ["queued", "processing"]).limit(1);
  if ((existing || []).length) return NextResponse.json({ error: "A bootstrap analysis is already in progress." }, { status: 429 });

  // Pack the bootstrap inputs into context (JSON string) — keeps schema lean.
  const { data } = await supabaseAdmin.from("pending_jobs").insert({
    user_id: auth.userId,
    type: "bootstrap",
    context: JSON.stringify({ bio, postsBlob, youtubeChannelId, userNotes }),
    status: "queued",
  }).select("id").single();

  return NextResponse.json({ jobId: data.id, status: "queued" });
}
