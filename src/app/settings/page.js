"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase-client.js";

const styles = {
  page: { minHeight: "100vh" },
  header: {
    borderBottom: "1px solid #27272a",
    padding: "14px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { fontSize: 16, fontWeight: 600 },
  nav: { display: "flex", gap: 8 },
  navLink: {
    color: "#a1a1aa",
    background: "transparent",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 14,
    cursor: "pointer",
  },
  main: { padding: 24, maxWidth: 900, margin: "0 auto" },
  section: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 10,
    padding: 18,
    marginBottom: 16,
  },
  h2: { fontSize: 16, margin: 0, marginBottom: 10 },
  label: { display: "block", fontSize: 12, color: "#a1a1aa", marginTop: 10, marginBottom: 4 },
  input: {
    width: "100%",
    padding: "8px 10px",
    backgroundColor: "#09090b",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 13,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "8px 10px",
    backgroundColor: "#09090b",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 13,
    boxSizing: "border-box",
    minHeight: 80,
    fontFamily: "inherit",
  },
  primary: {
    padding: "8px 14px",
    backgroundColor: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  ghost: {
    padding: "8px 14px",
    backgroundColor: "transparent",
    color: "#e4e4e7",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
  },
  danger: {
    padding: "8px 14px",
    backgroundColor: "#27272a",
    color: "#fca5a5",
    border: "1px solid #3f3f46",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
  },
  ok: { color: "#86efac", fontSize: 12, marginTop: 8 },
  err: { color: "#fca5a5", fontSize: 12, marginTop: 8 },
  pillarRow: {
    display: "grid",
    gridTemplateColumns: "1fr 80px auto",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    backgroundColor: "#27272a",
    borderRadius: 999,
    fontSize: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  chipX: { background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer" },
};

const PLATFORMS = ["linkedin", "instagram", "tiktok", "facebook"];

function ChipList({ items, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        {(items || []).map((it, i) => (
          <span key={i} style={styles.chip}>
            {it}
            <button
              type="button"
              style={styles.chipX}
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={styles.input}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onChange([...(items || []), draft.trim()]);
              setDraft("");
            }
          }}
        />
        <button
          type="button"
          style={styles.ghost}
          onClick={() => {
            if (!draft.trim()) return;
            onChange([...(items || []), draft.trim()]);
            setDraft("");
          }}
        >Add</button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [maskedKey, setMaskedKey] = useState(null);
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyMsg, setKeyMsg] = useState({ ok: "", err: "" });
  const [savedMsg, setSavedMsg] = useState({ ok: "", err: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      const token = await u.getIdToken();
      const [cfg, key] = await Promise.all([
        fetch("/api/brand-config", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch("/api/api-key", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      ]);
      setConfig(cfg.brandConfig || null);
      setHasKey(!!key.hasKey);
      setMaskedKey(key.masked);
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

  async function saveSection(partial) {
    setSavedMsg({ ok: "", err: "" });
    setBusy(true);
    const res = await authedFetch("/api/brand-config", {
      method: "PUT",
      body: JSON.stringify(partial),
    });
    setBusy(false);
    if (res.ok) {
      const { brandConfig } = await res.json();
      setConfig(brandConfig);
      setSavedMsg({ ok: "Saved.", err: "" });
    } else {
      setSavedMsg({ ok: "", err: "Save failed" });
    }
  }

  async function saveApiKey() {
    setKeyMsg({ ok: "", err: "" });
    setBusy(true);
    const res = await authedFetch("/api/api-key", {
      method: "POST",
      body: JSON.stringify({ apiKey: keyInput }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setHasKey(true);
      setMaskedKey(data.masked);
      setKeyInput("");
      setKeyMsg({ ok: "Verified and saved.", err: "" });
    } else {
      setKeyMsg({ ok: "", err: data.error + (data.detail ? `: ${data.detail}` : "") });
    }
  }

  if (!user || !config) {
    return (
      <main style={styles.page}>
        <div style={{ padding: 40, color: "#71717a" }}>Loading…</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>Settings</div>
        <nav style={styles.nav}>
          <button style={styles.navLink} onClick={() => router.push("/")}>Dashboard</button>
          <button style={styles.navLink} onClick={() => router.push("/settings")}>Settings</button>
          <button style={styles.navLink} onClick={async () => { await signOut(auth); router.replace("/login"); }}>Sign out</button>
        </nav>
      </header>

      <div style={styles.main}>
        <div style={styles.section}>
          <h2 style={styles.h2}>Account</h2>
          <div style={{ color: "#a1a1aa", fontSize: 13 }}>{user.email}</div>
          <div style={{ color: "#71717a", fontSize: 12, marginTop: 4 }}>
            {user.displayName || ""}
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.h2}>Anthropic API Key</h2>
          <div style={{ color: "#a1a1aa", fontSize: 13 }}>
            {hasKey ? `Current: ${maskedKey}` : "No key on file."}
          </div>
          <label style={styles.label}>Replace key</label>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            style={styles.input}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={styles.primary} disabled={busy || !keyInput} onClick={saveApiKey}>
              {busy ? "Verifying..." : "Test and save"}
            </button>
          </div>
          {keyMsg.ok ? <div style={styles.ok}>{keyMsg.ok}</div> : null}
          {keyMsg.err ? <div style={styles.err}>{keyMsg.err}</div> : null}
        </div>

        <div style={styles.section}>
          <h2 style={styles.h2}>Brand Identity</h2>
          <label style={styles.label}>Display name</label>
          <input
            style={styles.input}
            value={config.identity?.name || ""}
            onChange={(e) =>
              setConfig({ ...config, identity: { ...config.identity, name: e.target.value } })
            }
          />
          <label style={styles.label}>Handle</label>
          <input
            style={styles.input}
            value={config.identity?.handle || ""}
            onChange={(e) =>
              setConfig({ ...config, identity: { ...config.identity, handle: e.target.value } })
            }
          />
          <label style={styles.label}>Tagline</label>
          <input
            style={styles.input}
            value={config.identity?.tagline || ""}
            onChange={(e) =>
              setConfig({ ...config, identity: { ...config.identity, tagline: e.target.value } })
            }
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              style={styles.primary}
              disabled={busy}
              onClick={() => saveSection({ identity: config.identity })}
            >Save identity</button>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.h2}>Voice</h2>
          <label style={styles.label}>Tone descriptors</label>
          <ChipList
            items={config.voice?.tone || []}
            onChange={(tone) => setConfig({ ...config, voice: { ...config.voice, tone } })}
            placeholder="e.g. Direct"
          />
          <label style={styles.label}>Signature phrases</label>
          <ChipList
            items={config.voice?.signaturePhrases || []}
            onChange={(signaturePhrases) =>
              setConfig({ ...config, voice: { ...config.voice, signaturePhrases } })
            }
            placeholder="A phrase you reach for"
          />
          <label style={styles.label}>Avoid phrases</label>
          <ChipList
            items={config.voice?.avoidPhrases || []}
            onChange={(avoidPhrases) =>
              setConfig({ ...config, voice: { ...config.voice, avoidPhrases } })
            }
            placeholder="A phrase to never use"
          />
          <label style={styles.label}>Sample posts</label>
          {(config.voice?.samplePosts || []).map((s, idx) => (
            <div key={idx} style={{ marginTop: 8, padding: 10, border: "1px solid #27272a", borderRadius: 8 }}>
              <select
                style={{ ...styles.input, width: "auto", marginBottom: 6 }}
                value={s.platform}
                onChange={(e) => {
                  const list = [...config.voice.samplePosts];
                  list[idx] = { ...s, platform: e.target.value };
                  setConfig({ ...config, voice: { ...config.voice, samplePosts: list } });
                }}
              >
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <textarea
                style={styles.textarea}
                value={s.text || ""}
                onChange={(e) => {
                  const list = [...config.voice.samplePosts];
                  list[idx] = { ...s, text: e.target.value };
                  setConfig({ ...config, voice: { ...config.voice, samplePosts: list } });
                }}
              />
              <input
                style={{ ...styles.input, marginTop: 6 }}
                placeholder="Engagement notes"
                value={s.engagement || ""}
                onChange={(e) => {
                  const list = [...config.voice.samplePosts];
                  list[idx] = { ...s, engagement: e.target.value };
                  setConfig({ ...config, voice: { ...config.voice, samplePosts: list } });
                }}
              />
              <button
                style={{ ...styles.danger, marginTop: 6 }}
                onClick={() => {
                  const list = (config.voice.samplePosts || []).filter((_, i) => i !== idx);
                  setConfig({ ...config, voice: { ...config.voice, samplePosts: list } });
                }}
              >Remove</button>
            </div>
          ))}
          <button
            style={{ ...styles.ghost, marginTop: 10 }}
            onClick={() => {
              const list = config.voice?.samplePosts || [];
              setConfig({
                ...config,
                voice: {
                  ...config.voice,
                  samplePosts: [...list, { platform: "linkedin", text: "", engagement: "" }],
                },
              });
            }}
          >+ Add sample</button>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              style={styles.primary}
              disabled={busy}
              onClick={() => saveSection({ voice: config.voice })}
            >Save voice</button>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.h2}>Content Pillars</h2>
          {(config.contentPillars || []).map((p, idx) => (
            <div key={p.id || idx} style={{ marginTop: 12 }}>
              <div style={styles.pillarRow}>
                <input
                  style={styles.input}
                  value={p.name}
                  onChange={(e) => {
                    const list = [...config.contentPillars];
                    list[idx] = { ...p, name: e.target.value };
                    setConfig({ ...config, contentPillars: list });
                  }}
                />
                <input
                  style={styles.input}
                  type="number"
                  value={p.weight}
                  onChange={(e) => {
                    const list = [...config.contentPillars];
                    list[idx] = { ...p, weight: Number(e.target.value) || 0 };
                    setConfig({ ...config, contentPillars: list });
                  }}
                />
                <button
                  style={styles.danger}
                  onClick={() => {
                    const list = (config.contentPillars || []).filter((_, i) => i !== idx);
                    setConfig({ ...config, contentPillars: list });
                  }}
                >Remove</button>
              </div>
              <textarea
                style={{ ...styles.textarea, marginTop: 6 }}
                value={p.description || ""}
                onChange={(e) => {
                  const list = [...config.contentPillars];
                  list[idx] = { ...p, description: e.target.value };
                  setConfig({ ...config, contentPillars: list });
                }}
              />
            </div>
          ))}
          <button
            style={{ ...styles.ghost, marginTop: 10 }}
            onClick={() => {
              const list = config.contentPillars || [];
              const id = `pillar-${Date.now()}`;
              setConfig({
                ...config,
                contentPillars: [
                  ...list,
                  { id, name: "New pillar", description: "", weight: 0, angles: [] },
                ],
              });
            }}
          >+ Add pillar</button>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              style={styles.primary}
              disabled={busy}
              onClick={() => saveSection({ contentPillars: config.contentPillars })}
            >Save pillars</button>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.h2}>Platform Rules</h2>
          <p style={{ color: "#71717a", fontSize: 12 }}>
            Advanced. Edit JSON directly. Saved as-is into your brand config.
          </p>
          <textarea
            style={{ ...styles.textarea, minHeight: 240, fontFamily: "monospace" }}
            value={JSON.stringify(config.platforms || {}, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                setConfig({ ...config, platforms: parsed });
                setSavedMsg({ ok: "", err: "" });
              } catch {
                setSavedMsg({ ok: "", err: "Invalid JSON (not saved yet)" });
              }
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              style={styles.primary}
              disabled={busy}
              onClick={() => saveSection({ platforms: config.platforms })}
            >Save platforms</button>
          </div>
        </div>

        {savedMsg.ok ? <div style={styles.ok}>{savedMsg.ok}</div> : null}
        {savedMsg.err ? <div style={styles.err}>{savedMsg.err}</div> : null}
      </div>
    </main>
  );
}
