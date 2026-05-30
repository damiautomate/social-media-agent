"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";


import { supabase } from "@/lib/supabase-client.js";

const styles = {
  page: { minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fafafa", fontFamily: "ui-sans-serif, system-ui" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid #18181b" },
  brand: { fontSize: 16, fontWeight: 700 },
  nav: { display: "flex", gap: 16 },
  navLink: { background: "transparent", border: "none", color: "#a1a1aa", fontSize: 13, cursor: "pointer" },
  main: { padding: "24px", maxWidth: 900, margin: "0 auto" },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 6 },
  sub: { color: "#a1a1aa", fontSize: 13, marginBottom: 20, lineHeight: 1.6 },
  section: { border: "1px solid #18181b", backgroundColor: "#0f0f10", borderRadius: 12, padding: 18, marginBottom: 14 },
  label: { display: "block", fontSize: 12, color: "#a1a1aa", marginBottom: 6, marginTop: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { width: "100%", padding: "9px 11px", backgroundColor: "#09090b", color: "#fafafa", border: "1px solid #27272a", borderRadius: 8, fontSize: 13, boxSizing: "border-box" },
  textarea: { width: "100%", padding: "10px 12px", backgroundColor: "#09090b", color: "#fafafa", border: "1px solid #27272a", borderRadius: 8, fontSize: 13, boxSizing: "border-box", minHeight: 100, fontFamily: "inherit", lineHeight: 1.5 },
  primary: { padding: "9px 16px", backgroundColor: "#7c3aed", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 },
  ghost: { padding: "9px 16px", backgroundColor: "transparent", color: "#e4e4e7", border: "1px solid #27272a", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  danger: { padding: "9px 16px", backgroundColor: "transparent", color: "#fca5a5", border: "1px solid #7f1d1d", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  hint: { color: "#71717a", fontSize: 11, marginTop: 4, lineHeight: 1.5 },
  pillarRow: { padding: 12, border: "1px solid #27272a", borderRadius: 8, marginBottom: 8 },
  chip: { display: "inline-block", padding: "3px 9px", backgroundColor: "#312e81", color: "#c7d2fe", borderRadius: 999, fontSize: 11, marginRight: 6, marginBottom: 4 },
  arrayInput: { width: "100%", padding: "7px 10px", backgroundColor: "#09090b", color: "#fafafa", border: "1px solid #27272a", borderRadius: 6, fontSize: 12, boxSizing: "border-box", marginBottom: 4 },
  loading: { padding: 40, textAlign: "center", color: "#a1a1aa" },
  spinner: { display: "inline-block", width: 24, height: 24, border: "3px solid #27272a", borderTopColor: "#a78bfa", borderRadius: "50%", animation: "spin 1s linear infinite" },
  err: { padding: 12, backgroundColor: "#450a0a", color: "#fca5a5", border: "1px solid #7f1d1d", borderRadius: 8, fontSize: 13, marginBottom: 12 },
  ok: { padding: 12, backgroundColor: "#052e16", color: "#86efac", border: "1px solid #14532d", borderRadius: 8, fontSize: 13, marginBottom: 12 },
  sectionToggle: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#e4e4e7", cursor: "pointer", marginBottom: 8 },
  weightSum: { fontSize: 12, color: "#a1a1aa", marginTop: 6 },
  weightSumBad: { color: "#fca5a5" },
};

const spinKeyframes = `@keyframes spin { to { transform: rotate(360deg); } }`;

// Tag list editor — comma-joined input that splits on save.
function ArrayEditor({ values, onChange, placeholder }) {
  const [raw, setRaw] = useState((values || []).join("\n"));
  useEffect(() => { setRaw((values || []).join("\n")); }, [values]);
  return (
    <textarea
      style={{ ...styles.textarea, minHeight: 70 }}
      placeholder={placeholder}
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        const arr = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean);
        onChange(arr);
      }}
    />
  );
}

