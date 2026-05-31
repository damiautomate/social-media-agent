"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";
import { AppShell } from "@/components/AppShell.js";

const PLATFORM_HUE = { linkedin: "var(--linkedin)", instagram: "var(--instagram)", tiktok: "var(--tiktok)", facebook: "var(--facebook)" };
const STATUS_HUE = { pending: "var(--amber)", approved: "var(--mint)", rejected: "var(--rose)", published: "var(--sky)" };
const PLATFORMS = ["linkedin", "instagram", "tiktok", "facebook"];

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [drafts, setDrafts] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, published: 0, ideas: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingJobs, setPendingJobs] = useState(0);

  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [pillar, setPillar] = useState("");
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState({ ok: "", err: "" });

  const [scheduleDraftId, setScheduleDraftId] = useState(null);
  const [scheduleDate, setScheduleDate] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (!data.session) { router.replace("/login"); return; }
      setUser(data.session.user);
      setAuthReady(true);
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
    refreshDrafts(); refreshStats(); refreshPendingCount();
    const ch = supabase
      .channel("drafts_" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter: `user_id=eq.${user.id}` },
        () => { if (active) { refreshDrafts(); refreshStats(); } })
      .subscribe();
    const iv = setInterval(() => { if (active) refreshPendingCount(); }, 5000);
    return () => { active = false; supabase.removeChannel(ch); clearInterval(iv); };
  }, [user]);

  const filtered = useMemo(() => {
    return drafts.filter((d) =>
      (statusFilter === "all" || d.status === statusFilter) &&
      (platformFilter === "all" || d.platform === platformFilter));
  }, [drafts, statusFilter, platformFilter]);

  async function generate() {
    setGenMsg({ ok: "", err: "" });
    if (!topic || !platform) { setGenMsg({ ok: "", err: "Topic and platform required" }); return; }
    setGenerating(true);
    const res = await authedFetch("/api/generate", { method: "POST", body: JSON.stringify({ topic, angle, platform, pillar, context }) });
    const data = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) { setGenMsg({ ok: "", err: data.error || "Generation failed to start" }); return; }
    setGenMsg({ ok: "Queued — your draft lands here in a few seconds.", err: "" });
    setTopic(""); setAngle(""); setContext("");
    refreshPendingCount();
    setTimeout(() => { setSheetOpen(false); setGenMsg({ ok: "", err: "" }); }, 1100);
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
    return (
      <AppShell active="dashboard" onSignOut={logout}>
        <main className="main">
          <div className="page-head"><div className="skeleton" style={{ height: 36, width: 200 }} /></div>
          <div className="stats">{[0,1,2,3,4].map((i) => <div key={i} className="skeleton" style={{ height: 78 }} />)}</div>
          <div className="draft-grid">{[0,1].map((i) => <div key={i} className="skeleton" style={{ height: 200 }} />)}</div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell active="dashboard" onSignOut={logout}>
      <main className="main">
        <div className="page-head head-row">
          <div>
            <div className="eyebrow">Content Studio</div>
            <h1 className="page-title">Your drafts</h1>
            <p className="page-sub">Generate on-brand posts, attach media, publish or schedule.</p>
          </div>
          <button className="btn btn-primary only-desktop" onClick={() => setSheetOpen(true)}>+ New draft</button>
        </div>

        <div className="stats">
          <Stat val={stats.pending} label="Pending" hue="var(--amber)" />
          <Stat val={stats.approved} label="Approved" hue="var(--mint)" />
          <Stat val={stats.published} label="Published" hue="var(--sky)" />
          <Stat val={stats.ideas} label="Ideas" hue="var(--accent-hi)" />
          <Stat val={pendingJobs} label="Working" hue="var(--ink-3)" spin={pendingJobs > 0} />
        </div>

        <div className="seg-scroll" style={{ marginBottom: 12 }}>
          <div className="seg">
            {["all", "pending", "approved", "published", "rejected"].map((s) => (
              <button key={s} className={`seg-btn ${statusFilter === s ? "active" : ""}`} onClick={() => setStatusFilter(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="seg-scroll" style={{ marginBottom: 20 }}>
          <div className="seg">
            <button className={`seg-btn ${platformFilter === "all" ? "active" : ""}`} onClick={() => setPlatformFilter("all")}>all</button>
            {PLATFORMS.map((p) => (
              <button key={p} className={`seg-btn ${platformFilter === p ? "active" : ""}`} onClick={() => setPlatformFilter(p)}>{p}</button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card empty">
            <div className="empty-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></div>
            <div style={{ fontSize: 15, color: "var(--ink-2)", marginBottom: 4 }}>No drafts yet</div>
            <div style={{ fontSize: 13 }}>Tap the + button to generate your first post.</div>
          </div>
        ) : (
          <div className={`draft-grid ${filtered.length === 1 ? "single" : ""}`}>
            {filtered.map((d) => (
              <DraftCard key={d.id} d={d}
                onStatus={setDraftStatus} onImages={generateImages} onAvatar={generateAvatarVideo}
                onBroll={generateBroll} onPublish={publishNow}
                scheduleDraftId={scheduleDraftId} scheduleDate={scheduleDate} setScheduleDate={setScheduleDate}
                openSchedule={openSchedule} cancelSchedule={cancelSchedule} confirmSchedule={confirmSchedule} />
            ))}
          </div>
        )}
      </main>

      {/* FAB (mobile) */}
      <button className="fab" onClick={() => setSheetOpen(true)} aria-label="New draft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>

      {/* Generate sheet / modal */}
      {sheetOpen ? (
        <>
          <div className="scrim" onClick={() => setSheetOpen(false)} />
          <div className="sheet">
            <div className="sheet-handle" />
            <h2 className="section-title" style={{ marginBottom: 14 }}>New draft</h2>

            <div className="field">
              <label className="label">Topic</label>
              <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. why most CRM automations break at the data layer" />
            </div>
            <div className="field">
              <label className="label">Platform</label>
              <div className="seg" style={{ display: "flex" }}>
                {PLATFORMS.map((p) => (
                  <button key={p} className={`seg-btn ${platform === p ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setPlatform(p)}>{p}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">Angle <span style={{ color: "var(--ink-4)" }}>· optional</span></label>
              <input className="input" value={angle} onChange={(e) => setAngle(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Pillar id <span style={{ color: "var(--ink-4)" }}>· optional</span></label>
              <input className="input" value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="automation / crm / freelance…" />
            </div>
            <div className="field">
              <label className="label">Extra context <span style={{ color: "var(--ink-4)" }}>· optional</span></label>
              <textarea className="textarea" value={context} onChange={(e) => setContext(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" disabled={generating} onClick={generate}>
              {generating ? "Queuing…" : "Generate draft"}
            </button>
            {genMsg.ok ? <div className="note note-ok">{genMsg.ok}</div> : null}
            {genMsg.err ? <div className="note note-err">{genMsg.err}</div> : null}
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

function Stat({ val, label, hue, spin }) {
  return (
    <div className="stat">
      <div className="stat-val" style={{ color: hue }}>{val}</div>
      <div className="stat-lbl">
        {spin ? <span className="dot spin" style={{ background: "var(--accent-hi)", width: 7, height: 7 }} /> : <span className="dot" style={{ background: hue }} />}
        {label}
      </div>
    </div>
  );
}

function DraftCard({ d, onStatus, onImages, onAvatar, onBroll, onPublish, scheduleDraftId, scheduleDate, setScheduleDate, openSchedule, cancelSchedule, confirmSchedule }) {
  const isDoc = d.formatType === "document";
  return (
    <div className="card draft rise">
      <div className="draft-top">
        <div className="draft-meta-row">
          <span className="badge" style={{ background: "color-mix(in srgb, " + (PLATFORM_HUE[d.platform] || "var(--ink-3)") + " 18%, transparent)", color: PLATFORM_HUE[d.platform] || "var(--ink-2)" }}>{d.platform}</span>
          <span className="badge" style={{ background: "color-mix(in srgb, " + (STATUS_HUE[d.status] || "var(--ink-3)") + " 16%, transparent)", color: STATUS_HUE[d.status] || "var(--ink-2)" }}>{d.status}</span>
          {d.formatType ? <span className="chip">{d.formatType}</span> : null}
          {d.pillar ? <span className="chip">{d.pillar}</span> : null}
        </div>
      </div>

      <div className="draft-body">{d.postText}</div>
      {d.hashtags?.length ? <div className="draft-tags">{d.hashtags.map((h) => `#${h}`).join(" ")}</div> : null}
      {d.firstComment ? <div className="draft-sub"><strong>First comment:</strong> {d.firstComment}</div> : null}
      {d.contentNotes ? <div className="draft-sub">{d.contentNotes}</div> : null}

      {d.imagesStatus === "generating" ? <div className="media-state media-working"><span className="dot spin" style={{ background: "currentColor" }} /> Generating images…</div> : null}
      {d.imagesStatus === "failed" ? <div className="media-state media-fail">Image generation failed: {d.imagesError || "unknown error"}</div> : null}
      {Array.isArray(d.images) && d.images.length > 0 ? (
        <div className="img-row">
          {d.images.map((img, i) => (
            <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" title={img.prompt || ""}>
              <img src={img.url} alt={img.slot || `image-${i}`} className="img-thumb" />
            </a>
          ))}
        </div>
      ) : null}

      {d.avatarVideoStatus === "generating" ? <div className="media-state media-working"><span className="dot spin" style={{ background: "currentColor" }} /> Generating avatar video… (1-3 min)</div> : null}
      {d.avatarVideoStatus === "failed" ? <div className="media-state media-fail">Avatar video failed: {d.avatarVideoError || "unknown error"}</div> : null}
      {d.avatarVideoStatus === "ready" && d.avatarVideoUrl ? (
        <div className="video-box">
          <video src={d.avatarVideoUrl} poster={d.avatarVideoThumbnailUrl || undefined} controls playsInline preload="metadata" className="video-player" />
          <div className="video-meta">
            {d.avatarVideoDuration ? `${Math.round(d.avatarVideoDuration)}s` : ""}
            {d.avatarVideoScriptWordCount ? ` · ${d.avatarVideoScriptWordCount} words` : ""}
            {" · "}<a href={d.avatarVideoUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-hi)" }}>open</a>
          </div>
        </div>
      ) : null}

      {d.brollStatus === "generating" ? <div className="media-state media-working"><span className="dot spin" style={{ background: "currentColor" }} /> Generating B-roll {d.brollMode === "storyboard" ? "storyboard" : "clip"}…</div> : null}
      {(d.brollStatus === "failed" || d.brollStatus === "partial") ? <div className="media-state media-fail">{d.brollStatus === "partial" ? "Some B-roll clips failed: " : "B-roll failed: "}{d.brollError || "unknown error"}</div> : null}
      {Array.isArray(d.brollClips) && d.brollClips.length > 0 ? (
        <div className="broll-grid">
          {d.brollClips.map((c, i) => (
            <div key={c.slot || i} className="broll-card">
              <video src={c.url} controls playsInline preload="metadata" />
              <div className="broll-meta"><strong style={{ color: "var(--ink-2)" }}>{c.slot}</strong>{c.duration ? ` · ${c.duration}s` : ""}{c.intent ? <div style={{ marginTop: 2, fontStyle: "italic" }}>{c.intent}</div> : null}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="actions">
        <button className="btn btn-sm btn-mint" onClick={() => onStatus(d.id, "approved")}>Approve</button>
        <button className="btn btn-sm btn-rose" onClick={() => onStatus(d.id, "rejected")}>Reject</button>
        {!isDoc ? (
          <button className="btn btn-sm btn-ghost" onClick={() => onImages(d.id)} disabled={d.imagesStatus === "generating"}>
            {d.imagesStatus === "generating" ? "Images…" : (Array.isArray(d.images) && d.images.length ? "Regen images" : "Images")}
          </button>
        ) : null}
        {!isDoc ? (
          <button className="btn btn-sm btn-ghost" onClick={() => onAvatar(d.id)} disabled={d.avatarVideoStatus === "generating"}>
            {d.avatarVideoStatus === "generating" ? "Video…" : (d.avatarVideoStatus === "ready" ? "Regen video" : "Avatar video")}
          </button>
        ) : null}
        {!isDoc ? (
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => onBroll(d.id, "single")} disabled={d.brollStatus === "generating"}>
              {d.brollStatus === "generating" && d.brollMode === "single" ? "Clip…" : "B-roll"}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => onBroll(d.id, "storyboard")} disabled={d.brollStatus === "generating"}>
              {d.brollStatus === "generating" && d.brollMode === "storyboard" ? "Storyboard…" : "Storyboard"}
            </button>
          </>
        ) : null}
        <button className="btn btn-sm btn-primary" onClick={() => onPublish(d.id)} disabled={d.publishStatus === "publishing" || d.publishStatus === "published"}>
          {d.publishStatus === "publishing" ? "Publishing…" : (d.publishStatus === "published" ? "Published ✓" : "Post now")}
        </button>
        <button className="btn btn-sm btn-soft" onClick={() => openSchedule(d.id)} disabled={d.publishStatus === "publishing" || d.publishStatus === "scheduling"}>
          {d.publishStatus === "scheduling" ? "Scheduling…" : (d.publishStatus === "scheduled" ? "Reschedule" : "Schedule")}
        </button>
      </div>

      {scheduleDraftId === d.id ? (
        <div className="schedule-row">
          <input type="datetime-local" className="input" style={{ flex: 1, minWidth: 180 }} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
          <button className="btn btn-sm btn-primary" onClick={() => confirmSchedule(d.id)}>Confirm</button>
          <button className="btn btn-sm btn-soft" onClick={cancelSchedule}>Cancel</button>
        </div>
      ) : null}

      {(d.publishStatus === "publishing" || d.publishStatus === "scheduling") ? <div className="pub pub-work">{d.publishStatus === "publishing" ? "Publishing now…" : "Scheduling…"}</div> : null}
      {d.publishStatus === "published" ? <div className="pub pub-ok">Published ✓ via {d.publishProvider || "provider"}{Array.isArray(d.publishProviderPostIds) && d.publishProviderPostIds.length ? ` · ${d.publishProviderPostIds.join(", ")}` : ""}</div> : null}
      {d.publishStatus === "scheduled" ? <div className="pub pub-sched">Scheduled for {d.publishScheduledFor ? new Date(d.publishScheduledFor).toLocaleString() : "(unknown)"}</div> : null}
      {d.publishStatus === "failed" ? <div className="pub pub-err">Publish failed: {d.publishError || "unknown error"}</div> : null}
    </div>
  );
}
