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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (!session) router.replace("/login"); });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

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

  async function getToken() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token; }
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
    return <main className="auth-wrap"><div style={{ color: "var(--ink-3)" }}>Loading…</div></main>;
  }

  const TOTAL = 5;

  return (
    <main className="auth-wrap">
      <div className="auth-card rise">
        <div className="auth-logo">
          <span className="brand-mark" style={{ width: 38, height: 38, fontSize: 18, borderRadius: 11 }}>◆</span>
          <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 22, letterSpacing: "-.03em" }}>Cadence</span>
        </div>
        <div className="card card-pad">
          <div className="steps">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <div key={i} className={`step-bar ${i < step ? "done" : i === step ? "active" : ""}`} />
            ))}
          </div>

          {err ? <div className="note note-err" style={{ marginTop: 0, marginBottom: 14 }}>{err}</div> : null}

          {step === 0 ? (
            <>
              <div className="eyebrow">Welcome</div>
              <h1 className="section-title" style={{ fontSize: 23 }}>Let's tune your voice</h1>
              <p className="section-desc">Three quick steps — your Anthropic key, who you are, and a couple of writing samples so the AI sounds like you. About 3 minutes.</p>
              <button className="btn btn-primary btn-block" onClick={() => setStep(1)}>Get started</button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="eyebrow">Step 1 · API key</div>
              <h1 className="section-title" style={{ fontSize: 23 }}>Your Anthropic key</h1>
              <p className="section-desc">You bring your own key — AI usage bills to you directly. Grab one at console.anthropic.com.</p>
              <div className="field"><input className="input" type="password" placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
              <button className="btn btn-primary btn-block" disabled={busy || !apiKey} onClick={saveApiKey}>{busy ? "Validating…" : "Validate & continue"}</button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="eyebrow">Step 2 · Identity</div>
              <h1 className="section-title" style={{ fontSize: 23 }}>Who's posting?</h1>
              <div className="field"><label className="label">Name</label><input className="input" value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} /></div>
              <div className="field"><label className="label">Handle (no @)</label><input className="input" value={identity.handle} onChange={(e) => setIdentity({ ...identity, handle: e.target.value })} /></div>
              <div className="field"><label className="label">Tagline</label><input className="input" value={identity.tagline} onChange={(e) => setIdentity({ ...identity, tagline: e.target.value })} /></div>
              <button className="btn btn-primary btn-block" disabled={busy} onClick={saveIdentity}>{busy ? "Saving…" : "Continue"}</button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="eyebrow">Step 3 · Pillars</div>
              <h1 className="section-title" style={{ fontSize: 23 }}>Content pillars</h1>
              <p className="section-desc">We've seeded sensible defaults (Automation, CRM, Freelance, Tools, Personal). Fine-tune them later in Settings.</p>
              <button className="btn btn-primary btn-block" onClick={() => setStep(4)}>Looks good, continue</button>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="eyebrow">Step 4 · Voice</div>
              <h1 className="section-title" style={{ fontSize: 23 }}>Show your style</h1>
              <p className="section-desc">Paste 2-3 real posts so the AI learns your voice. Separate each with a line containing only <code>---</code>. Optional — you can skip.</p>
              <div className="field"><textarea className="textarea" style={{ minHeight: 150 }} value={voiceSamples} onChange={(e) => setVoiceSamples(e.target.value)} placeholder={"My first post...\n---\nMy second post..."} /></div>
              <button className="btn btn-primary btn-block" disabled={busy} onClick={saveVoiceAndFinish}>{busy ? "Finishing…" : "Finish setup"}</button>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
