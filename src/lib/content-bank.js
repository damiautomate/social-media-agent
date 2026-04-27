import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin.js";
import { DEFAULT_BRAND_TEMPLATE } from "../config/default-brand-template.js";

const BRAND_CONFIG_DOC = "main";

function userRef(userId) {
  return adminDb.collection("users").doc(userId);
}

function brandConfigRef(userId) {
  return userRef(userId).collection("brandConfig").doc(BRAND_CONFIG_DOC);
}

export async function bootstrapNewUser(userId, { email, displayName, photoURL }) {
  const userSnap = await userRef(userId).get();
  if (!userSnap.exists) {
    await userRef(userId).set({
      email: email || null,
      displayName: displayName || "",
      photoURL: photoURL || null,
      anthropicApiKey: null,
      hasCompletedOnboarding: false,
      createdAt: FieldValue.serverTimestamp(),
      lastActiveAt: FieldValue.serverTimestamp(),
    });
  } else {
    await userRef(userId).update({
      lastActiveAt: FieldValue.serverTimestamp(),
    });
  }

  const brandSnap = await brandConfigRef(userId).get();
  if (!brandSnap.exists) {
    await brandConfigRef(userId).set({
      ...DEFAULT_BRAND_TEMPLATE,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export async function getUser(userId) {
  const snap = await userRef(userId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function setApiKey(userId, apiKey) {
  await userRef(userId).update({
    anthropicApiKey: apiKey,
    lastActiveAt: FieldValue.serverTimestamp(),
  });
}

export async function setOnboardingComplete(userId) {
  await userRef(userId).update({
    hasCompletedOnboarding: true,
    lastActiveAt: FieldValue.serverTimestamp(),
  });
}

export async function getBrandConfig(userId) {
  const snap = await brandConfigRef(userId).get();
  return snap.exists ? snap.data() : null;
}

export async function updateBrandConfig(userId, partial) {
  await brandConfigRef(userId).set(
    { ...partial, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function listIdeas(userId, { status, limit = 50 } = {}) {
  let q = adminDb.collection("ideas").where("userId", "==", userId);
  if (status) q = q.where("status", "==", status);
  q = q.orderBy("createdAt", "desc").limit(limit);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createIdea(userId, idea) {
  const ref = await adminDb.collection("ideas").add({
    userId,
    topic: idea.topic,
    angle: idea.angle || null,
    pillar: idea.pillar || null,
    source: idea.source || "manual",
    urgency: idea.urgency || "normal",
    relevanceScore: idea.relevanceScore || 0,
    status: idea.status || "new",
    createdAt: FieldValue.serverTimestamp(),
    usedAt: null,
  });
  return ref.id;
}

export async function createPendingJob(userId, job) {
  const ref = await adminDb.collection("pending_jobs").add({
    userId,
    type: job.type || "draft",
    ideaId: job.ideaId || null,
    platform: job.platform,
    topic: job.topic,
    angle: job.angle || null,
    pillar: job.pillar || null,
    context: job.context || null,
    status: "queued",
    error: null,
    resultDraftId: null,
    createdAt: FieldValue.serverTimestamp(),
    completedAt: null,
  });
  return ref.id;
}

export async function listDrafts(userId, { status, platform, limit = 100 } = {}) {
  let q = adminDb.collection("drafts").where("userId", "==", userId);
  if (status) q = q.where("status", "==", status);
  if (platform) q = q.where("platform", "==", platform);
  q = q.orderBy("createdAt", "desc").limit(limit);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getDraft(userId, draftId) {
  const snap = await adminDb.collection("drafts").doc(draftId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.userId !== userId) return null;
  return { id: snap.id, ...data };
}

export async function updateDraft(userId, draftId, partial) {
  const draft = await getDraft(userId, draftId);
  if (!draft) {
    const err = new Error("Draft not found");
    err.status = 404;
    throw err;
  }
  await adminDb
    .collection("drafts")
    .doc(draftId)
    .update({
      ...partial,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function getStats(userId) {
  const drafts = adminDb.collection("drafts").where("userId", "==", userId);
  const ideas = adminDb.collection("ideas").where("userId", "==", userId);

  const [pending, approved, published, openIdeas] = await Promise.all([
    drafts.where("status", "==", "pending").count().get(),
    drafts.where("status", "==", "approved").count().get(),
    drafts.where("status", "==", "published").count().get(),
    ideas.where("status", "==", "new").count().get(),
  ]);

  return {
    pending: pending.data().count,
    approved: approved.data().count,
    published: published.data().count,
    ideas: openIdeas.data().count,
  };
}
