"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";
import { AppShell } from "@/components/AppShell.js";

export default function InsightsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({ reactions: "", comments: "", shares: "", impressions: "" });

  useEffect(() => {
    let m = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!m) return;
      if (!data.session) { router.replace("/login"); return; }
      setUser(data.session.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) router.replace("/login"); });
    return () => { m = false; sub.subscription.unsubscribe(); };
  }, [router]);

  async function authedFetch(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    return fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" } });
  }
  async function load() {
    const res = await authedFetch("/api/insights");
    if (res.ok) setData(await res.json());
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function refresh() {
    setRefreshing(true); setMsg({ ok: "", err: "" });
    const res = await authedFetch("/api/metrics/refresh", { method: "POST" });
    if (res.ok) {
      setMsg({ ok: "Refreshing metrics from platforms — numbers update in a few seconds.", err: "" });
      setTimeout(() => { load(); setRefreshing(false); }, 6000);
    } else { setRefreshing(false); const d = await res.json().catch(() => ({})); setMsg({ ok: "", err: d.error || "Could not start refresh" }); }
  }

  function openEdit(p) { setEditId(p.id); setEditVals({ reactions: p.reactions ?? "", comments: p.comments ?? "", shares: p.shares ?? "", impressions: p.impressions ?? "" }); }
  async function saveEdit(id) {
    const res = await authedFetch("/api/metrics/manual", { method: "POST", body: JSON.stringify({ id, ...editVals }) });
    if (res.ok) { setEditId(null); load(); } else { setMsg({ ok: "", err: "Save failed" }); }
  }
  async function logout() { await supabase.auth.signOut(); router.replace("/login"); }

  if (!user || !data) {
    return <AppShell active="insights" onSignOut={logout}><main className="main"><div className="page-head"><div className="skeleton" style={{ height: 36, width: 160 }} /></div><div className="skeleton" style={{ height: 280 }} /></main></AppShell>;
  }

  return (
    <AppShell active="insights" onSignOut={logout}>
      <main className="main">
        <div className="page-head head-row">
          <div>
            <div className="eyebrow">Learning</div>
            <h1 className="page-title">What's working</h1>
            <p className="page-sub">{data.totals.measured} of {data.totals.posts} posts measured · {data.totals.totalEngagement} total engagements</p>
          </div>
          <button className="btn btn-primary only-desktop" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh metrics"}</button>
        </div>

        {msg.ok ? <div className="note note-ok" style={{ marginTop: 0, marginBottom: 14 }}>{msg.ok}</div> : null}
        {msg.err ? <div className="note note-err" style={{ marginTop: 0, marginBottom: 14 }}>{msg.err}</div> : null}

        {data.totals.measured === 0 ? (
          <div className="note note-info" style={{ marginBottom: 18 }}>
            No measured posts yet. Publish a few, give them a day to gather engagement, then tap <strong>Refresh metrics</strong>. For platforms whose API won&rsquo;t share numbers, tap a post below and enter them manually.
          </div>
        ) : null}

        <Breakdown title="By media type" rows={data.byMediaType} />
        <Breakdown title="By card layout" rows={data.byLayout} />
        <Breakdown title="By pillar" rows={data.byPillar} />

        <h2 className="section-title" style={{ margin: "24px 0 12px" }}>Recent posts</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.posts.map((p) => (
            <div key={p.id} className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div className="draft-meta-row">
                  <span className="chip">{p.platform}</span>
                  <span className="chip">{p.mediaType}{p.layout ? ` · ${p.layout}` : ""}</span>
                  {p.pillar ? <span className="chip">{p.pillar}</span> : null}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-4)" }}>{p.postedAt ? new Date(p.postedAt).toLocaleDateString() : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 13, color: "var(--ink-2)", flexWrap: "wrap" }}>
                <span><strong style={{ color: "var(--ink)" }}>{p.engagement ?? 0}</strong> eng</span>
                <span>{p.reactions ?? 0} reactions</span>
                <span>{p.comments ?? 0} comments</span>
                <span>{p.shares ?? 0} shares</span>
                <span>{p.impressions != null ? `${p.impressions} impr` : "impr —"}</span>
                {p.measured ? <span className="badge" style={{ background: "rgba(52,211,153,.14)", color: "var(--mint)" }}>{p.source}</span> : <span className="badge" style={{ background: "rgba(124,124,136,.15)", color: "var(--ink-3)" }}>not measured</span>}
              </div>
              {editId === p.id ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["reactions", "comments", "shares", "impressions"].map((f) => (
                      <div key={f} style={{ flex: 1, minWidth: 90 }}>
                        <label className="label">{f}</label>
                        <input className="input" type="number" value={editVals[f]} onChange={(e) => setEditVals({ ...editVals, [f]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => saveEdit(p.id)}>Save</button>
                    <button className="btn btn-sm btn-soft" onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-sm btn-soft" style={{ marginTop: 10 }} onClick={() => openEdit(p)}>Enter metrics manually</button>
              )}
            </div>
          ))}
        </div>
      </main>

      <button className="fab" onClick={refresh} disabled={refreshing} aria-label="Refresh metrics">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
      </button>
    </AppShell>
  );
}

function Breakdown({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.avgEngagement || 0), 1);
  return (
    <div className="card card-pad" style={{ marginBottom: 12 }}>
      <h2 className="section-title" style={{ fontSize: 15, marginBottom: 12 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: "var(--ink)", textTransform: "capitalize" }}>{r.key} <span style={{ color: "var(--ink-4)" }}>· {r.posts} post{r.posts !== 1 ? "s" : ""}</span></span>
              <span style={{ color: "var(--ink-2)" }}>{r.avgEngagement == null ? "—" : `${r.avgEngagement} avg`}</span>
            </div>
            <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${((r.avgEngagement || 0) / max) * 100}%`, background: "var(--accent-hi)", borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
