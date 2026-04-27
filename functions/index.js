const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { generateDraft } = require("./lib/content-engine.js");
const {
  pickPillar,
  buildSystemPrompt,
  buildUserPrompt,
} = require("./lib/prompt-builder.js");

if (!getApps().length) initializeApp();

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();

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

    try {
      await jobRef.update({ status: "processing" });

      const userSnap = await db.collection("users").doc(job.userId).get();
      if (!userSnap.exists) throw new Error("User not found");
      const apiKey = userSnap.data().anthropicApiKey;
      if (!apiKey) throw new Error("API key not configured");

      const cfgSnap = await db
        .collection("users")
        .doc(job.userId)
        .collection("brandConfig")
        .doc("main")
        .get();
      if (!cfgSnap.exists) throw new Error("Brand config not found");
      const brandConfig = cfgSnap.data();

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

      await jobRef.update({
        status: "completed",
        resultDraftId: draftRef.id,
        completedAt: FieldValue.serverTimestamp(),
      });

      if (job.ideaId) {
        await db
          .collection("ideas")
          .doc(job.ideaId)
          .update({
            status: "used",
            usedAt: FieldValue.serverTimestamp(),
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error("processPendingJob failed", err);
      await jobRef.update({
        status: "failed",
        error: String(err?.message || err),
        completedAt: FieldValue.serverTimestamp(),
      });
    }
  },
);
