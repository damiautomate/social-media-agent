"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";

const PLATFORM_COLORS = { linkedin: "#0a66c2", instagram: "#c13584", tiktok: "#000000", facebook: "#1877f2" };
const STATUS_COLORS = { pending: "#a16207", approved: "#059669", rejected: "#7f1d1d", published: "#1d4ed8" };
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

  // generate panel
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [pillar, setPillar] = useState("");
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState({ ok: "", err: "" });

  // scheduling UI state
  const [scheduleDraftId, setScheduleDraftId] = useState(null);
  const [scheduleDate, setScheduleDate] = useState("");

  // ---- auth gate ----
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (!data.session) { router.replace("/login"); return; }
      setUser(data.session.user);
      setAuthReady(true);
      // ensure profile bootstrap + onboarding check
      const token = data.session.access_token;
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && !d.hasCompletedOnboarding) router.replace("/onboarding");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
      else { setUser(session.user); setAuthReady(true); }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }
  async function authedFetch(path, options = {}) {
    const token = await getToken();
    return fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }

  // ---- initial fetch + realtime on drafts ----
  async function refreshDrafts() {
    const res = await authedFetch("/api/drafts");
    if (res.ok) { const { drafts } = await res.json(); setDrafts(drafts || []); }
  }
  async function refreshStats() {
    const res = await authedFetch("/api/stats");
    if (res.ok) setStats(await res.json());
  }
  async function refreshPendingCount() {
    const res = await authedFetch("/api/jobs/pending-count");
    if (res.ok) { const { count } = await res.json(); setPendingJobs(count || 0); }
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    refreshDrafts();
    refreshStats();
    refreshPendingCount();

    // Realtime: any change to this user's drafts → refetch list + stats
    const ch = supabase
      .channel("drafts_" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter: `user_id=eq.${user.id}` },
        () => { if (active) { refreshDrafts(); refreshStats(); } })
      .subscribe();

    // Poll pending job count (pending_jobs not client-readable under RLS)
    const iv = setInterval(() => { if (active) refreshPendingCount(); }, 5000);

    return () => { active = false; supabase.removeChannel(ch); clearInterval(iv); };
  }, [user]);

  const filtered = useMemo(() => {
    return drafts.filter((d) =>
      (statusFilter === "all" || d.status === statusFilter) &&
      (platformFilter === "all" || d.platform === platformFilter));
  }, [drafts, statusFilter, platformFilter]);

  // ---- actions ----
  async function generate() {
    setGenMsg({ ok: "", err: "" });
    if (!topic || !platform) { setGenMsg({ ok: "", err: "Topic and platform required" }); return; }
    setGenerating(true);
    const res = await authedFetch("/api/generate", { method: "POST", body: JSON.stringify({ topic, angle, platform, pillar, context }) });
    const data = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) { setGenMsg({ ok: "", err: data.error || "Generation failed to start" }); return; }
    setGenMsg({ ok: "Queued! Your draft will appear below shortly.", err: "" });
    setTopic(""); setAngle(""); setContext("");
    refreshPendingCount();
  }

  async function setDraftStatus(draftId, status) {
    await authedFetch("/api/drafts", { method: "PATCH", body: JSON.stringify({ draftId, status }) });
    refreshDrafts(); refreshStats();
  }
  async function generateImages(draftId) {
    const res = await authedFetch("/api/images/generate", { method: "POST", body: JSON.stringify({ draftId }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to start image generation"); }
  }
  async function generateAvatarVideo(draftId) {
    const res = await authedFetch("/api/avatar-video/generate", { method: "POST", body: JSON.stringify({ draftId }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to start avatar video"); }
  }
  async function generateBroll(draftId, mode) {
    const res = await authedFetch("/api/broll/generate", { method: "POST", body: JSON.stringify({ draftId, mode }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to start B-roll"); }
  }
  async function publishNow(draftId) {
    if (!confirm("Publish this draft NOW to the connected platform?")) return;
    const res = await authedFetch("/api/publish", { method: "POST", body: JSON.stringify({ draftId, mode: "now" }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to queue publish"); }
  }
  function defaultScheduleTime() {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function openSchedule(draftId) { setScheduleDraftId(draftId); setScheduleDate(defaultScheduleTime()); }
  function cancelSchedule() { setScheduleDraftId(null); setScheduleDate(""); }
  async function confirmSchedule(draftId) {
    if (!scheduleDate) { alert("Pick a date and time first"); return; }
    const scheduledAt = new Date(scheduleDate).toISOString();
    const res = await authedFetch("/api/publish", { method: "POST", body: JSON.stringify({ draftId, mode: "schedule", scheduledAt }) });
    if (res.ok) cancelSchedule();
    else { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to schedule"); }
  }
  async function logout() { await supabase.auth.signOut(); router.replace("/login"); }

  if (!authReady) {
    return <main style={styles.page}><div style={{ padding: 40, color: "#71717a" }}>Loading…</div></main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.h1}>Content Dashboard</h1>
        <div style={styles.headerActions}>
          <a href="/ideas" style={styles.navLink}>Ideas</a>
          <a href="/bootstrap" style={styles.navLink}>Bootstrap</a>
          <a href="/settings" style={styles.navLink}>Settings</a>
          <button style={styles.navBtn} onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="m-stack-4" style={styles.statsRow}>
        <Stat label="Pending" value={stats.pending} />
        <Stat label="Approved" value={stats.approved} />
        <Stat label="Published" value={stats.published} />
        <Stat label="Ideas" value={stats.ideas} />
        <Stat label="Jobs running" value={pendingJobs} />
      </div>

      <div style={styles.panel}>
        <div style={styles.panelHead} onClick={() => setShowGen((s) => !s)}>
          <strong>+ Generate new</strong>
          <span style={{ color: "#71717a" }}>{showGen ? "▲" : "▼"}</span>
        </div>
        {showGen ? (
          <div style={styles.genBody}>
            <div className="m-stack-2" style={styles.genRow}>
              <div style={{ flex: 2 }}>
                <label style={styles.label}>Topic *</label>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} style={styles.input} placeholder="e.g. why most CRM automations break at the data layer" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Platform *</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={styles.input}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="m-stack-2" style={styles.genRow}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Angle (optional)</label>
                <input value={angle} onChange={(e) => setAngle(e.target.value)} style={styles.input} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Pillar id (optional)</label>
                <input value={pillar} onChange={(e) => setPillar(e.target.value)} style={styles.input} placeholder="automation / crm / freelance…" />
              </div>
            </div>
            <label style={styles.label}>Extra context (optional)</label>
            <textarea value={context} onChange={(e) => setContext(e.target.value)} style={{ ...styles.input, minHeight: 60, fontFamily: "inherit" }} />
            <button style={styles.primary} disabled={generating} onClick={generate}>{generating ? "Queuing…" : "Generate draft"}</button>
            {genMsg.ok ? <div style={styles.ok}>{genMsg.ok}</div> : null}
            {genMsg.err ? <div style={styles.err}>{genMsg.err}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="m-stack-2" style={styles.filters}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.filterSel}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} style={styles.filterSel}>
          <option value="all">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={styles.list}>
        {filtered.length === 0 ? (
          <div style={{ color: "#71717a", padding: 24, textAlign: "center" }}>No drafts yet. Generate one above.</div>
        ) : (
          filtered.map((d) => (
            <div key={d.id} className="m-card" style={styles.card}>
              <div style={styles.cardHead}>
                <div style={styles.badges}>
                  <span style={{ ...styles.badge, backgroundColor: PLATFORM_COLORS[d.platform] || "#3f3f46" }}>{d.platform}</span>
                  <span style={{ ...styles.badge, backgroundColor: STATUS_COLORS[d.status] || "#3f3f46" }}>{d.status}</span>
                  {d.formatType ? <span style={styles.pillTag}>{d.formatType}</span> : null}
                  {d.pillar ? <span style={styles.pillTag}>{d.pillar}</span> : null}
                </div>
              </div>
              <div style={styles.postText}>{d.postText}</div>
              {d.hashtags?.length ? <div style={styles.meta}>{d.hashtags.map((h) => `#${h}`).join(" ")}</div> : null}
              {d.firstComment ? <div style={styles.meta}><strong>First comment:</strong> {d.firstComment}</div> : null}
              {d.contentNotes ? <div style={styles.meta}>{d.contentNotes}</div> : null}

              {/* Images */}
              {d.imagesStatus === "generating" ? <div style={styles.pending}>Generating images…</div> : null}
              {d.imagesStatus === "failed" ? <div style={styles.errBox}>Image generation failed: {d.imagesError || "unknown error"}</div> : null}
              {Array.isArray(d.images) && d.images.length > 0 ? (
                <div className="m-img-grid" style={styles.imgRow}>
                  {d.images.map((img, i) => (
                    <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" title={img.prompt || ""}>
                      <img src={img.url} alt={img.slot || `image-${i}`} style={styles.imgThumb} />
                    </a>
                  ))}
                </div>
              ) : null}

              {/* Avatar video */}
              {d.avatarVideoStatus === "generating" ? <div style={styles.pending}>Generating avatar video… (1-3 min)</div> : null}
              {d.avatarVideoStatus === "failed" ? <div style={styles.errBox}>Avatar video failed: {d.avatarVideoError || "unknown error"}</div> : null}
              {d.avatarVideoStatus === "ready" && d.avatarVideoUrl ? (
                <div style={styles.videoBox}>
                  <video src={d.avatarVideoUrl} poster={d.avatarVideoThumbnailUrl || undefined} controls playsInline preload="metadata" style={styles.videoPlayer} />
                  <div style={styles.videoMeta}>
                    {d.avatarVideoDuration ? `${Math.round(d.avatarVideoDuration)}s` : ""}
                    {d.avatarVideoScriptWordCount ? ` · ${d.avatarVideoScriptWordCount} words` : ""}
                    {" · "}<a href={d.avatarVideoUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa" }}>open</a>
                  </div>
                </div>
              ) : null}

              {/* B-roll */}
              {d.brollStatus === "generating" ? <div style={styles.pending}>Generating B-roll {d.brollMode === "storyboard" ? "storyboard" : "clip"}…</div> : null}
              {(d.brollStatus === "failed" || d.brollStatus === "partial") ? <div style={styles.errBox}>{d.brollStatus === "partial" ? "Some B-roll clips failed: " : "B-roll failed: "}{d.brollError || "unknown error"}</div> : null}
              {Array.isArray(d.brollClips) && d.brollClips.length > 0 ? (
                <div style={styles.brollGrid}>
                  {d.brollClips.map((c, i) => (
                    <div key={c.slot || i} style={styles.brollCard}>
                      <video src={c.url} controls playsInline preload="metadata" style={styles.brollVideo} />
                      <div style={styles.brollMeta}><strong>{c.slot}</strong>{c.duration ? ` · ${c.duration}s` : ""}{c.intent ? <div style={{ marginTop: 2, fontStyle: "italic" }}>{c.intent}</div> : null}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Actions */}
              <div style={styles.actions}>
                <button style={styles.btnApprove} onClick={() => setDraftStatus(d.id, "approved")}>Approve</button>
                <button style={styles.btnReject} onClick={() => setDraftStatus(d.id, "rejected")}>Reject</button>
                {d.formatType !== "document" ? (
                  <button style={styles.btnImages} onClick={() => generateImages(d.id)} disabled={d.imagesStatus === "generating"}>
                    {d.imagesStatus === "generating" ? "Generating images…" : (Array.isArray(d.images) && d.images.length ? "Regenerate images" : "Generate images")}
                  </button>
                ) : null}
                {d.formatType !== "document" ? (
                  <button style={styles.btnAvatar} onClick={() => generateAvatarVideo(d.id)} disabled={d.avatarVideoStatus === "generating"}>
                    {d.avatarVideoStatus === "generating" ? "Generating video…" : (d.avatarVideoStatus === "ready" ? "Regenerate video" : "Generate avatar video")}
                  </button>
                ) : null}
                {d.formatType !== "document" ? (
                  <>
                    <button style={styles.btnBroll} onClick={() => generateBroll(d.id, "single")} disabled={d.brollStatus === "generating"}>
                      {d.brollStatus === "generating" && d.brollMode === "single" ? "Generating clip…" : "B-roll clip"}
                    </button>
                    <button style={styles.btnBroll} onClick={() => generateBroll(d.id, "storyboard")} disabled={d.brollStatus === "generating"}>
                      {d.brollStatus === "generating" && d.brollMode === "storyboard" ? "Generating storyboard…" : "Storyboard"}
                    </button>
                  </>
                ) : null}
                <button style={styles.btnPublish} onClick={() => publishNow(d.id)} disabled={d.publishStatus === "publishing" || d.publishStatus === "published"}>
                  {d.publishStatus === "publishing" ? "Publishing…" : (d.publishStatus === "published" ? "Published ✓" : "Approve & Post Now")}
                </button>
                <button style={styles.btnSchedule} onClick={() => openSchedule(d.id)} disabled={d.publishStatus === "publishing" || d.publishStatus === "scheduling"}>
                  {d.publishStatus === "scheduling" ? "Scheduling…" : (d.publishStatus === "scheduled" ? "Reschedule" : "Schedule")}
                </button>
              </div>

              {scheduleDraftId === d.id ? (
                <div style={styles.scheduleRow}>
                  <input type="datetime-local" style={styles.dateInput} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                  <button style={styles.btnPublish} onClick={() => confirmSchedule(d.id)}>Confirm schedule</button>
                  <button style={styles.btnReject} onClick={cancelSchedule}>Cancel</button>
                </div>
              ) : null}

              {/* Publish status */}
              {(d.publishStatus === "publishing" || d.publishStatus === "scheduling") ? <div style={{ ...styles.publishBox, ...styles.pubPending }}>{d.publishStatus === "publishing" ? "Publishing now…" : "Scheduling…"}</div> : null}
              {d.publishStatus === "published" ? <div style={{ ...styles.publishBox, ...styles.pubOk }}>Published ✓ via {d.publishProvider || "provider"}{Array.isArray(d.publishProviderPostIds) && d.publishProviderPostIds.length ? ` · post id: ${d.publishProviderPostIds.join(", ")}` : ""}</div> : null}
              {d.publishStatus === "scheduled" ? <div style={{ ...styles.publishBox, ...styles.pubSched }}>Scheduled for {d.publishScheduledFor ? new Date(d.publishScheduledFor).toLocaleString() : "(unknown)"}</div> : null}
              {d.publishStatus === "failed" ? <div style={{ ...styles.publishBox, ...styles.pubErr }}>Publish failed: {d.publishError || "unknown error"}</div> : null}
            </div>
          ))
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles = {
  page: { maxWidth: 900, margin: "0 auto", padding: "24px 16px 80px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 },
  h1: { fontSize: 24, margin: 0, color: "#fafafa" },
  headerActions: { display: "flex", gap: 8, alignItems: "center" },
  navLink: { color: "#a78bfa", textDecoration: "none", fontSize: 14, padding: "6px 10px" },
  navBtn: { background: "#27272a", color: "#e4e4e7", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 14 },
  statsRow: { display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 90, backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: "12px 14px" },
  statValue: { fontSize: 24, fontWeight: 700, color: "#fafafa" },
  statLabel: { fontSize: 12, color: "#71717a", marginTop: 2 },
  panel: { backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 12, marginBottom: 20, overflow: "hidden" },
  panelHead: { padding: "14px 16px", display: "flex", justifyContent: "space-between", cursor: "pointer", color: "#e4e4e7" },
  genBody: { padding: "0 16px 16px" },
  genRow: { display: "flex", gap: 12, marginBottom: 10 },
  label: { display: "block", color: "#a1a1aa", fontSize: 12, margin: "8px 0 4px" },
  input: { width: "100%", boxSizing: "border-box", backgroundColor: "#0a0a0a", color: "#e4e4e7", border: "1px solid #27272a", borderRadius: 8, padding: "10px 12px", fontSize: 14 },
  primary: { marginTop: 14, padding: "11px 18px", backgroundColor: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  filters: { display: "flex", gap: 10, marginBottom: 14 },
  filterSel: { backgroundColor: "#18181b", color: "#e4e4e7", border: "1px solid #27272a", borderRadius: 8, padding: "8px 12px", fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 14 },
  card: { backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 16 },
  cardHead: { marginBottom: 10 },
  badges: { display: "flex", gap: 6, flexWrap: "wrap" },
  badge: { color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 999, textTransform: "capitalize" },
  pillTag: { backgroundColor: "#27272a", color: "#a1a1aa", fontSize: 11, padding: "2px 8px", borderRadius: 999 },
  postText: { color: "#e4e4e7", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 10 },
  meta: { color: "#a1a1aa", fontSize: 12, marginBottom: 6, lineHeight: 1.5 },
  pending: { color: "#c7d2fe", fontSize: 12, marginTop: 10, padding: "8px 12px", backgroundColor: "#1e1b4b", borderRadius: 6, border: "1px solid #6366f1" },
  errBox: { color: "#fca5a5", fontSize: 12, marginTop: 10, padding: "8px 12px", backgroundColor: "#450a0a", borderRadius: 6, border: "1px solid #7f1d1d" },
  imgRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  imgThumb: { width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #27272a" },
  videoBox: { marginTop: 12, display: "flex", flexDirection: "column", gap: 6 },
  videoPlayer: { maxWidth: 280, width: "100%", borderRadius: 10, border: "1px solid #27272a", backgroundColor: "#000" },
  videoMeta: { color: "#71717a", fontSize: 11 },
  brollGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 12 },
  brollCard: { backgroundColor: "#09090b", borderRadius: 8, border: "1px solid #27272a", overflow: "hidden" },
  brollVideo: { width: "100%", display: "block", backgroundColor: "#000" },
  brollMeta: { padding: "6px 10px", color: "#a1a1aa", fontSize: 11, lineHeight: 1.4 },
  actions: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" },
  btnApprove: { padding: "6px 14px", backgroundColor: "#059669", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  btnReject: { padding: "6px 14px", backgroundColor: "#3f3f46", color: "#e4e4e7", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  btnImages: { padding: "6px 12px", backgroundColor: "#1e3a5f", color: "#bfdbfe", border: "1px solid #2563eb", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  btnAvatar: { padding: "6px 12px", backgroundColor: "#0c4a6e", color: "#bae6fd", border: "1px solid #075985", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  btnBroll: { padding: "6px 12px", backgroundColor: "#3f1d61", color: "#e9d5ff", border: "1px solid #6d28d9", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  btnPublish: { padding: "6px 12px", backgroundColor: "#064e3b", color: "#bbf7d0", border: "1px solid #047857", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  btnSchedule: { padding: "6px 12px", backgroundColor: "#1c1917", color: "#fbbf24", border: "1px solid #ca8a04", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  scheduleRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" },
  dateInput: { backgroundColor: "#0a0a0a", color: "#e4e4e7", border: "1px solid #27272a", padding: "6px 10px", borderRadius: 6, fontSize: 12 },
  publishBox: { marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.5 },
  pubOk: { backgroundColor: "#022c22", border: "1px solid #047857", color: "#a7f3d0" },
  pubSched: { backgroundColor: "#292524", border: "1px solid #a16207", color: "#fcd34d" },
  pubPending: { backgroundColor: "#1e1b4b", border: "1px solid #6366f1", color: "#c7d2fe" },
  pubErr: { backgroundColor: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5" },
  ok: { marginTop: 10, color: "#a7f3d0", fontSize: 13 },
  err: { marginTop: 10, color: "#fca5a5", fontSize: 13 },
};
