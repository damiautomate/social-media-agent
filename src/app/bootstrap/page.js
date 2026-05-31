"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";
import { AppShell } from "@/components/AppShell.js";

// Newline-list editor
function ArrayEditor({ values, onChange, placeholder }) {
  const [raw, setRaw] = useState((values || []).join("\n"));
  useEffect(() => { setRaw((values || []).join("\n")); }, [values]);
  return (
    <textarea className="textarea" style={{ minHeight: 72 }} placeholder={placeholder} value={raw}
      onChange={(e) => { setRaw(e.target.value); onChange(e.target.value.split("\n").map((x) => x.trim()).filter(Boolean)); }} />
  );
}

function PillarEditor({ pillar, onChange, onRemove }) {
  return (
    <div className="card card-pad" style={{ marginBottom: 10, background: "var(--bg-2)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px auto", gap: 8, alignItems: "center" }}>
        <input className="input" placeholder="id" value={pillar.id || ""} onChange={(e) => onChange({ ...pillar, id: e.target.value })} />
        <input className="input" placeholder="Name" value={pillar.name || ""} onChange={(e) => onChange({ ...pillar, name: e.target.value })} />
        <input className="input" type="number" min={0} max={100} placeholder="wt" value={pillar.weight ?? 0} onChange={(e) => onChange({ ...pillar, weight: Number(e.target.value) || 0 })} />
        <button className="btn btn-sm btn-rose" onClick={onRemove}>×</button>
      </div>
      <textarea className="textarea" style={{ marginTop: 8, minHeight: 50 }} placeholder="Description" value={pillar.description || ""} onChange={(e) => onChange({ ...pillar, description: e.target.value })} />
      <div style={{ marginTop: 8 }}>
        <div className="label">Angles (one per line)</div>
        <ArrayEditor values={pillar.angles || []} onChange={(arr) => onChange({ ...pillar, angles: arr })} placeholder="Specific angles to write about" />
      </div>
    </div>
  );
}

