"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function afterAuth(session) {
    const token = session?.access_token;
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "Failed to initialize account"); setBusy(false); return; }
    router.replace(data.hasCompletedOnboarding ? "/" : "/onboarding");
  }

  async function handleSubmit() {
    setErr(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setErr(error.message); setBusy(false); return; }
        if (data.session) await afterAuth(data.session);
        else { setErr("Check your email to confirm your account, then sign in."); setMode("signin"); setBusy(false); }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setErr(error.message); setBusy(false); return; }
        await afterAuth(data.session);
      }
    } catch (e) { setErr(String(e?.message || e)); setBusy(false); }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card rise">
        <div className="auth-logo">
          <span className="brand-mark" style={{ width: 38, height: 38, fontSize: 18, borderRadius: 11 }}>◆</span>
          <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 22, letterSpacing: "-.03em" }}>Cadence</span>
        </div>
        <div className="card card-pad">
          <h1 className="auth-h">{mode === "signup" ? "Create account" : "Welcome back"}</h1>
          <p className="auth-sub">AI content automation for LinkedIn, Instagram, TikTok & Facebook. You bring your own Anthropic key.</p>

          {err ? <div className="note note-err" style={{ marginTop: 0, marginBottom: 16 }}>{err}</div> : null}

          <div className="field">
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" placeholder="you@example.com" />
          </div>
          <div className="field">
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }} />
          </div>

          <button className="btn btn-primary btn-block" style={{ marginTop: 6 }} disabled={busy || !email || !password} onClick={handleSubmit}>
            {busy ? "Please wait…" : (mode === "signup" ? "Create account" : "Sign in")}
          </button>

          <div className="auth-switch">
            {mode === "signup" ? (
              <span>Already have an account? <button className="linkbtn" onClick={() => { setMode("signin"); setErr(""); }}>Sign in</button></span>
            ) : (
              <span>Need an account? <button className="linkbtn" onClick={() => { setMode("signup"); setErr(""); }}>Sign up</button></span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
