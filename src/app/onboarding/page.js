"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase-client.js";

const styles = {
  page: { minHeight: "100vh", padding: "32px 16px" },
  shell: { maxWidth: 720, margin: "0 auto" },
  card: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 12,
    padding: 28,
  },
  step: { color: "#a1a1aa", fontSize: 12, marginBottom: 6 },
  h1: { fontSize: 24, margin: 0, marginBottom: 6 },
  p: { color: "#a1a1aa", lineHeight: 1.5 },
  label: { display: "block", fontSize: 12, color: "#a1a1aa", marginTop: 14, marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "#09090b",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "#09090b",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
    minHeight: 100,
    fontFamily: "inherit",
  },
  row: { display: "flex", gap: 12, marginTop: 20, justifyContent: "space-between" },
  primary: {
    padding: "10px 18px",
    backgroundColor: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  ghost: {
    padding: "10px 18px",
    backgroundColor: "transparent",
    color: "#a1a1aa",
    border: "1px solid #27272a",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
  },
  err: {
    backgroundColor: "#3f1d1d",
    color: "#fca5a5",
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 13,
    marginTop: 12,
  },
  pillarRow: {
    display: "grid",
    gridTemplateColumns: "1fr 80px",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
  },
  sampleBlock: {
    backgroundColor: "#09090b",
    border: "1px solid #27272a",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
};

const PLATFORMS = ["linkedin", "instagram", "tiktok", "facebook"];

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [identity, setIdentity] = useState({ name: "", handle: "", tagline: "" });
  const [pillars, setPillars] = useState([]);
  const [samples, setSamples] = useState([
    { platform: "linkedin", text: "", engagement: "" },
  ]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      const token = await u.getIdToken();
      const res = await fetch("/api/brand-config", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { brandConfig } = await res.json();
        if (brandConfig) {
          setIdentity({
            name: brandConfig.identity?.name || u.displayName || "",
            handle: brandConfig.identity?.handle || "",
            tagline: brandConfig.identity?.tagline || "",
          });
          setPillars(brandConfig.contentPillars || []);
        }
      }
    });
    return unsub;
  }, [router]);

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

  async function saveApiKey() {
    setError("");
    setBusy(true);
    const res = await authedFetch("/api/api-key", {
      method: "POST",
      body: JSON.stringify({ apiKey }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error + (data.detail ? `: ${data.detail}` : ""));
      return false;
    }
    return true;
  }

  async function saveIdentity() {
    setBusy(true);
    const res = await authedFetch("/api/brand-config", {
      method: "PUT",
      body: JSON.stringify({ identity }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Failed to save identity");
      return false;
    }
    return true;
  }

  async function savePillars() {
    setBusy(true);
    const res = await authedFetch("/api/brand-config", {
      method: "PUT",
      body: JSON.stringify({ contentPillars: pillars }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Failed to save pillars");
      return false;
    }
    return true;
  }

  async function saveSamples() {
    setBusy(true);
    const cleaned = samples
      .map((s) => ({ ...s, text: (s.text || "").trim() }))
      .filter((s) => s.text.length > 0);
    const res = await authedFetch("/api/brand-config", {
      method: "PUT",
      body: JSON.stringify({ voice: { samplePosts: cleaned } }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Failed to save samples");
      return false;
    }
    return true;
  }

  async function finish() {
    setBusy(true);
    const res = await authedFetch("/api/onboarding/complete", { method: "POST" });
    setBusy(false);
    if (res.ok) router.replace("/");
  }

  if (!user) {
    return <main style={styles.page}><div style={styles.shell}>Loading…</div></main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card}>
          <div style={styles.step}>Step {step} of 6</div>

          {step === 1 && (
            <>
              <h1 style={styles.h1}>Welcome.</h1>
              <p style={styles.p}>
                This tool helps you stay consistent across LinkedIn, Instagram,
                TikTok, and Facebook by automating research, drafting, review, and
                scheduling. Phase 1 covers drafting and review. You bring your own
                Anthropic API key — generations are billed to you.
              </p>
              <div style={styles.row}>
                <span />
                <button style={styles.primary} onClick={() => setStep(2)}>Continue</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={styles.h1}>Add your Anthropic API key</h1>
              <p style={styles.p}>
                Get a key at <span style={{ color: "#a78bfa" }}>console.anthropic.com</span>{" "}
                → API keys. Stored privately on your account and used only for
                your own generations. We&apos;ll make a tiny test call to verify it.
              </p>
              <label style={styles.label}>API key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                style={styles.input}
              />
              {error ? <div style={styles.err}>{error}</div> : null}
              <div style={styles.row}>
                <button style={styles.ghost} onClick={() => setStep(1)}>Back</button>
                <button
                  style={styles.primary}
                  disabled={busy || !apiKey}
                  onClick={async () => {
                    if (await saveApiKey()) setStep(3);
                  }}
                >
                  {busy ? "Verifying..." : "Verify and continue"}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 style={styles.h1}>Brand identity</h1>
              <p style={styles.p}>How do you want the AI to refer to you?</p>
              <label style={styles.label}>Display name</label>
              <input
                style={styles.input}
                value={identity.name}
                onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
              />
              <label style={styles.label}>Handle (without @)</label>
              <input
                style={styles.input}
                value={identity.handle}
                onChange={(e) => setIdentity({ ...identity, handle: e.target.value })}
              />
              <label style={styles.label}>One-line tagline</label>
              <input
                style={styles.input}
                value={identity.tagline}
                onChange={(e) => setIdentity({ ...identity, tagline: e.target.value })}
              />
              {error ? <div style={styles.err}>{error}</div> : null}
              <div style={styles.row}>
                <button style={styles.ghost} onClick={() => setStep(2)}>Back</button>
                <button
                  style={styles.primary}
                  disabled={busy}
                  onClick={async () => {
                    if (await saveIdentity()) setStep(4);
                  }}
                >Continue</button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 style={styles.h1}>Content pillars</h1>
              <p style={styles.p}>
                These are your topical lanes. Defaults are pre-filled — adjust
                weights so they total ~100, or skip and edit later.
              </p>
              {pillars.map((p, idx) => (
                <div key={p.id || idx} style={{ marginTop: 16 }}>
                  <div style={styles.pillarRow}>
                    <input
                      style={styles.input}
                      value={p.name}
                      onChange={(e) => {
                        const copy = [...pillars];
                        copy[idx] = { ...p, name: e.target.value };
                        setPillars(copy);
                      }}
                    />
                    <input
                      style={styles.input}
                      type="number"
                      min={0}
                      max={100}
                      value={p.weight}
                      onChange={(e) => {
                        const copy = [...pillars];
                        copy[idx] = { ...p, weight: Number(e.target.value) || 0 };
                        setPillars(copy);
                      }}
                    />
                  </div>
                  <textarea
                    style={{ ...styles.textarea, marginTop: 6, minHeight: 60 }}
                    value={p.description}
                    onChange={(e) => {
                      const copy = [...pillars];
                      copy[idx] = { ...p, description: e.target.value };
                      setPillars(copy);
                    }}
                  />
                </div>
              ))}
              {error ? <div style={styles.err}>{error}</div> : null}
              <div style={styles.row}>
                <button style={styles.ghost} onClick={() => setStep(3)}>Back</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.ghost} onClick={() => setStep(5)}>Skip</button>
                  <button
                    style={styles.primary}
                    disabled={busy}
                    onClick={async () => {
                      if (await savePillars()) setStep(5);
                    }}
                  >Continue</button>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h1 style={styles.h1}>Voice samples</h1>
              <p style={styles.p}>
                Optional. Paste 2-3 of your best posts so the AI learns your
                voice. You can add more in Settings later.
              </p>
              {samples.map((s, idx) => (
                <div key={idx} style={styles.sampleBlock}>
                  <select
                    value={s.platform}
                    onChange={(e) => {
                      const copy = [...samples];
                      copy[idx] = { ...s, platform: e.target.value };
                      setSamples(copy);
                    }}
                    style={{ ...styles.input, width: "auto", marginBottom: 8 }}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <textarea
                    placeholder="Paste post text..."
                    value={s.text}
                    onChange={(e) => {
                      const copy = [...samples];
                      copy[idx] = { ...s, text: e.target.value };
                      setSamples(copy);
                    }}
                    style={styles.textarea}
                  />
                  <input
                    placeholder="Engagement notes (e.g. 50 likes, 12 comments)"
                    value={s.engagement}
                    onChange={(e) => {
                      const copy = [...samples];
                      copy[idx] = { ...s, engagement: e.target.value };
                      setSamples(copy);
                    }}
                    style={{ ...styles.input, marginTop: 8 }}
                  />
                </div>
              ))}
              <button
                style={{ ...styles.ghost, marginTop: 12 }}
                onClick={() =>
                  setSamples([...samples, { platform: "linkedin", text: "", engagement: "" }])
                }
              >+ Add sample</button>
              {error ? <div style={styles.err}>{error}</div> : null}
              <div style={styles.row}>
                <button style={styles.ghost} onClick={() => setStep(4)}>Back</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.ghost} onClick={() => setStep(6)}>Skip</button>
                  <button
                    style={styles.primary}
                    disabled={busy}
                    onClick={async () => {
                      if (await saveSamples()) setStep(6);
                    }}
                  >Continue</button>
                </div>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <h1 style={styles.h1}>You&apos;re set.</h1>
              <p style={styles.p}>
                Your account is configured. Open the dashboard, type a topic,
                pick a platform, and click Generate. New drafts appear in real
                time when the Cloud Function finishes.
              </p>
              {error ? <div style={styles.err}>{error}</div> : null}
              <div style={styles.row}>
                <button style={styles.ghost} onClick={() => setStep(5)}>Back</button>
                <button style={styles.primary} disabled={busy} onClick={finish}>
                  {busy ? "Saving..." : "Open dashboard"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
