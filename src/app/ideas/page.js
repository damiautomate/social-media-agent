"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase-client.js";

const PLATFORMS = ["linkedin", "instagram", "tiktok", "facebook"];

const styles = {
  page: { minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fafafa", fontFamily: "ui-sans-serif, system-ui" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 24px", borderBottom: "1px solid #18181b",
  },
  brand: { fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 12 },
  nav: { display: "flex", gap: 16 },
  navLink: { background: "transparent", border: "none", color: "#a1a1aa", fontSize: 13, cursor: "pointer" },
  main: { padding: "24px", maxWidth: 1200, margin: "0 auto" },
  toolbar: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
  select: {
    padding: "8px 12px", backgroundColor: "#18181b", color: "#fafafa",
    border: "1px solid #27272a", borderRadius: 8, fontSize: 13,
  },
  primary: {
    padding: "8px 14px", backgroundColor: "#7c3aed", color: "white",
    border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
  },
  ghost: {
    padding: "8px 14px", backgroundColor: "transparent", color: "#e4e4e7",
    border: "1px solid #27272a", borderRadius: 8, fontSize: 13, cursor: "pointer",
  },
  card: {
    border: "1px solid #18181b", borderRadius: 12, padding: 16, marginBottom: 12,
    backgroundColor: "#0f0f10",
  },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  topic: { fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
  angle: { color: "#a1a1aa", fontSize: 13, marginTop: 6, lineHeight: 1.5 },
  reason: { color: "#71717a", fontSize: 12, marginTop: 8, fontStyle: "italic", lineHeight: 1.5 },
  badgeRow: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" },
  badge: {
    display: "inline-block", padding: "3px 9px", backgroundColor: "#27272a",
    color: "#e4e4e7", borderRadius: 999, fontSize: 11, fontWeight: 500,
  },
  pillarBadge: { backgroundColor: "#312e81", color: "#c7d2fe" },
  urgencyHigh: { backgroundColor: "#7f1d1d", color: "#fecaca" },
  urgencyLow: { backgroundColor: "#1f2937", color: "#9ca3af" },
  scoreBlock: {
    minWidth: 90, textAlign: "right", display: "flex", flexDirection: "column", gap: 4,
  },
  bigScore: { fontSize: 24, fontWeight: 700, color: "#a78bfa", lineHeight: 1 },
  scoreLabel: { fontSize: 10, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.5 },
  scoreBars: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12 },
  scoreBar: { display: "flex", flexDirection: "column", gap: 4 },
  scoreBarLabel: { fontSize: 10, color: "#71717a", textTransform: "uppercase" },
  scoreBarTrack: { height: 4, backgroundColor: "#27272a", borderRadius: 2, overflow: "hidden" },
  scoreBarFill: { height: "100%", backgroundColor: "#a78bfa" },
  scoreBarValue: { fontSize: 11, color: "#a1a1aa" },
  sourcesRow: { marginTop: 10, color: "#71717a", fontSize: 11 },
  sourceLink: { color: "#818cf8", textDecoration: "none", marginRight: 8 },
  actions: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" },
  empty: { color: "#71717a", padding: 40, textAlign: "center" },
  msg: { padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 },
  msgOk: { backgroundColor: "#052e16", color: "#86efac", border: "1px solid #14532d" },
  msgErr: { backgroundColor: "#450a0a", color: "#fca5a5", border: "1px solid #7f1d1d" },
  modalBackdrop: {
    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
  },
  modal: {
    backgroundColor: "#0f0f10", border: "1px solid #27272a", borderRadius: 12,
    padding: 20, width: "min(440px, 92vw)",
  },
  modalTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12 },
  pendingChip: {
    padding: "4px 10px", borderRadius: 999, backgroundColor: "#1e1b4b",
    color: "#a5b4fc", fontSize: 11, fontWeight: 500,
  },
};

function ScoreBar({ label, value }) {
  const v = Math.max(0, Math.min(10, Number(value) || 0));
  return (
    <div style={styles.scoreBar}>
      <div style={styles.scoreBarLabel}>{label}</div>
      <div style={styles.scoreBarTrack}>
        <div style={{ ...styles.scoreBarFill, width: `${v * 10}%` }} />
      </div>
      <div style={styles.scoreBarValue}>{v.toFixed(1)}</div>
    </div>
  );
}

