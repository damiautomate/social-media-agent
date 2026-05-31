"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";
import { AppShell } from "@/components/AppShell.js";

const PLATFORMS = ["linkedin", "instagram", "tiktok", "facebook"];

function ScoreBar({ label, value }) {
  const v = Math.max(0, Math.min(10, Number(value) || 0));
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ height: 4, background: "var(--line)", borderRadius: 2, overflow: "hidden", margin: "4px 0" }}>
        <div style={{ height: "100%", width: `${v * 10}%`, background: "var(--accent-hi)" }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-2)" }}>{v.toFixed(1)}</div>
    </div>
  );
}

function UseIdeaModal({ idea, onClose, onConfirm, busy }) {
  const [platform, setPlatform] = useState("linkedin");
  if (!idea) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <h2 className="section-title" style={{ marginBottom: 6 }}>Generate a draft</h2>
        <p className="section-desc">{idea.topic}</p>
        <div className="field">
          <label className="label">Platform</label>
          <div className="seg" style={{ display: "flex" }}>
            {PLATFORMS.map((p) => (
              <button key={p} className={`seg-btn ${platform === p ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setPlatform(p)}>{p}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button className="btn btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onConfirm(platform)} disabled={busy}>{busy ? "Queuing…" : "Generate"}</button>
        </div>
      </div>
    </>
  );
}

export default function IdeasPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [pillarFilter, setPillarFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("new");
  const [sortBy, setSortBy] = useState("relevanceScore");
  const [researching, setResearching] = useState(false);
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load(session) {
      if (!session) { router.replace("/login"); return; }
      setUser(session.user);
    }
    supabase.auth.getSession().then(({ data }) => { if (mounted) load(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (!session) router.replace("/login"); });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let prevCount = ideas.length;
    async function fetchIdeas() {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/ideas", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok && active) {
        const { ideas: next } = await res.json();
        // If new ideas arrived while a research run was in flight, clear the badge.
        if ((next || []).length > prevCount) setResearching(false);
        prevCount = (next || []).length;
        setIdeas(next || []);
      }
    }
    fetchIdeas();
    const ch = supabase
      .channel("ideas_" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `user_id=eq.${user.id}` },
        () => { fetchIdeas(); })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [user]);

  async function authedFetch(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }

  async function runResearch() {
    setMsg({ ok: "", err: "" });
    setResearching(true);
    const res = await authedFetch("/api/research/run", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg({ ok: "Research run queued. New ideas appear in a minute or two.", err: "" });
      // Safety: clear the badge after 3 minutes even if nothing came back.
      setTimeout(() => setResearching(false), 180000);
    } else {
      setResearching(false);
      setMsg({ ok: "", err: data.error || "Failed to start research run" });
    }
  }

  async function confirmUseIdea(platform) {
    if (!selectedIdea) return;
    setGenerating(true);
    const res = await authedFetch("/api/generate", {
      method: "POST",
      body: JSON.stringify({ ideaId: selectedIdea.id, topic: selectedIdea.topic, angle: selectedIdea.angle, pillar: selectedIdea.pillar, platform }),
    });
    setGenerating(false);
    if (res.ok) { setSelectedIdea(null); router.push("/"); }
    else { const data = await res.json().catch(() => ({})); setMsg({ ok: "", err: data.error || "Failed to queue draft generation" }); }
  }

  async function logout() { await supabase.auth.signOut(); router.replace("/login"); }

  const pillarOptions = useMemo(() => {
    const ids = new Set();
    ideas.forEach((i) => i.pillar && ids.add(i.pillar));
    return [...ids];
  }, [ideas]);

  const visible = useMemo(() => {
    let arr = ideas.slice();
    if (statusFilter !== "all") arr = arr.filter((i) => (i.status || "new") === statusFilter);
    if (pillarFilter !== "all") arr = arr.filter((i) => i.pillar === pillarFilter);
    if (sortBy === "relevanceScore") arr.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    else if (sortBy === "urgency") { const rank = { high: 3, normal: 2, low: 1 }; arr.sort((a, b) => (rank[b.urgency] || 0) - (rank[a.urgency] || 0)); }
    return arr;
  }, [ideas, pillarFilter, statusFilter, sortBy]);

  if (!user) {
    return <AppShell active="ideas" onSignOut={logout}><main className="main"><div className="skeleton" style={{ height: 300 }} /></main></AppShell>;
  }

  return (
    <AppShell active="ideas" onSignOut={logout}>
      <main className="main">
        <div className="page-head head-row">
          <div>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              Ideas Bank
              {researching ? <span className="badge" style={{ background: "rgba(139,92,246,.14)", color: "var(--accent-hi)" }}><span className="dot spin" style={{ background: "currentColor", width: 6, height: 6 }} /> Researching</span> : null}
            </div>
            <h1 className="page-title">Idea bank</h1>
            <p className="page-sub">AI-scored content ideas pulled from your sources.</p>
          </div>
          <button className="btn btn-primary only-desktop" onClick={runResearch} disabled={researching}>{researching ? "Researching…" : "Run research"}</button>
        </div>

        <div className="seg-scroll" style={{ marginBottom: 10 }}>
          <div className="seg">
            {["new", "used", "dismissed", "all"].map((s) => (
              <button key={s} className={`seg-btn ${statusFilter === s ? "active" : ""}`} onClick={() => setStatusFilter(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
          <select className="select" style={{ width: "auto" }} value={pillarFilter} onChange={(e) => setPillarFilter(e.target.value)}>
            <option value="all">All pillars</option>
            {pillarOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="relevanceScore">Sort: score</option>
            <option value="urgency">Sort: urgency</option>
          </select>
        </div>

        {msg.ok ? <div className="note note-ok" style={{ marginTop: 0, marginBottom: 14 }}>{msg.ok}</div> : null}
        {msg.err ? <div className="note note-err" style={{ marginTop: 0, marginBottom: 14 }}>{msg.err}</div> : null}

        {visible.length === 0 ? (
          <div className="card empty">
            <div className="empty-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3Z"/></svg></div>
            <div style={{ fontSize: 15, color: "var(--ink-2)", marginBottom: 4 }}>{ideas.length === 0 ? "No ideas yet" : "Nothing matches those filters"}</div>
            <div style={{ fontSize: 13 }}>{ideas.length === 0 ? 'Tap "Run research" to populate the bank.' : "Try a different filter."}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visible.map((idea) => {
              const scores = idea.scores || idea.scoreDetail?.scores || {};
              const sourceUrls = idea.sourceUrls || idea.scoreDetail?.sourceUrls || [];
              const sourceLabels = idea.sourceLabels || idea.scoreDetail?.sourceLabels || [];
              const reasoning = idea.reasoning || idea.scoreDetail?.reasoning;
              return (
                <div key={idea.id} className="card card-pad rise">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.4, color: "var(--ink)" }}>{idea.topic}</div>
                      {idea.angle ? <div style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{idea.angle}</div> : null}
                      {reasoning ? <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 8, fontStyle: "italic" }}>{reasoning}</div> : null}
                    </div>
                    <div style={{ textAlign: "right", minWidth: 72 }}>
                      <div style={{ fontFamily: "'Bricolage Grotesque'", fontSize: 26, fontWeight: 700, color: "var(--accent-hi)", lineHeight: 1 }}>{(idea.relevanceScore || 0).toFixed(1)}</div>
                      <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 4 }}>Composite</div>
                    </div>
                  </div>

                  {Object.keys(scores).length ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 14 }}>
                      <ScoreBar label="Relevance" value={scores.relevance} />
                      <ScoreBar label="Novelty" value={scores.novelty} />
                      <ScoreBar label="Voice fit" value={scores.voiceFit} />
                      <ScoreBar label="Urgency" value={scores.urgency} />
                    </div>
                  ) : null}

                  <div className="draft-meta-row" style={{ marginTop: 12 }}>
                    {idea.pillar ? <span className="chip">{idea.pillar}</span> : null}
                    {idea.urgency && idea.urgency !== "normal" ? <span className="badge" style={{ background: idea.urgency === "high" ? "rgba(251,113,133,.15)" : "rgba(124,124,136,.15)", color: idea.urgency === "high" ? "var(--rose)" : "var(--ink-3)" }}>{idea.urgency}</span> : null}
                    <span className="chip">{idea.source || "manual"}</span>
                    {sourceLabels.map((l, i) => <span key={i} className="chip">{l}</span>)}
                  </div>

                  {sourceUrls.length > 0 ? (
                    <div style={{ marginTop: 10, color: "var(--ink-3)", fontSize: 11.5 }}>
                      Sources: {sourceUrls.slice(0, 5).map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-hi)", marginRight: 8 }}>[{i + 1}]</a>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 14 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => setSelectedIdea(idea)} disabled={idea.status === "used"}>
                      {idea.status === "used" ? "Already used" : "Use this idea"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* mobile research FAB */}
      <button className="fab" onClick={runResearch} disabled={researching} aria-label="Run research">
        {researching
          ? <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
      </button>

      <UseIdeaModal idea={selectedIdea} onClose={() => setSelectedIdea(null)} onConfirm={confirmUseIdea} busy={generating} />
    </AppShell>
  );
}