export default function BootstrapPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  const [bio, setBio] = useState("");
  const [postsBlob, setPostsBlob] = useState("");
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [userNotes, setUserNotes] = useState("");

  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [editIdentity, setEditIdentity] = useState(null);
  const [editVoice, setEditVoice] = useState(null);
  const [editPillars, setEditPillars] = useState(null);
  const [applyIdentity, setApplyIdentity] = useState(true);
  const [applyVoice, setApplyVoice] = useState(true);
  const [applyPillars, setApplyPillars] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) router.replace("/login");
      else setUser(data.session.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login"); else setUser(session.user);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    function applyRow(data) {
      if (!data) { setProposal(null); return; }
      setProposal(data);
      if (data.status === "pending" && data.proposal) {
        setEditIdentity({ ...data.proposal.identity });
        setEditVoice({ ...data.proposal.voice });
        setEditPillars([...(data.proposal.contentPillars || [])]);
      }
    }
    supabase.from("bootstrap_proposals").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (active) applyRow(data); });
    const ch = supabase
      .channel("bootstrap_" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "bootstrap_proposals", filter: `user_id=eq.${user.id}` },
        (payload) => { if (active) applyRow(payload.new); })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [user]);

  async function authedFetch(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }

  async function runAnalysis() {
    setErr(""); setOk(""); setBusy(true);
    const res = await authedFetch("/api/bootstrap/run", { method: "POST", body: JSON.stringify({ bio, postsBlob, youtubeChannelId, userNotes }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Analysis failed to start"); return; }
    setOk("Analysis queued. This usually takes 30-60 seconds…");
  }

  async function applyProposal() {
    setErr(""); setOk("");
    const res = await authedFetch("/api/bootstrap/apply", {
      method: "POST",
      body: JSON.stringify({
        sections: { identity: applyIdentity, voice: applyVoice, contentPillars: applyPillars },
        editedProposal: { identity: editIdentity, voice: editVoice, contentPillars: editPillars },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "Apply failed"); return; }
    setOk("Applied to your brand config!");
    setTimeout(() => router.push("/settings"), 1200);
  }

  async function dismissProposal() {
    setErr(""); setOk("");
    const res = await authedFetch("/api/bootstrap/dismiss", { method: "POST" });
    if (!res.ok) { const data = await res.json().catch(() => ({})); setErr(data.error || "Dismiss failed"); return; }
    setOk("Discarded. You can run a new analysis any time.");
  }

  async function logout() { await supabase.auth.signOut(); router.replace("/login"); }

  const pillarWeightSum = useMemo(() => (editPillars || []).reduce((s, p) => s + (Number(p.weight) || 0), 0), [editPillars]);

  if (!user) {
    return <AppShell active="bootstrap" onSignOut={logout}><main className="main"><div className="skeleton" style={{ height: 300 }} /></main></AppShell>;
  }

  const hasPending = proposal && proposal.status === "pending" && proposal.proposal;

  return (
    <AppShell active="bootstrap" onSignOut={logout}>
      <main className="main">
        <div className="page-head">
          <div className="eyebrow">Brand Bootstrap</div>
          <h1 className="page-title">{hasPending ? "Review your profile" : "Bootstrap your brand"}</h1>
          <p className="page-sub">{hasPending ? "Edit anything, untick sections to skip, then apply." : "Let AI read your existing content and propose your voice, phrases, and pillars."}</p>
        </div>

        {err ? <div className="note note-err" style={{ marginTop: 0, marginBottom: 14 }}>{err}</div> : null}
        {ok ? <div className="note note-ok" style={{ marginTop: 0, marginBottom: 14 }}>{ok}</div> : null}

        {!hasPending ? (
          <>
            <div className="card card-pad">
              <div className="field">
                <label className="label">Your bio / about section</label>
                <textarea className="textarea" placeholder="What you'd put in your LinkedIn About, Twitter bio, or website intro. A paragraph or two is fine." value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">5-10 representative posts you've written</label>
                <div className="section-desc" style={{ marginBottom: 6 }}>Separate posts with a blank line or <code>---</code> on its own line. Pick ones that genuinely sound like you.</div>
                <textarea className="textarea" style={{ minHeight: 240 }} placeholder={"Post 1 text here\n\n---\n\nPost 2 text here"} value={postsBlob} onChange={(e) => setPostsBlob(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">YouTube channel ID <span style={{ color: "var(--ink-4)" }}>· optional</span></label>
                <div className="section-desc" style={{ marginBottom: 6 }}>Starts with <code>UC…</code> — the analyzer reads your recent video titles + descriptions too.</div>
                <input className="input" placeholder="UCxxxxxxxxxxxxxxxxxxxx" value={youtubeChannelId} onChange={(e) => setYoutubeChannelId(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Notes for the AI <span style={{ color: "var(--ink-4)" }}>· optional</span></label>
                <textarea className="textarea" style={{ minHeight: 64 }} placeholder='e.g. "weight automation higher than CRM", "audience is freelancers not founders"' value={userNotes} onChange={(e) => setUserNotes(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-soft" onClick={() => router.push("/settings")}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={runAnalysis} disabled={busy}>{busy ? "Queuing…" : "Analyze & propose profile"}</button>
              </div>
            </div>

            {busy || (ok && ok.includes("queued")) ? (
              <div className="card card-pad" style={{ marginTop: 14, textAlign: "center", color: "var(--ink-2)" }}>
                <span className="dot spin" style={{ background: "var(--accent-hi)", width: 16, height: 16, display: "inline-block" }} />
                <div style={{ marginTop: 12, fontSize: 13 }}>Analyzing your content… this page updates automatically when ready.</div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {proposal?.proposal?.analystNotes ? (
              <div className="note note-info" style={{ marginTop: 0, marginBottom: 14 }}>
                <strong>Analyst notes: </strong>{proposal.proposal.analystNotes}
              </div>
            ) : null}

            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <label className="keystat" style={{ cursor: "pointer", marginBottom: 14 }}>
                <input type="checkbox" checked={applyIdentity} onChange={(e) => setApplyIdentity(e.target.checked)} />
                <strong style={{ color: "var(--ink)" }}>Apply Identity</strong>
              </label>
              <div className="field"><label className="label">Name</label><input className="input" value={editIdentity?.name || ""} onChange={(e) => setEditIdentity({ ...editIdentity, name: e.target.value })} disabled={!applyIdentity} /></div>
              <div className="field"><label className="label">Handle (without @)</label><input className="input" value={editIdentity?.handle || ""} onChange={(e) => setEditIdentity({ ...editIdentity, handle: e.target.value })} disabled={!applyIdentity} /></div>
              <div className="field"><label className="label">Tagline</label><textarea className="textarea" style={{ minHeight: 56 }} value={editIdentity?.tagline || ""} onChange={(e) => setEditIdentity({ ...editIdentity, tagline: e.target.value })} disabled={!applyIdentity} /></div>
            </div>

            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <label className="keystat" style={{ cursor: "pointer", marginBottom: 14 }}>
                <input type="checkbox" checked={applyVoice} onChange={(e) => setApplyVoice(e.target.checked)} />
                <strong style={{ color: "var(--ink)" }}>Apply Voice</strong>
              </label>
              <div className="field"><label className="label">Tone descriptors (one per line)</label><ArrayEditor values={editVoice?.tone || []} onChange={(arr) => setEditVoice({ ...editVoice, tone: arr })} /></div>
              <div className="field"><label className="label">Signature phrases</label><div className="section-desc" style={{ marginBottom: 6 }}>Phrases the AI reaches for in your voice.</div><ArrayEditor values={editVoice?.signaturePhrases || []} onChange={(arr) => setEditVoice({ ...editVoice, signaturePhrases: arr })} /></div>
              <div className="field"><label className="label">Avoid phrases</label><div className="section-desc" style={{ marginBottom: 6 }}>Phrases the AI never produces.</div><ArrayEditor values={editVoice?.avoidPhrases || []} onChange={(arr) => setEditVoice({ ...editVoice, avoidPhrases: arr })} /></div>
              <label className="label">Sample posts ({(editVoice?.samplePosts || []).length})</label>
              <div className="section-desc" style={{ marginBottom: 6 }}>Used as voice anchors in every draft.</div>
              {(editVoice?.samplePosts || []).map((s, i) => (
                <div key={i} className="card card-pad" style={{ marginBottom: 8, background: "var(--bg-2)" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>Platform: {s.platform || "unknown"}</div>
                  <textarea className="textarea" style={{ minHeight: 70 }} value={s.text || ""} onChange={(e) => { const list = [...editVoice.samplePosts]; list[i] = { ...s, text: e.target.value }; setEditVoice({ ...editVoice, samplePosts: list }); }} />
                  <button className="btn btn-sm btn-rose" style={{ marginTop: 6 }} onClick={() => { const list = editVoice.samplePosts.filter((_, idx) => idx !== i); setEditVoice({ ...editVoice, samplePosts: list }); }}>Remove</button>
                </div>
              ))}
            </div>

            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <label className="keystat" style={{ cursor: "pointer", marginBottom: 14 }}>
                <input type="checkbox" checked={applyPillars} onChange={(e) => setApplyPillars(e.target.checked)} />
                <strong style={{ color: "var(--ink)" }}>Apply Content Pillars ({(editPillars || []).length})</strong>
              </label>
              {(editPillars || []).map((p, i) => (
                <PillarEditor key={i} pillar={p}
                  onChange={(updated) => { const list = [...editPillars]; list[i] = updated; setEditPillars(list); }}
                  onRemove={() => setEditPillars(editPillars.filter((_, idx) => idx !== i))} />
              ))}
              <button className="btn btn-soft btn-sm" onClick={() => setEditPillars([...(editPillars || []), { id: `pillar_${Date.now()}`, name: "New Pillar", description: "", weight: 0, angles: [] }])}>+ Add pillar</button>
              <div className="note" style={{ marginTop: 12, ...(pillarWeightSum !== 100 ? {} : {}) }}>
                <span style={{ color: pillarWeightSum === 100 ? "var(--mint)" : "var(--amber)" }}>
                  Weights sum: {pillarWeightSum} {pillarWeightSum !== 100 ? "(should be 100)" : "✓"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-rose" onClick={dismissProposal}>Discard</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={applyProposal}>Apply to brand config</button>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
