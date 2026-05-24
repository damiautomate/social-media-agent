"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase-client.js";

const PLATFORM_COLORS = {
  linkedin: "#0a66c2",
  instagram: "#e1306c",
  tiktok: "#000000",
  facebook: "#1877f2",
};

const STATUS_COLORS = {
  pending: "#7c3aed",
  approved: "#059669",
  rejected: "#dc2626",
  published: "#0891b2",
};

const styles = {
  page: { minHeight: "100vh" },
  header: {
    borderBottom: "1px solid #27272a",
    padding: "14px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { fontSize: 16, fontWeight: 600 },
  nav: { display: "flex", gap: 8, alignItems: "center" },
  navLink: {
    color: "#a1a1aa",
    textDecoration: "none",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 14,
    cursor: "pointer",
    background: "transparent",
    border: "none",
  },
  main: { padding: 24, maxWidth: 1200, margin: "0 auto" },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 18,
  },
  stat: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 10,
    padding: 14,
  },
  statLabel: { color: "#a1a1aa", fontSize: 12 },
  statValue: { fontSize: 22, fontWeight: 600, marginTop: 4 },
  toolbar: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap",
  },
  select: {
    padding: "8px 10px",
    backgroundColor: "#18181b",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 13,
  },
  primary: {
    padding: "8px 14px",
    backgroundColor: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  panel: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 10,
    padding: 16,
    marginBottom: 18,
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    backgroundColor: "#09090b",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 13,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "8px 10px",
    backgroundColor: "#09090b",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 13,
    boxSizing: "border-box",
    minHeight: 80,
    fontFamily: "inherit",
  },
  card: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badges: { display: "flex", gap: 6, flexWrap: "wrap" },
  badge: {
    padding: "2px 8px",
    borderRadius: 999,
    color: "white",
    fontSize: 11,
    fontWeight: 600,
  },
  pillTag: {
    padding: "2px 8px",
    borderRadius: 999,
    backgroundColor: "#27272a",
    color: "#a1a1aa",
    fontSize: 11,
  },
  postText: { whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#e4e4e7" },
  meta: { color: "#71717a", fontSize: 12, marginTop: 8 },
  actions: { display: "flex", gap: 8, marginTop: 12 },
  btnApprove: {
    padding: "6px 12px",
    backgroundColor: "#059669",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  },
  btnReject: {
    padding: "6px 12px",
    backgroundColor: "#27272a",
    color: "#fca5a5",
    border: "1px solid #3f3f46",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  },
  btnImages: {
    padding: "6px 12px",
    backgroundColor: "#312e81",
    color: "#c7d2fe",
    border: "1px solid #4338ca",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  },
  imagesRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 8,
    marginTop: 12,
  },
  imageThumb: {
    width: "100%",
    aspectRatio: "1 / 1",
    objectFit: "cover",
    borderRadius: 8,
    border: "1px solid #27272a",
    backgroundColor: "#09090b",
  },
  imagesPending: {
    color: "#a78bfa",
    fontSize: 12,
    marginTop: 10,
    padding: "8px 12px",
    backgroundColor: "#1e1b4b",
    borderRadius: 6,
    border: "1px solid #4c1d95",
  },
  imagesError: {
    color: "#fca5a5",
    fontSize: 12,
    marginTop: 10,
    padding: "8px 12px",
    backgroundColor: "#450a0a",
    borderRadius: 6,
    border: "1px solid #7f1d1d",
  },
  btnAvatarVideo: {
    padding: "6px 12px",
    backgroundColor: "#0c4a6e",
    color: "#bae6fd",
    border: "1px solid #075985",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  },
  btnBroll: {
    padding: "6px 12px",
    backgroundColor: "#3f1d61",
    color: "#e9d5ff",
    border: "1px solid #6d28d9",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  },
  brollGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginTop: 12,
  },
  brollClipCard: {
    backgroundColor: "#09090b",
    borderRadius: 8,
    border: "1px solid #27272a",
    overflow: "hidden",
  },
  brollClipVideo: {
    width: "100%",
    display: "block",
    backgroundColor: "#000",
  },
  brollClipMeta: {
    padding: "6px 10px",
    color: "#a1a1aa",
    fontSize: 11,
    lineHeight: 1.4,
  },
  videoBox: {
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  videoPlayer: {
    maxWidth: 280,
    width: "100%",
    borderRadius: 10,
    border: "1px solid #27272a",
    backgroundColor: "#09090b",
  },
  videoMeta: {
    color: "#71717a",
    fontSize: 11,
  },
  empty: {
    textAlign: "center",
    padding: 40,
    color: "#71717a",
    border: "1px dashed #27272a",
    borderRadius: 10,
  },
  pendingChip: {
    backgroundColor: "#3b1d63",
    color: "#c4b5fd",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    marginLeft: 8,
  },
};