function PillarEditor({ pillar, onChange, onRemove }) {
  return (
    <div style={styles.pillarRow}>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px auto", gap: 8, alignItems: "center" }}>
        <input
          style={styles.input}
          placeholder="id"
          value={pillar.id || ""}
          onChange={(e) => onChange({ ...pillar, id: e.target.value })}
        />
        <input
          style={styles.input}
          placeholder="Name"
          value={pillar.name || ""}
          onChange={(e) => onChange({ ...pillar, name: e.target.value })}
        />
        <input
          style={styles.input}
          type="number"
          min={0}
          max={100}
          placeholder="weight"
          value={pillar.weight ?? 0}
          onChange={(e) => onChange({ ...pillar, weight: Number(e.target.value) || 0 })}
        />
        <button style={styles.danger} onClick={onRemove}>×</button>
      </div>
      <textarea
        style={{ ...styles.textarea, marginTop: 8, minHeight: 50 }}
        placeholder="Description"
        value={pillar.description || ""}
        onChange={(e) => onChange({ ...pillar, description: e.target.value })}
      />
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>Angles (one per line)</div>
        <ArrayEditor
          values={pillar.angles || []}
          onChange={(arr) => onChange({ ...pillar, angles: arr })}
          placeholder="Specific angles to write about"
        />
      </div>
    </div>
  );
}

