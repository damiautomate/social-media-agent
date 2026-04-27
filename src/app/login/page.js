"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase-client.js";

const styles = {
  page: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 12,
    padding: 28,
  },
  title: { fontSize: 22, fontWeight: 600, margin: 0, marginBottom: 4 },
  sub: { color: "#a1a1aa", margin: 0, marginBottom: 20, fontSize: 14 },
  label: { display: "block", fontSize: 12, color: "#a1a1aa", marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "#09090b",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
    marginBottom: 12,
  },
  primaryBtn: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 10,
  },
  secondaryBtn: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#27272a",
    color: "#e4e4e7",
    border: "1px solid #3f3f46",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
    marginBottom: 10,
  },
  toggle: {
    background: "none",
    border: "none",
    color: "#a78bfa",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    marginTop: 6,
  },
  err: {
    backgroundColor: "#3f1d1d",
    color: "#fca5a5",
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    color: "#52525b",
    fontSize: 12,
    margin: "14px 0",
  },
};

async function bootstrapAndRoute(user, router) {
  const token = await user.getIdToken();
  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error("Failed to initialize account");
  }
  const data = await res.json();
  router.replace(data.hasCompletedOnboarding ? "/" : "/onboarding");
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          await bootstrapAndRoute(user, router);
        } catch (err) {
          setError(err.message || "Sign-in failed");
        }
      }
    });
    return unsub;
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message || "Auth failed");
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError("");
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err.message || "Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p style={styles.sub}>
          Multi-user content automation. Each user brings their own Anthropic key.
        </p>

        {error ? <div style={styles.err}>{error}</div> : null}

        <form onSubmit={onSubmit}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            autoComplete="email"
          />
          <label style={styles.label}>Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
          <button type="submit" disabled={busy} style={styles.primaryBtn}>
            {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div style={styles.divider}>— or —</div>

        <button onClick={onGoogle} disabled={busy} style={styles.secondaryBtn}>
          Continue with Google
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={styles.toggle}
          type="button"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
