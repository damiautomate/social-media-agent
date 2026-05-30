import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { supabaseAdmin } from "@/lib/supabase-admin.js";
import { getBrandConfig, updateBrandConfig } from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const sections = body.sections || {};
  const ep = body.editedProposal || {};
  if (!sections.identity && !sections.voice && !sections.contentPillars) {
    return NextResponse.json({ error: "No sections selected" }, { status: 400 });
  }

  const { data: proposal } = await supabaseAdmin.from("bootstrap_proposals")
    .select("*").eq("user_id", auth.userId).maybeSingle();
  if (!proposal) return NextResponse.json({ error: "No proposal found" }, { status: 404 });
  if (proposal.status !== "pending") return NextResponse.json({ error: "Proposal already applied or dismissed" }, { status: 409 });

  const existing = (await getBrandConfig(auth.userId)) || {};
  const patch = {};

  if (sections.identity && ep.identity) {
    const current = existing.identity || {};
    patch.identity = {
      name: ep.identity.name?.trim() || current.name || "",
      handle: ep.identity.handle?.trim() || current.handle || "",
      tagline: ep.identity.tagline?.trim() || current.tagline || "",
    };
  }
  if (sections.voice && ep.voice) {
    patch.voice = {
      tone: Array.isArray(ep.voice.tone) ? ep.voice.tone : [],
      signaturePhrases: Array.isArray(ep.voice.signaturePhrases) ? ep.voice.signaturePhrases : [],
      avoidPhrases: Array.isArray(ep.voice.avoidPhrases) ? ep.voice.avoidPhrases : [],
      samplePosts: Array.isArray(ep.voice.samplePosts) ? ep.voice.samplePosts : [],
    };
  }
  if (sections.contentPillars && Array.isArray(ep.contentPillars)) {
    patch.contentPillars = ep.contentPillars.map((p) => ({
      id: String(p.id || "").toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      name: String(p.name || ""),
      description: String(p.description || ""),
      weight: Math.max(0, Math.round(Number(p.weight) || 0)),
      angles: Array.isArray(p.angles) ? p.angles : [],
    }));
  }

  await updateBrandConfig(auth.userId, patch);
  await supabaseAdmin.from("bootstrap_proposals")
    .update({ status: "applied", updated_at: new Date().toISOString() })
    .eq("user_id", auth.userId);

  return NextResponse.json({ ok: true, applied: sections });
}
