"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // form state
  const [apiKey, setApiKey] = useState("");
  const [identity, setIdentity] = useState({ name: "", handle: "", tagline: "" });
  const [config, setConfig] = useState(null);
  const [voiceSamples, setVoiceSamples] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) { router.replace("/login"); return; }
      setUser(data.session.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  // load brand config once user known (prefill identity)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await getToken();
      const res = await fetch("/api/brand-config", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const { brandConfig } = await res.json();
        setConfig(brandConfig);
        if (brandConfig?.identity) setIdentity({ ...brandConfig.identity });
      }
    })();
  }, [user]);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function authedFetch(path, options = {}) {
    const token = await getToken();
    return fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }

  async function saveApiKey() {
    setErr(""); setBusy(true);
    const res = await authedFetch("/api/api-key", { method: "POST", body: JSON.stringify({ apiKey }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Key validation failed"); return; }
    setStep(2);
  }

  async function saveIdentity() {
    setErr(""); setBusy(true);
    const res = await authedFetch("/api/brand-config", { method: "PUT", body: JSON.stringify({ identity }) });
    setBusy(false);
    if (!res.ok) { setErr("Failed to save identity"); return; }
    setStep(3);
  }

  async function saveVoiceAndFinish() {
    setErr(""); setBusy(true);
    // Turn the pasted blob into sample posts on the voice block
    const samples = voiceSamples.split("\n---\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ platform: "", text }));
    const voice = { ...(config?.voice || {}), samplePosts: samples };
    const res1 = await authedFetch("/api/brand-config", { method: "PUT", body: JSON.stringify({ voice }) });
    if (!res1.ok) { setBusy(false); setErr("Failed to save voice"); return; }
    const res2 = await authedFetch("/api/onboarding/complete", { method: "POST" });
    setBusy(false);
    if (!res2.ok) { setErr("Failed to complete onboarding"); return; }
    router.replace("/");
  }

  if (!user) {
    return <main style={styles.page}><div style={{ padding: 40, color: "#71717a" }}>Loading…</div></main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.progress}>Step {step + 1} of 5</div>

        {err ? <div style={styles.err}>{err}</div> : null}

        {step === 0 ? (
          <>
            <h1 style={styles.h1}>Welcome 👋</h1>
            <p style={styles.sub}>Let's set up your content engine. Takes ~3 minutes. You'll add your Anthropic API key, your identity, and a few writing samples so the AI matches your voice.</p>
            <button style={styles.primary} onClick={() => setStep(1)}>Get started</button>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 style={styles.h1}>Your Anthropic API key</h1>
            <p style={styles.sub}>Each user brings their own key — your AI usage is billed to you directly. Get one at console.anthropic.com.</p>
            <input type="password" placeholder="sk-ant-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={styles.input} />
            <button style={styles.primary} disabled={busy || !apiKey} onClick={saveApiKey}>{busy ? "Validating…" : "Validate & continue"}</button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 style={styles.h1}>Your identity</h1>
            <label style={styles.label}>Name</label>
            <input value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} style={styles.input} />
            <label style={styles.label}>Handle (without @)</label>
            <input value={identity.handle} onChange={(e) => setIdentity({ ...identity, handle: e.target.value })} style={styles.input} />
            <label style={styles.label}>Tagline</label>
            <input value={identity.tagline} onChange={(e) => setIdentity({ ...identity, tagline: e.target.value })} style={styles.input} />
            <button style={styles.primary} disabled={busy} onClick={saveIdentity}>{busy ? "Saving…" : "Continue"}</button>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h1 style={styles.h1}>Content pillars</h1>
            <p style={styles.sub}>We've seeded sensible defaults (Automation, CRM, Freelance, Tools, Personal). You can fine-tune them later in Settings. For now, continue.</p>
            <button style={styles.primary} onClick={() => setStep(4)}>Looks good, continue</button>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <h1 style={styles.h1}>Voice samples</h1>
            <p style={styles.sub}>Paste 2-3 of your real posts so the AI learns your voice. Separate each with a line containing only <code>---</code>. You can skip and add later.</p>
            <textarea value={voiceSamples} onChange={(e) => setVoiceSamples(e.target.value)} style={{ ...styles.input, minHeight: 160, fontFamily: "inherit" }} placeholder={"My first post...\n---\nMy second post..."} />
            <button style={styles.primary} disabled={busy} onClick={saveVoiceAndFinish}>{busy ? "Finishing…" : "Finish setup"}</button>
          </>
        ) : null}
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#09090b" },
  card: { width: "100%", maxWidth: 480, backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 14, padding: 28 },
  progress: { color: "#71717a", fontSize: 12, marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 },
  h1: { margin: "0 0 8px", fontSize: 24, color: "#fafafa" },
  sub: { margin: "0 0 18px", color: "#a1a1aa", fontSize: 14, lineHeight: 1.6 },
  label: { display: "block", color: "#a1a1aa", fontSize: 13, margin: "12px 0 6px" },
  input: { width: "100%", boxSizing: "border-box", backgroundColor: "#0a0a0a", color: "#e4e4e7", border: "1px solid #27272a", borderRadius: 8, padding: "12px 14px", fontSize: 15 },
  primary: { width: "100%", marginTop: 20, padding: "13px 16px", backgroundColor: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  err: { backgroundColor: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "10px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 },
};
