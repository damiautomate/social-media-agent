// Orchestrates a single research run for one user:
//   1. Fetch raw signals from all enabled sources (parallel, with timeouts)
//   2. Dedupe against research_signals from the last N days
//   3. Store fresh signals in research_signals (audit trail / future Phase 5)
//   4. Send fresh signals to Claude for scoring → ranked ideas
//   5. Write ideas to the `ideas/` collection

const { FieldValue } = require("firebase-admin/firestore");
const { fetchAllSources } = require("./fetchers/index.js");
const { signalDocId } = require("./normalize.js");
const { mergeResearchDefaults } = require("./defaults.js");
const { scoreSignalsIntoIdeas } = require("./scorer.js");

// Chunk an array into sub-arrays of size n.
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Returns only signals whose (userId, urlHash) doc does NOT exist or was last
// fetched more than `dedupeWindowDays` ago. Writes/refreshes the doc for survivors.
async function dedupeAndStoreSignals(db, userId, rawSignals, dedupeWindowDays) {
  if (!rawSignals.length) return [];
  const cutoffMs = Date.now() - dedupeWindowDays * 24 * 60 * 60 * 1000;

  // Build refs with stable doc ids
  const candidates = rawSignals
    .filter((s) => s && s.url && s.title)
    .map((s) => ({ s, ref: db.collection("research_signals").doc(signalDocId(userId, s.url)) }));

  // Firestore getAll has a soft limit; chunk to be safe.
  const fresh = [];
  for (const group of chunk(candidates, 100)) {
    const refs = group.map((g) => g.ref);
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, i) => {
      const { s, ref } = group[i];
      if (snap.exists) {
        const data = snap.data();
        const lastFetchedMs = data.fetchedAt?.toMillis?.() ?? 0;
        if (lastFetchedMs >= cutoffMs) {
          return; // seen recently — skip
        }
      }
      fresh.push({ s, ref });
    });
  }

  // Write/refresh fresh signals in batches of 400 (Firestore batch limit is 500).
  for (const group of chunk(fresh, 400)) {
    const batch = db.batch();
    for (const { s, ref } of group) {
      batch.set(
        ref,
        {
          userId,
          sourceType: s.sourceType,
          sourceId: s.sourceId,
          sourceLabel: s.sourceLabel,
          url: s.url,
          title: s.title,
          snippet: s.snippet || "",
          author: s.author || null,
          score: s.score ?? null,
          publishedAt: s.publishedAt || null,
          meta: s.meta || {},
          fetchedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
  }

  return fresh.map((f) => f.s);
}

async function writeIdeasToFirestore(db, userId, ideas, jobId) {
  if (!ideas.length) return [];
  const ids = [];
  // Batched writes
  for (const group of chunk(ideas, 400)) {
    const batch = db.batch();
    const refs = group.map(() => db.collection("ideas").doc());
    group.forEach((idea, i) => {
      const ref = refs[i];
      batch.set(ref, {
        userId,
        topic: idea.topic,
        angle: idea.angle || null,
        pillar: idea.pillarId || null,
        source: "research",
        sourceJobId: jobId || null,
        urgency: idea.urgency || "normal",
        relevanceScore: idea.relevanceScore,
        scores: idea.scores,
        sourceUrls: idea.sourceUrls || [],
        sourceLabels: idea.sourceLabels || [],
        reasoning: idea.reasoning || null,
        status: "new",
        createdAt: FieldValue.serverTimestamp(),
        scoredAt: FieldValue.serverTimestamp(),
        usedAt: null,
      });
      ids.push(ref.id);
    });
    await batch.commit();
  }
  return ids;
}

// Backfills the user's brandConfig.research field if it's missing or partial.
// Idempotent.
async function ensureResearchConfigOnBrand(db, userId, brandConfig) {
  const merged = mergeResearchDefaults(brandConfig.research);
  if (!brandConfig.research) {
    await db
      .collection("users").doc(userId)
      .collection("brandConfig").doc("main")
      .set({ research: merged, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return merged;
}

// Main entry point — called from the Cloud Function for type === "research" jobs.
async function runResearch({ db, userId, jobId, brandConfig, apiKey }) {
  const research = await ensureResearchConfigOnBrand(db, userId, brandConfig);

  const enabledSources = (research.sources || []).filter((s) => s.enabled !== false);
  if (!enabledSources.length) {
    return {
      ideasCreated: 0,
      signalsCount: 0,
      freshCount: 0,
      tokensUsed: 0,
      errors: [],
      note: "No enabled research sources",
    };
  }

  // 1 + 2: fetch
  const { signals, errors: fetchErrors } = await fetchAllSources(enabledSources);

  // 3: dedupe + store
  const fresh = await dedupeAndStoreSignals(db, userId, signals, research.dedupeWindowDays);

  if (fresh.length === 0) {
    return {
      ideasCreated: 0,
      signalsCount: signals.length,
      freshCount: 0,
      tokensUsed: 0,
      errors: fetchErrors,
      note: "All signals were duplicates of recent fetches",
    };
  }

  // 4: score
  const { ideas, tokensUsed } = await scoreSignalsIntoIdeas({
    apiKey,
    brandConfig: { ...brandConfig, research },
    signals: fresh,
    targetCount: research.targetIdeasPerRun || 12,
    weights: research.scoringWeights,
  });

  // 5: write ideas
  const ideaIds = await writeIdeasToFirestore(db, userId, ideas, jobId);

  return {
    ideasCreated: ideaIds.length,
    ideaIds,
    signalsCount: signals.length,
    freshCount: fresh.length,
    tokensUsed,
    errors: fetchErrors,
  };
}

module.exports = { runResearch };
