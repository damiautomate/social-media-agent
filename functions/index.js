const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { generateDraft } = require("./lib/content-engine.js");
const {
  pickPillar,
  buildSystemPrompt,
  buildUserPrompt,
} = require("./lib/prompt-builder.js");
const { runResearch } = require("./lib/research/pipeline.js");

if (!getApps().length) initializeApp();

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();

// ----- Loaders shared by draft + research jobs ---------------------------

async function loadUserApiKey(userId) {
  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) throw new Error("User not found");
  const apiKey = userSnap.data().anthropicApiKey;
  if (!apiKey) throw new Error("API key not configured");
  return apiKey;
}

async function loadBrandConfig(userId) {
  const cfgSnap = await db
    .collection("users").doc(userId)
    .collection("brandConfig").doc("main")
    .get();
  if (!cfgSnap.exists) throw new Error("Brand config not found");
  return cfgSnap.data();
}

// ----- Draft job (existing Phase 1 behavior, unchanged logic) ------------

async function handleDraftJob(job, jobId) {
  const apiKey = await loadUserApiKey(job.userId);
  const brandConfig = await loadBrandConfig(job.userId);

  const pillar = pickPillar(brandConfig, job.pillar);
  const systemPrompt = buildSystemPrompt(brandConfig, job.platform, pillar);
  const userPrompt = buildUserPrompt({
    topic: job.topic,
    angle: job.angle,
    context: job.context,
  });

  const { draft, tokensUsed } = await generateDraft({
    apiKey,
    systemPrompt,
    userPrompt,
  });

  const draftRef = await db.collection("drafts").add({
    userId: job.userId,
    ideaId: job.ideaId || null,
    jobId,
    platform: job.platform,
    formatType: draft.formatType || "textPost",
    pillar: pillar?.id || job.pillar || "",
    postText: draft.postText || "",
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    hookPreview: draft.hookPreview || "",
    firstComment: draft.firstComment || null,
    contentNotes: draft.contentNotes || "",
    carouselSlides: Array.isArray(draft.carouselSlides) ? draft.carouselSlides : [],
    videoScript: draft.videoScript || null,
    altText: draft.altText || null,
    engagementHooks: Array.isArray(draft.engagementHooks) ? draft.engagementHooks : [],
    estimatedReadTime: Number(draft.estimatedReadTime) || 0,
    status: "pending",
    scheduledFor: null,
    publishedAt: null,
    publishId: null,
    tokensUsed,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (job.ideaId) {
    await db.collection("ideas").doc(job.ideaId).update({
      status: "used",
      usedAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
  }

  return { resultDraftId: draftRef.id };
}

// ----- Research job (new in Phase 2) ------------------------------------

async function handleResearchJob(job, jobId) {
  const apiKey = await loadUserApiKey(job.userId);
  const brandConfig = await loadBrandConfig(job.userId);

  const summary = await runResearch({
    db,
    userId: job.userId,
    jobId,
    brandConfig,
    apiKey,
  });

  return {
    researchSummary: {
      ideasCreated: summary.ideasCreated,
      signalsCount: summary.signalsCount,
      freshCount: summary.freshCount,
      tokensUsed: summary.tokensUsed,
      errorCount: (summary.errors || []).length,
      errors: summary.errors,
      note: summary.note || null,
    },
  };
}

// ----- Unified pending-job processor ------------------------------------

exports.processPendingJob = onDocumentCreated(
  {
    document: "pending_jobs/{jobId}",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    const jobId = event.params.jobId;
    const snap = event.data;
    if (!snap) return;
    const job = snap.data();
    const jobRef = db.collection("pending_jobs").doc(jobId);

    if (!job?.userId) {
      await jobRef.update({
        status: "failed",
        error: "Job missing userId",
        completedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const jobType = job.type || "draft";

    try {
      await jobRef.update({ status: "processing" });

      let result;
      if (jobType === "draft") {
        result = await handleDraftJob(job, jobId);
      } else if (jobType === "research") {
        result = await handleResearchJob(job, jobId);
      } else {
        throw new Error(`Unknown job type: ${jobType}`);
      }

      await jobRef.update({
        status: "completed",
        ...(result || {}),
        completedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error(`processPendingJob (${jobType}) failed`, err);
      await jobRef.update({
        status: "failed",
        error: String(err?.message || err),
        completedAt: FieldValue.serverTimestamp(),
      });
    }
  },
);

// ----- Scheduled weekly research run ------------------------------------
// Runs every Monday at 06:00 UTC. For each user with research enabled
// (or unset, defaulting to enabled), creates a pending_jobs doc of
// type "research". The processor above picks it up and runs in parallel.

exports.runWeeklyResearch = onSchedule(
  {
    schedule: "0 6 * * 1", // Mon 06:00
    timeZone: "Etc/UTC",
    region: "us-central1",
    timeoutSeconds: 300,
  },
  async () => {
    const usersSnap = await db.collection("users").get();
    let scheduled = 0;
    let skipped = 0;

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data();
      if (!u.hasCompletedOnboarding || !u.anthropicApiKey) {
        skipped++;
        continue;
      }
      const cfgSnap = await db
        .collection("users").doc(userDoc.id)
        .collection("brandConfig").doc("main")
        .get();
      if (!cfgSnap.exists) { skipped++; continue; }

      const research = cfgSnap.data().research;
      // Opt-out, not opt-in: missing research config means use defaults (enabled).
      if (research && research.enabled === false) { skipped++; continue; }

      // Don't pile up jobs: skip if there's already a queued/processing research job for this user.
      const existing = await db.collection("pending_jobs")
        .where("userId", "==", userDoc.id)
        .where("type", "==", "research")
        .where("status", "in", ["queued", "processing"])
        .limit(1)
        .get();
      if (!existing.empty) { skipped++; continue; }

      await db.collection("pending_jobs").add({
        userId: userDoc.id,
        type: "research",
        status: "queued",
        error: null,
        completedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        scheduledRun: true,
      });
      scheduled++;
    }

    console.log(`runWeeklyResearch: scheduled=${scheduled} skipped=${skipped}`);
  },
);
