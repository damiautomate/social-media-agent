import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { adminDb } from "@/lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

// Body shape:
// {
//   sections: { identity: bool, voice: bool, contentPillars: bool },
//   editedProposal: { identity, voice, contentPillars }   // user-edited version
// }
// Only the sections marked true are merged. Identity is shallow-merged (so
// existing fields aren't wiped if a field is blank); voice and contentPillars
// are replaced wholesale because they're coherent units.

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

  const sections = body.sections || {};
  const ep = body.editedProposal || {};
  if (!sections.identity && !sections.voice && !sections.contentPillars) {
    return NextResponse.json({ error: "No sections selected" }, { status: 400 });
  }

  const proposalRef = adminDb.collection("bootstrap_proposals").doc(auth.userId);
  const proposalSnap = await proposalRef.get();
  if (!proposalSnap.exists) {
    return NextResponse.json({ error: "No proposal found" }, { status: 404 });
  }
  if (proposalSnap.data().status !== "pending") {
    return NextResponse.json(
      { error: "Proposal already applied or dismissed" },
      { status: 409 },
    );
  }

  const brandRef = adminDb
    .collection("users").doc(auth.userId)
    .collection("brandConfig").doc("main");
  const brandSnap = await brandRef.get();
  if (!brandSnap.exists) {
    return NextResponse.json({ error: "Brand config not found" }, { status: 404 });
  }
  const existing = brandSnap.data();

  const patch = { updatedAt: FieldValue.serverTimestamp() };

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

  await brandRef.set(patch, { merge: true });
  await proposalRef.set(
    {
      status: "applied",
      reviewedAt: FieldValue.serverTimestamp(),
      appliedSections: sections,
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, applied: sections });
}