function UseIdeaModal({ idea, onClose, onConfirm, busy }) {
  const [platform, setPlatform] = useState("linkedin");
  if (!idea) return null;
  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>Generate a draft from this idea</div>
        <div style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>{idea.topic}</div>
        <label style={{ fontSize: 12, color: "#a1a1aa", display: "block", marginBottom: 4 }}>Platform</label>
        <select style={styles.select} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button style={styles.ghost} onClick={onClose} disabled={busy}>Cancel</button>
          <button style={styles.primary} onClick={() => onConfirm(platform)} disabled={busy}>
            {busy ? "Queueing…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IdeasPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [pillarFilter, setPillarFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("new");
  const [sortBy, setSortBy] = useState("relevanceScore");
  const [research, setResearch] = useState(null);
  const [activeResearch, setActiveResearch] = useState(false);
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Auth + load research config + subscribe to ideas + watch research jobs
  useEffect(() => {
    let mounted = true;
    async function load(session) {
      if (!session) { router.replace("/login"); return; }
      setUser(session.user);
      const token = session.access_token;
      const res = await fetch("/api/research/sources", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const { research } = await res.json(); if (mounted) setResearch(research); }
    }
    supabase.auth.getSession().then(({ data }) => { if (mounted) load(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (!session) router.replace("/login"); });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function fetchIdeas() {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/ideas", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok && active) { const { ideas } = await res.json(); setIdeas(ideas || []); }
    }
    fetchIdeas();
    const ch = supabase
      .channel("ideas_" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `user_id=eq.${user.id}` },
        () => { fetchIdeas(); })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [user]);

  // Watch for an active research job by polling (pending_jobs isn't client-readable under RLS)
  useEffect(() => {
    if (!user) return;
    let active = true;
    async function poll() {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/research/run", { method: "GET", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      // /api/research/run has no GET; instead rely on jobs/pending-count as a soft signal
      const res2 = await fetch("/api/jobs/pending-count", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (res2 && res2.ok && active) { const { count } = await res2.json(); setActiveResearch(count > 0); }
    }
    poll();
    const iv = setInterval(poll, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [user]);

  async function authedFetch(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async function runResearch() {
    setMsg({ ok: "", err: "" });
    const res = await authedFetch("/api/research/run", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg({ ok: "Research run queued. New ideas will appear in a minute or two.", err: "" });
    } else {
      setMsg({ ok: "", err: data.error || "Failed to start research run" });
    }
  }

  async function confirmUseIdea(platform) {
    if (!selectedIdea) return;
    setGenerating(true);
    const res = await authedFetch("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        ideaId: selectedIdea.id,
        topic: selectedIdea.topic,
        angle: selectedIdea.angle,
        pillar: selectedIdea.pillar,
        platform,
      }),
    });
    setGenerating(false);
    if (res.ok) {
      setSelectedIdea(null);
      router.push("/");
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg({ ok: "", err: data.error || "Failed to queue draft generation" });
    }
  }

  const pillarOptions = useMemo(() => {
    const ids = new Set();
    ideas.forEach((i) => i.pillar && ids.add(i.pillar));
    return [...ids];
  }, [ideas]);

  const visible = useMemo(() => {
    let arr = ideas.slice();
    if (statusFilter !== "all") arr = arr.filter((i) => (i.status || "new") === statusFilter);
    if (pillarFilter !== "all") arr = arr.filter((i) => i.pillar === pillarFilter);
    if (sortBy === "relevanceScore") {
      arr.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    } else if (sortBy === "urgency") {
      const rank = { high: 3, normal: 2, low: 1 };
      arr.sort((a, b) => (rank[b.urgency] || 0) - (rank[a.urgency] || 0));
    } else {
      arr.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    }
    return arr;
  }, [ideas, pillarFilter, statusFilter, sortBy]);

  if (!user) {
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
          Ideas Bank
          {activeResearch ? <span style={styles.pendingChip}>Researching…</span> : null}
        </div>
        <nav style={styles.nav}>
          <button style={styles.navLink} onClick={() => router.push("/")}>Dashboard</button>
          <button style={styles.navLink} onClick={() => router.push("/ideas")}>Ideas</button>
          <button style={styles.navLink} onClick={() => router.push("/settings")}>Settings</button>
          <button
            style={styles.navLink}
            onClick={async () => { await signOut(auth); router.replace("/login"); }}
          >Sign out</button>
        </nav>
      </header>

      <div style={styles.main}>
        <div style={styles.toolbar}>
          <select
            style={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All status</option>
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <select
            style={styles.select}
            value={pillarFilter}
            onChange={(e) => setPillarFilter(e.target.value)}
          >
            <option value="all">All pillars</option>
            {pillarOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            style={styles.select}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="relevanceScore">Sort: score</option>
            <option value="urgency">Sort: urgency</option>
            <option value="createdAt">Sort: newest</option>
          </select>
          <div style={{ flex: 1 }} />
          <button
            style={styles.primary}
            onClick={runResearch}
            disabled={activeResearch}
          >
            {activeResearch ? "Researching…" : "Run research now"}
          </button>
        </div>

        {msg.ok ? <div style={{ ...styles.msg, ...styles.msgOk }}>{msg.ok}</div> : null}
        {msg.err ? <div style={{ ...styles.msg, ...styles.msgErr }}>{msg.err}</div> : null}

        {visible.length === 0 ? (
          <div style={styles.empty}>
            {ideas.length === 0
              ? 'No ideas yet. Hit "Run research now" to populate the bank.'
              : "No ideas match those filters."}
          </div>
        ) : (
          visible.map((idea) => {
            const scores = idea.scores || {};
            const urgencyStyle =
              idea.urgency === "high" ? styles.urgencyHigh :
              idea.urgency === "low"  ? styles.urgencyLow  : null;
            return (
              <div key={idea.id} style={styles.card}>
                <div style={styles.cardHead}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.topic}>{idea.topic}</div>
                    {idea.angle ? <div style={styles.angle}>{idea.angle}</div> : null}
                    {idea.reasoning ? <div style={styles.reason}>{idea.reasoning}</div> : null}
                  </div>
                  <div style={styles.scoreBlock}>
                    <div style={styles.bigScore}>{(idea.relevanceScore || 0).toFixed(1)}</div>
                    <div style={styles.scoreLabel}>Composite</div>
                  </div>
                </div>

                {idea.scores ? (
                  <div style={styles.scoreBars}>
                    <ScoreBar label="Relevance" value={scores.relevance} />
                    <ScoreBar label="Novelty" value={scores.novelty} />
                    <ScoreBar label="Voice fit" value={scores.voiceFit} />
                    <ScoreBar label="Urgency" value={scores.urgency} />
                  </div>
                ) : null}

                <div style={styles.badgeRow}>
                  {idea.pillar ? (
                    <span style={{ ...styles.badge, ...styles.pillarBadge }}>{idea.pillar}</span>
                  ) : null}
                  {urgencyStyle ? (
                    <span style={{ ...styles.badge, ...urgencyStyle }}>{idea.urgency}</span>
                  ) : null}
                  <span style={styles.badge}>{idea.source || "manual"}</span>
                  {(idea.sourceLabels || []).map((l, i) => (
                    <span key={i} style={styles.badge}>{l}</span>
                  ))}
                </div>

                {idea.sourceUrls && idea.sourceUrls.length > 0 ? (
                  <div style={styles.sourcesRow}>
                    Sources:{" "}
                    {idea.sourceUrls.slice(0, 5).map((u, i) => (
                      <a
                        key={i}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.sourceLink}
                      >
                        [{i + 1}]
                      </a>
                    ))}
                  </div>
                ) : null}

                <div style={styles.actions}>
                  <button
                    style={styles.primary}
                    onClick={() => setSelectedIdea(idea)}
                    disabled={idea.status === "used"}
                  >
                    {idea.status === "used" ? "Already used" : "Use this idea"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <UseIdeaModal
        idea={selectedIdea}
        onClose={() => setSelectedIdea(null)}
        onConfirm={confirmUseIdea}
        busy={generating}
      />
    </main>
  );
}