const PLATFORMS = ["linkedin", "instagram", "tiktok", "facebook"];

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [drafts, setDrafts] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, published: 0, ideas: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [showGen, setShowGen] = useState(true);
  const [pendingJobs, setPendingJobs] = useState(0);

  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [pillar, setPillar] = useState("");
  const [pillarOptions, setPillarOptions] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      const token = await u.getIdToken();
      const meRes = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) {
        router.replace("/login");
        return;
      }
      const me = await meRes.json();
      if (!me.hasCompletedOnboarding) {
        router.replace("/onboarding");
        return;
      }
      setUser(u);
      setAuthReady(true);

      const cfgSnap = await getDoc(doc(db, "users", u.uid, "brandConfig", "main"));
      if (cfgSnap.exists()) {
        const cfg = cfgSnap.data();
        setPillarOptions(cfg.contentPillars || []);
      }
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "drafts"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setDrafts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadStats() {
      const token = await user.getIdToken();
      const res = await fetch("/api/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || cancelled) return;
      setStats(await res.json());
    }
    loadStats();
    const id = setInterval(loadStats, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, drafts.length]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function poll() {
      const token = await user.getIdToken();
      const res = await fetch("/api/jobs/pending-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setPendingJobs(data.count || 0);
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  const visible = useMemo(() => {
    return drafts.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (platformFilter !== "all" && d.platform !== platformFilter) return false;
      return true;
    });
  }, [drafts, statusFilter, platformFilter]);

  async function authedFetch(path, options = {}) {
    const token = await user.getIdToken();
    return fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async function generate() {
    setGenError("");
    if (!topic.trim()) {
      setGenError("Topic required");
      return;
    }
    setGenerating(true);
    const res = await authedFetch("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        topic,
        angle: angle || null,
        platform,
        pillar: pillar || null,
      }),
    });
    setGenerating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setGenError(data.error || "Generation failed");
      return;
    }
    setTopic("");
    setAngle("");
  }

  async function setDraftStatus(draftId, status) {
    await authedFetch("/api/drafts", {
      method: "PATCH",
      body: JSON.stringify({ draftId, status }),
    });
  }

  async function generateImages(draftId) {
    const res = await authedFetch("/api/images/generate", {
      method: "POST",
      body: JSON.stringify({ draftId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to start image generation");
    }
  }

  async function generateAvatarVideo(draftId) {
    const res = await authedFetch("/api/avatar-video/generate", {
      method: "POST",
      body: JSON.stringify({ draftId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to start avatar video generation");
    }
  }

  async function generateBroll(draftId, mode) {
    // mode: "single" | "storyboard". Storyboard count comes from brandConfig.
    const res = await authedFetch("/api/broll/generate", {
      method: "POST",
      body: JSON.stringify({ draftId, mode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to start B-roll generation");
    }
  }

  async function logout() {
    await signOut(auth);
    router.replace("/login");
  }

  if (!authReady) {
    return (
      <main style={styles.page}>
        <div style={{ padding: 40, color: "#71717a" }}>Loading…</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>
          Social Media Agent
          {pendingJobs > 0 ? (
            <span style={styles.pendingChip}>
              Generating {pendingJobs}…
            </span>
          ) : null}
        </div>
        <nav style={styles.nav}>
          <button style={styles.navLink} onClick={() => router.push("/")}>Dashboard</button>
          <button style={styles.navLink} onClick={() => router.push("/ideas")}>Ideas</button>
          <button style={styles.navLink} onClick={() => router.push("/bootstrap")}>Bootstrap</button>
          <button style={styles.navLink} onClick={() => router.push("/settings")}>Settings</button>
          <button style={styles.navLink} onClick={logout}>Sign out</button>
        </nav>
      </header>

      <div style={styles.main}>
        <div className="m-stack-2" style={styles.statsRow}>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Pending</div>
            <div style={styles.statValue}>{stats.pending}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Approved</div>
            <div style={styles.statValue}>{stats.approved}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Published</div>
            <div style={styles.statValue}>{stats.published}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Ideas</div>
            <div style={styles.statValue}>{stats.ideas}</div>
          </div>
        </div>

        <div style={styles.toolbar}>
          <select
            style={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="published">Published</option>
          </select>
          <select
            style={styles.select}
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
          >
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button style={styles.primary} onClick={() => setShowGen(!showGen)}>
            {showGen ? "Hide" : "+ Generate New"}
          </button>
        </div>

        {showGen ? (
          <div style={styles.panel}>
            <div className="m-stack" style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", gap: 8 }}>
              <input
                placeholder="Topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={styles.input}
              />
              <input
                placeholder="Angle (optional)"
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                style={styles.input}
              />
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                style={styles.select}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                value={pillar}
                onChange={(e) => setPillar(e.target.value)}
                style={styles.select}
              >
                <option value="">Pillar (auto)</option>
                {pillarOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button style={styles.primary} disabled={generating} onClick={generate}>
                {generating ? "Queueing..." : "Generate"}
              </button>
            </div>
            {genError ? (
              <div style={{ color: "#fca5a5", fontSize: 13, marginTop: 8 }}>{genError}</div>
            ) : null}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <div style={styles.empty}>
            No drafts yet. Type a topic above and click Generate.
          </div>
        ) : (
          visible.map((d) => (
            <div key={d.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.badges}>
                  <span
                    style={{
                      ...styles.badge,
                      backgroundColor: PLATFORM_COLORS[d.platform] || "#3f3f46",
                    }}
                  >
                    {d.platform}
                  </span>
                  <span
                    style={{
                      ...styles.badge,
                      backgroundColor: STATUS_COLORS[d.status] || "#3f3f46",
                    }}
                  >
                    {d.status}
                  </span>
                  {d.formatType ? <span style={styles.pillTag}>{d.formatType}</span> : null}
                  {d.pillar ? <span style={styles.pillTag}>{d.pillar}</span> : null}
                </div>
              </div>
              <div style={styles.postText}>{d.postText}</div>
              {d.hashtags?.length ? (
                <div style={styles.meta}>
                  {d.hashtags.map((h) => `#${h}`).join(" ")}
                </div>
              ) : null}
              {d.firstComment ? (
                <div style={styles.meta}>
                  <strong>First comment:</strong> {d.firstComment}
                </div>
              ) : null}
              {d.contentNotes ? (
                <div style={styles.meta}>{d.contentNotes}</div>
              ) : null}

              {d.imagesStatus === "generating" ? (
                <div style={styles.imagesPending}>
                  Generating images… (usually 20-60 seconds)
                </div>
              ) : null}

              {d.imagesStatus === "failed" || d.imagesStatus === "partial" ? (
                <div style={styles.imagesError}>
                  {d.imagesStatus === "partial" ? "Some images failed: " : "Image generation failed: "}
                  {d.imagesError || "unknown error"}
                </div>
              ) : null}

              {Array.isArray(d.images) && d.images.length > 0 ? (
                <div className="m-img-grid" style={styles.imagesRow}>
                  {d.images.map((img, i) => (
                    <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" title={img.prompt || ""}>
                      <img src={img.url} alt={img.slot || `image-${i}`} style={styles.imageThumb} />
                    </a>
                  ))}
                </div>
              ) : null}

              {d.avatarVideoStatus === "generating" ? (
                <div style={styles.imagesPending}>
                  Generating avatar video… typically 1-3 minutes (scriptify → HeyGen render → Cloudinary mirror)
                </div>
              ) : null}

              {d.avatarVideoStatus === "failed" ? (
                <div style={styles.imagesError}>
                  Avatar video failed: {d.avatarVideoError || "unknown error"}
                </div>
              ) : null}

              {d.avatarVideoStatus === "ready" && d.avatarVideoUrl ? (
                <div style={styles.videoBox}>
                  <video
                    src={d.avatarVideoUrl}
                    poster={d.avatarVideoThumbnailUrl || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    style={styles.videoPlayer}
                  />
                  <div style={styles.videoMeta}>
                    {d.avatarVideoDuration ? `${Math.round(d.avatarVideoDuration)}s` : ""}
                    {d.avatarVideoScriptWordCount ? ` · ${d.avatarVideoScriptWordCount} words` : ""}
                    {d.avatarVideoScriptHook ? ` · hook: ${d.avatarVideoScriptHook}` : ""}
                    {" · "}
                    <a href={d.avatarVideoUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa" }}>
                      open / download
                    </a>
                  </div>
                </div>
              ) : null}

              {d.brollStatus === "generating" ? (
                <div style={styles.imagesPending}>
                  Generating B-roll{d.brollMode === "storyboard" ? " storyboard" : " clip"}…
                  typically 1-3 min per clip via {d.brollModelId || "fal.ai"}.
                </div>
              ) : null}

              {d.brollStatus === "failed" || d.brollStatus === "partial" ? (
                <div style={styles.imagesError}>
                  {d.brollStatus === "partial" ? "Some B-roll clips failed: " : "B-roll failed: "}
                  {d.brollError || "unknown error"}
                </div>
              ) : null}

              {Array.isArray(d.brollClips) && d.brollClips.length > 0 ? (
                <div style={styles.brollGrid}>
                  {d.brollClips.map((c, i) => (
                    <div key={c.slot || i} style={styles.brollClipCard}>
                      <video
                        src={c.url}
                        controls
                        playsInline
                        preload="metadata"
                        style={styles.brollClipVideo}
                      />
                      <div style={styles.brollClipMeta}>
                        <strong>{c.slot}</strong>{c.duration ? ` · ${c.duration}s` : ""}
                        {c.intent ? <div style={{ marginTop: 2, fontStyle: "italic" }}>{c.intent}</div> : null}
                        <div style={{ marginTop: 4 }}>
                          <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa" }}>open</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={styles.actions}>
                <button
                  style={styles.btnApprove}
                  onClick={() => setDraftStatus(d.id, "approved")}
                >Approve</button>
                <button
                  style={styles.btnReject}
                  onClick={() => setDraftStatus(d.id, "rejected")}
                >Reject</button>
                {d.formatType !== "document" ? (
                  <button
                    style={styles.btnImages}
                    onClick={() => generateImages(d.id)}
                    disabled={d.imagesStatus === "generating"}
                  >
                    {d.imagesStatus === "generating"
                      ? "Generating…"
                      : (Array.isArray(d.images) && d.images.length > 0)
                        ? "Regenerate images"
                        : "Generate images"}
                  </button>
                ) : null}
                {d.formatType !== "document" ? (
                  <button
                    style={styles.btnAvatarVideo}
                    onClick={() => generateAvatarVideo(d.id)}
                    disabled={d.avatarVideoStatus === "generating"}
                  >
                    {d.avatarVideoStatus === "generating"
                      ? "Generating video…"
                      : d.avatarVideoStatus === "ready"
                        ? "Regenerate video"
                        : "Generate avatar video"}
                  </button>
                ) : null}
                {d.formatType !== "document" ? (
                  <>
                    <button
                      style={styles.btnBroll}
                      onClick={() => generateBroll(d.id, "single")}
                      disabled={d.brollStatus === "generating"}
                      title="One ~5s B-roll scene clip via fal.ai (Kling/Veo)"
                    >
                      {d.brollStatus === "generating" && d.brollMode === "single"
                        ? "Generating clip…"
                        : "B-roll clip"}
                    </button>
                    <button
                      style={styles.btnBroll}
                      onClick={() => generateBroll(d.id, "storyboard")}
                      disabled={d.brollStatus === "generating"}
                      title="Multiple B-roll scenes forming a narrative arc (3-5 clips). More cost."
                    >
                      {d.brollStatus === "generating" && d.brollMode === "storyboard"
                        ? "Generating storyboard…"
                        : "Storyboard"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
