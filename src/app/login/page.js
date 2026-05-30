"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function afterAuth(session) {
    // Seed profile + brand config, then route based on onboarding status
    const token = session?.access_token;
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Failed to initialize account");
      setBusy(false);
      return;
    }
    router.replace(data.hasCompletedOnboarding ? "/" : "/onboarding");
  }

  async function handleSubmit() {
    setErr("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setErr(error.message); setBusy(false); return; }
        // If email confirmation is off, session is returned immediately
        if (data.session) {
          await afterAuth(data.session);
        } else {
          setErr("Check your email to confirm your account, then sign in.");
          setMode("signin");
          setBusy(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setErr(error.message); setBusy(false); return; }
        await afterAuth(data.session);
      }
    } catch (e) {
      setErr(String(e?.message || e));
      setBusy(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Sign {mode === "signup" ? "up" : "in"}</h1>
        <p style={styles.sub}>Multi-user content automation. Each user brings their own Anthropic key.</p>

        {err ? <div style={styles.err}>{err}</div> : null}

        <label style={styles.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          autoCapitalize="none"
        />

        <label style={styles.label}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
        />

        <button style={styles.primary} disabled={busy || !email || !password} onClick={handleSubmit}>
          {busy ? "Please wait…" : (mode === "signup" ? "Create account" : "Sign in")}
        </button>

        <div style={styles.switch}>
          {mode === "signup" ? (
            <span>Already have an account?{" "}
              <button style={styles.link} onClick={() => { setMode("signin"); setErr(""); }}>Sign in</button>
            </span>
          ) : (
            <span>Need an account?{" "}
              <button style={styles.link} onClick={() => { setMode("signup"); setErr(""); }}>Sign up</button>
            </span>
          )}
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#09090b" },
  card: { width: "100%", maxWidth: 420, backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 14, padding: 28 },
  h1: { margin: "0 0 6px", fontSize: 28, color: "#fafafa" },
  sub: { margin: "0 0 18px", color: "#a1a1aa", fontSize: 14, lineHeight: 1.5 },
  label: { display: "block", color: "#a1a1aa", fontSize: 13, margin: "14px 0 6px" },
  input: { width: "100%", boxSizing: "border-box", backgroundColor: "#0a0a0a", color: "#e4e4e7", border: "1px solid #27272a", borderRadius: 8, padding: "12px 14px", fontSize: 15 },
  primary: { width: "100%", marginTop: 20, padding: "13px 16px", backgroundColor: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  switch: { marginTop: 18, color: "#a1a1aa", fontSize: 14, textAlign: "center" },
  link: { background: "none", border: "none", color: "#a78bfa", cursor: "pointer", fontSize: 14, padding: 0, textDecoration: "underline" },
  err: { backgroundColor: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "10px 12px", borderRadius: 8, fontSize: 13, marginBottom: 8 },
};