export default function BootstrapPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  // Input form
  const [bio, setBio] = useState("");
  const [postsBlob, setPostsBlob] = useState("");
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [userNotes, setUserNotes] = useState("");

  // Flow state
  const [proposal, setProposal] = useState(null);   // from Firestore subscription
  const [busy, setBusy] = useState(false);          // submitting "Analyze"
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Editable copy of the proposal for review
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
      if (!session) router.replace("/login");
      else setUser(session.user);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  // Load proposal + subscribe to realtime updates on the user's bootstrap_proposals row
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
    return fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async function runAnalysis() {
    setErr(""); setOk(""); setBusy(true);
    const res = await authedFetch("/api/bootstrap/run", {
      method: "POST",
      body: JSON.stringify({ bio, postsBlob, youtubeChannelId, userNotes }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Analysis failed to start");
      return;
    }
    setOk("Analysis queued. This usually takes 30-60 seconds…");
  }

  async function applyProposal() {
    setErr(""); setOk("");
    const res = await authedFetch("/api/bootstrap/apply", {
      method: "POST",
      body: JSON.stringify({
        sections: {
          identity: applyIdentity,
          voice: applyVoice,
          contentPillars: applyPillars,
        },
        editedProposal: {
          identity: editIdentity,
          voice: editVoice,
          contentPillars: editPillars,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Apply failed");
      return;
    }
    setOk("Applied to your brand config!");
    setTimeout(() => router.push("/settings"), 1200);
  }

  async function dismissProposal() {
    setErr(""); setOk("");
    const res = await authedFetch("/api/bootstrap/dismiss", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Dismiss failed");
      return;
    }
    // Local clear; Firestore subscription will refresh
    setOk("Discarded. You can run a new analysis any time.");
  }

  const pillarWeightSum = useMemo(
    () => (editPillars || []).reduce((s, p) => s + (Number(p.weight) || 0), 0),
    [editPillars],
  );

  if (!user) {
    return (
      <main style={styles.page}>
        <div style={styles.loading}>Loading…</div>
      </main>
    );
  }

  // STATE: in-progress (job queued/processing)
  const inProgress = proposal && (proposal.status === "pending" && !proposal.proposal);
  // Actually: the proposal doc only gets written AFTER the function completes,
  // so seeing it usually means it's ready. We'll check pending_jobs subscription
  // for "in flight" state instead. For now, infer from local busy flag.

  // STATE: have a pending proposal to review
  const hasPending = proposal && proposal.status === "pending" && proposal.proposal;

  return (
    <main style={styles.page}>
      <style>{spinKeyframes}</style>
      <header style={styles.header}>
        <div style={styles.brand}>Brand Bootstrap</div>
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
        {err ? <div style={styles.err}>{err}</div> : null}
        {ok ? <div style={styles.ok}>{ok}</div> : null}

        {!hasPending ? (
          <>
            <h1 style={styles.h1}>Bootstrap your brand from your existing content</h1>
            <p style={styles.sub}>
              Paste your bio and a handful of representative posts you've written. The AI will read them and propose your identity, voice, signature phrases, and content pillars — saving you from filling out Settings field-by-field. You can edit everything before applying.
            </p>

            <div style={styles.section}>
              <label style={styles.label}>Your bio / about section</label>
              <textarea
                style={styles.textarea}
                placeholder="What you'd put in your LinkedIn About, Twitter bio, or website intro. A paragraph or two is fine."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />

              <label style={styles.label}>5-10 representative posts you've written</label>
              <div style={styles.hint}>
                Paste your best/most representative posts, separated by a blank line OR by <code>---</code> on its own line. Pick posts that genuinely sound like you, not your most polished or most viral ones.
              </div>
              <textarea
                style={{ ...styles.textarea, minHeight: 280, marginTop: 6 }}
                placeholder={"Post 1 text here\n\n---\n\nPost 2 text here\n\n---\n\nPost 3 text here"}
                value={postsBlob}
                onChange={(e) => setPostsBlob(e.target.value)}
              />

              <label style={styles.label}>YouTube channel ID (optional)</label>
              <div style={styles.hint}>
                If you have a YouTube channel, the analyzer will also read your recent video titles + descriptions. Channel ID starts with <code>UC...</code> — find it in any channel video's page source.
              </div>
              <input
                style={styles.input}
                placeholder="UCxxxxxxxxxxxxxxxxxxxx"
                value={youtubeChannelId}
                onChange={(e) => setYoutubeChannelId(e.target.value)}
              />

              <label style={styles.label}>Notes for the AI (optional)</label>
              <div style={styles.hint}>
                Anything you want the analyzer to know — e.g. "weight automation higher than CRM", "my audience is mostly freelancers, not founders", "avoid generic marketing-speak pillars".
              </div>
              <textarea
                style={{ ...styles.textarea, minHeight: 70 }}
                placeholder="(Optional)"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
              />

              <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                <button style={styles.ghost} onClick={() => router.push("/settings")}>
                  Cancel
                </button>
                <button style={styles.primary} onClick={runAnalysis} disabled={busy}>
                  {busy ? "Queueing…" : "Analyze and propose profile"}
                </button>
              </div>
            </div>

            {busy || (ok && ok.includes("queued")) ? (
              <div style={styles.section}>
                <div style={styles.loading}>
                  <div style={styles.spinner}></div>
                  <div style={{ marginTop: 12 }}>Analyzing your content… this page will update automatically when ready.</div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h1 style={styles.h1}>Review your proposed brand profile</h1>
            <p style={styles.sub}>
              The analyzer's proposal is below. Edit any field, untick sections you don't want to apply, and hit Apply when you're happy. Or discard and start over.
            </p>

            {proposal?.proposal?.analystNotes ? (
              <div style={{ ...styles.section, fontStyle: "italic", color: "#a1a1aa", fontSize: 13 }}>
                <strong style={{ color: "#e4e4e7", fontStyle: "normal" }}>Analyst notes: </strong>
                {proposal.proposal.analystNotes}
              </div>
            ) : null}

            <div style={styles.section}>
              <label style={styles.sectionToggle}>
                <input
                  type="checkbox"
                  checked={applyIdentity}
                  onChange={(e) => setApplyIdentity(e.target.checked)}
                />
                Apply Identity
              </label>
              <label style={styles.label}>Name</label>
              <input
                style={styles.input}
                value={editIdentity?.name || ""}
                onChange={(e) => setEditIdentity({ ...editIdentity, name: e.target.value })}
                disabled={!applyIdentity}
              />
              <label style={styles.label}>Handle (without @)</label>
              <input
                style={styles.input}
                value={editIdentity?.handle || ""}
                onChange={(e) => setEditIdentity({ ...editIdentity, handle: e.target.value })}
                disabled={!applyIdentity}
              />
              <label style={styles.label}>Tagline</label>
              <textarea
                style={{ ...styles.textarea, minHeight: 60 }}
                value={editIdentity?.tagline || ""}
                onChange={(e) => setEditIdentity({ ...editIdentity, tagline: e.target.value })}
                disabled={!applyIdentity}
              />
            </div>

            <div style={styles.section}>
              <label style={styles.sectionToggle}>
                <input
                  type="checkbox"
                  checked={applyVoice}
                  onChange={(e) => setApplyVoice(e.target.checked)}
                />
                Apply Voice
              </label>

              <label style={styles.label}>Tone descriptors (one per line)</label>
              <ArrayEditor
                values={editVoice?.tone || []}
                onChange={(arr) => setEditVoice({ ...editVoice, tone: arr })}
              />

              <label style={styles.label}>Signature phrases</label>
              <div style={styles.hint}>Phrases the AI will reach for when writing in your voice.</div>
              <ArrayEditor
                values={editVoice?.signaturePhrases || []}
                onChange={(arr) => setEditVoice({ ...editVoice, signaturePhrases: arr })}
              />

              <label style={styles.label}>Avoid phrases</label>
              <div style={styles.hint}>Phrases the AI will never produce.</div>
              <ArrayEditor
                values={editVoice?.avoidPhrases || []}
                onChange={(arr) => setEditVoice({ ...editVoice, avoidPhrases: arr })}
              />

              <label style={styles.label}>Sample posts ({(editVoice?.samplePosts || []).length})</label>
              <div style={styles.hint}>The analyzer picked these as the most representative of your voice. They'll be used as voice anchors in every draft generation.</div>
              {(editVoice?.samplePosts || []).map((s, i) => (
                <div key={i} style={{ ...styles.pillarRow, marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>Platform: {s.platform || "unknown"}</div>
                  <textarea
                    style={{ ...styles.textarea, minHeight: 70 }}
                    value={s.text || ""}
                    onChange={(e) => {
                      const list = [...editVoice.samplePosts];
                      list[i] = { ...s, text: e.target.value };
                      setEditVoice({ ...editVoice, samplePosts: list });
                    }}
                  />
                  <button
                    style={{ ...styles.danger, marginTop: 6 }}
                    onClick={() => {
                      const list = editVoice.samplePosts.filter((_, idx) => idx !== i);
                      setEditVoice({ ...editVoice, samplePosts: list });
                    }}
                  >Remove</button>
                </div>
              ))}
            </div>

            <div style={styles.section}>
              <label style={styles.sectionToggle}>
                <input
                  type="checkbox"
                  checked={applyPillars}
                  onChange={(e) => setApplyPillars(e.target.checked)}
                />
                Apply Content Pillars ({(editPillars || []).length})
              </label>

              {(editPillars || []).map((p, i) => (
                <PillarEditor
                  key={i}
                  pillar={p}
                  onChange={(updated) => {
                    const list = [...editPillars];
                    list[i] = updated;
                    setEditPillars(list);
                  }}
                  onRemove={() => setEditPillars(editPillars.filter((_, idx) => idx !== i))}
                />
              ))}

              <button
                style={{ ...styles.ghost, marginTop: 8 }}
                onClick={() => setEditPillars([
                  ...(editPillars || []),
                  { id: `pillar_${Date.now()}`, name: "New Pillar", description: "", weight: 0, angles: [] },
                ])}
              >+ Add pillar</button>

              <div
                style={{
                  ...styles.weightSum,
                  ...(pillarWeightSum !== 100 ? styles.weightSumBad : {}),
                }}
              >
                Weights sum: {pillarWeightSum} {pillarWeightSum !== 100 ? "(should be 100)" : "✓"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button style={styles.danger} onClick={dismissProposal}>Discard proposal</button>
              <button style={styles.primary} onClick={applyProposal}>Apply to my brand config</button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
