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

  // Replicate
  const [replicateMasked, setReplicateMasked] = useState(null);
  const [hasReplicateKey, setHasReplicateKey] = useState(false);
  const [replicateInput, setReplicateInput] = useState("");
  const [replicateMsg, setReplicateMsg] = useState({ ok: "", err: "" });

  // Cloudinary
  const [cloudinaryInfo, setCloudinaryInfo] = useState({ hasCreds: false, cloudName: "", apiKeyMasked: null, folder: "" });
  const [cloudinaryInput, setCloudinaryInput] = useState({ cloudName: "", apiKey: "", apiSecret: "", folder: "social-agent" });
  const [cloudinaryMsg, setCloudinaryMsg] = useState({ ok: "", err: "" });

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
      const [cfg, key, repKey, cloud] = await Promise.all([
        fetch("/api/brand-config", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch("/api/api-key", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch("/api/replicate-key", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/cloudinary-keys", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({})),
      ]);
      setConfig(cfg.brandConfig || null);
      setHasKey(!!key.hasKey);
      setMaskedKey(key.masked);
      setHasReplicateKey(!!repKey.hasKey);
      setReplicateMasked(repKey.masked);
      setCloudinaryInfo({
        hasCreds: !!cloud.hasCreds,
        cloudName: cloud.cloudName || "",
        apiKeyMasked: cloud.apiKeyMasked || null,
        folder: cloud.folder || "",
      });
      if (cloud.cloudName) {
        setCloudinaryInput((s) => ({ ...s, cloudName: cloud.cloudName, folder: cloud.folder || "social-agent" }));
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

  async function saveReplicateKey() {
    setReplicateMsg({ ok: "", err: "" });
    setBusy(true);
    const res = await authedFetch("/api/replicate-key", {
      method: "POST",
      body: JSON.stringify({ apiKey: replicateInput }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setHasReplicateKey(true);
      setReplicateMasked(data.masked);
      setReplicateInput("");
      setReplicateMsg({ ok: "Verified and saved.", err: "" });
    } else {
      setReplicateMsg({ ok: "", err: data.error + (data.detail ? `: ${data.detail}` : "") });
    }
  }

  async function saveCloudinaryKeys() {
    setCloudinaryMsg({ ok: "", err: "" });
    setBusy(true);
    const res = await authedFetch("/api/cloudinary-keys", {
      method: "POST",
      body: JSON.stringify(cloudinaryInput),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCloudinaryInfo({
        hasCreds: true,
        cloudName: cloudinaryInput.cloudName,
        apiKeyMasked: `••••••••${cloudinaryInput.apiKey.slice(-4)}`,
        folder: cloudinaryInput.folder,
      });
      setCloudinaryInput((s) => ({ ...s, apiKey: "", apiSecret: "" }));
      setCloudinaryMsg({ ok: "Verified and saved.", err: "" });
    } else {
      setCloudinaryMsg({ ok: "", err: data.error + (data.detail ? `: ${data.detail}` : "") });
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
          <button style={styles.navLink} onClick={() => router.push("/ideas")}>Ideas</button>
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
          <h2 style={styles.h2}>Replicate API Key</h2>
          <div style={{ color: "#a1a1aa", fontSize: 13 }}>
            Powers image generation (Flux Schnell). Get one at{" "}
            <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa" }}>
              replicate.com/account/api-tokens
            </a>. {hasReplicateKey ? `Current: ${replicateMasked}` : "No key on file."}
          </div>
          <label style={styles.label}>Replace key</label>
          <input
            type="password"
            placeholder="r8_..."
            value={replicateInput}
            onChange={(e) => setReplicateInput(e.target.value)}
            style={styles.input}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={styles.primary} disabled={busy || !replicateInput} onClick={saveReplicateKey}>
              {busy ? "Verifying..." : "Test and save"}
            </button>
          </div>
          {replicateMsg.ok ? <div style={styles.ok}>{replicateMsg.ok}</div> : null}
          {replicateMsg.err ? <div style={styles.err}>{replicateMsg.err}</div> : null}
        </div>

        <div style={styles.section}>
          <h2 style={styles.h2}>Cloudinary</h2>
          <div style={{ color: "#a1a1aa", fontSize: 13 }}>
            Where generated images are hosted. Find these in your Cloudinary dashboard under "Product Environment Credentials".
            {cloudinaryInfo.hasCreds ? (
              <>
                <br />Current cloud: <strong>{cloudinaryInfo.cloudName}</strong> · API key: {cloudinaryInfo.apiKeyMasked} · Folder: {cloudinaryInfo.folder}
              </>
            ) : (
              <><br />Not configured.</>
            )}
          </div>
          <label style={styles.label}>Cloud name</label>
          <input
            style={styles.input}
            placeholder="e.g. dvzk1it71"
            value={cloudinaryInput.cloudName}
            onChange={(e) => setCloudinaryInput({ ...cloudinaryInput, cloudName: e.target.value })}
          />
          <label style={styles.label}>API Key</label>
          <input
            type="password"
            style={styles.input}
            placeholder="12-digit number"
            value={cloudinaryInput.apiKey}
            onChange={(e) => setCloudinaryInput({ ...cloudinaryInput, apiKey: e.target.value })}
          />
          <label style={styles.label}>API Secret</label>
          <input
            type="password"
            style={styles.input}
            placeholder="long alphanumeric string"
            value={cloudinaryInput.apiSecret}
            onChange={(e) => setCloudinaryInput({ ...cloudinaryInput, apiSecret: e.target.value })}
          />
          <label style={styles.label}>Folder (organizes uploads inside Cloudinary)</label>
          <input
            style={styles.input}
            placeholder="social-agent"
            value={cloudinaryInput.folder}
            onChange={(e) => setCloudinaryInput({ ...cloudinaryInput, folder: e.target.value })}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              style={styles.primary}
              disabled={busy || !cloudinaryInput.cloudName || !cloudinaryInput.apiKey || !cloudinaryInput.apiSecret}
              onClick={saveCloudinaryKeys}
            >
              {busy ? "Verifying..." : "Test and save"}
            </button>
          </div>
          {cloudinaryMsg.ok ? <div style={styles.ok}>{cloudinaryMsg.ok}</div> : null}
          {cloudinaryMsg.err ? <div style={styles.err}>{cloudinaryMsg.err}</div> : null}
        </div>

        <div style={styles.section}>
          <h2 style={styles.h2}>Visual Style</h2>
          <p style={{ color: "#71717a", fontSize: 12, marginBottom: 12 }}>
            Shapes every image the AI generates for your drafts. Be specific — "earthy, hand-drawn, warm beige and forest green" beats "modern and clean".
          </p>

          <label style={styles.label}>Description (what your images should feel like)</label>
          <textarea
            style={{ ...styles.input, minHeight: 70, fontFamily: "inherit", lineHeight: 1.5 }}
            value={config.visualStyle?.description || ""}
            onChange={(e) => setConfig({
              ...config,
              visualStyle: { ...(config.visualStyle || {}), description: e.target.value },
            })}
          />

          <label style={styles.label}>Aesthetic category (free text, e.g. modern_minimalist, editorial, hand_drawn)</label>
          <input
            style={styles.input}
            value={config.visualStyle?.aesthetic || ""}
            onChange={(e) => setConfig({
              ...config,
              visualStyle: { ...(config.visualStyle || {}), aesthetic: e.target.value },
            })}
          />

          <label style={styles.label}>Color palette (comma-separated hex codes)</label>
          <input
            style={styles.input}
            placeholder="#0F1B2D, #D4AF37, #FFFFFF"
            value={(config.visualStyle?.colorPalette || []).join(", ")}
            onChange={(e) => setConfig({
              ...config,
              visualStyle: {
                ...(config.visualStyle || {}),
                colorPalette: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
              },
            })}
          />

          <label style={styles.label}>Avoid (one item per line)</label>
          <textarea
            style={{ ...styles.input, minHeight: 80, fontFamily: "inherit", lineHeight: 1.5 }}
            placeholder={"stock photo cliches\nAI-art tells (warped hands)\nlens flares"}
            value={(config.visualStyle?.avoidElements || []).join("\n")}
            onChange={(e) => setConfig({
              ...config,
              visualStyle: {
                ...(config.visualStyle || {}),
                avoidElements: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
              },
            })}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              style={styles.primary}
              disabled={busy}
              onClick={() => saveSection({ visualStyle: config.visualStyle })}
            >Save visual style</button>
          </div>
        </div>

        <div
          style={{
            ...styles.section,
            background: "linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)",
            border: "1px solid #4c1d95",
          }}
        >
          <h2 style={{ ...styles.h2, marginBottom: 6 }}>✨ Auto-fill from your existing content</h2>
          <p style={{ color: "#c4b5fd", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Paste your bio and a few representative posts — the AI will propose your identity, voice, signature phrases, and content pillars. Saves you from filling out the sections below by hand.
          </p>
          <button
            style={{ ...styles.primary, backgroundColor: "#a78bfa", color: "#1e1b4b" }}
            onClick={() => router.push("/bootstrap")}
          >
            Open Brand Bootstrap →
          </button>
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
          <h2 style={styles.h2}>Research Sources</h2>
          <p style={{ color: "#71717a", fontSize: 12, marginBottom: 12 }}>
            Sources the weekly research agent pulls from. Disabled rows are skipped.
            Reddit needs a subreddit name. RSS needs a feed URL. YouTube needs a channel ID
            (not the @handle — find it in any channel video's page source under "channelId":"UC...").
          </p>

          <label style={styles.label}>Target ideas per run</label>
          <input
            style={styles.input}
            type="number"
            min={1}
            max={50}
            value={config.research?.targetIdeasPerRun ?? 12}
            onChange={(e) =>
              setConfig({
                ...config,
                research: {
                  ...(config.research || {}),
                  targetIdeasPerRun: Number(e.target.value) || 12,
                },
              })
            }
          />

          <label style={styles.label}>Dedupe window (days)</label>
          <input
            style={styles.input}
            type="number"
            min={1}
            max={90}
            value={config.research?.dedupeWindowDays ?? 14}
            onChange={(e) =>
              setConfig({
                ...config,
                research: {
                  ...(config.research || {}),
                  dedupeWindowDays: Number(e.target.value) || 14,
                },
              })
            }
          />

          <label style={styles.label}>Enabled</label>
          <select
            style={{ ...styles.input, width: "auto" }}
            value={config.research?.enabled === false ? "off" : "on"}
            onChange={(e) =>
              setConfig({
                ...config,
                research: {
                  ...(config.research || {}),
                  enabled: e.target.value === "on",
                },
              })
            }
          >
            <option value="on">On — runs weekly</option>
            <option value="off">Off — won't run</option>
          </select>

          <label style={styles.label}>Scoring weights (should sum to 1.0)</label>
          <div className="m-stack-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {["relevance", "novelty", "voiceFit", "urgency"].map((key) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>{key}</div>
                <input
                  style={styles.input}
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={config.research?.scoringWeights?.[key] ?? 0}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      research: {
                        ...(config.research || {}),
                        scoringWeights: {
                          ...(config.research?.scoringWeights || {}),
                          [key]: Number(e.target.value) || 0,
                        },
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>

          <label style={styles.label}>Sources</label>
          {(config.research?.sources || []).map((s, idx) => {
            const updateSource = (patch) => {
              const list = [...(config.research?.sources || [])];
              list[idx] = { ...s, ...patch };
              setConfig({ ...config, research: { ...(config.research || {}), sources: list } });
            };
            const updateConfig = (patch) =>
              updateSource({ config: { ...(s.config || {}), ...patch } });
            const remove = () => {
              const list = (config.research?.sources || []).filter((_, i) => i !== idx);
              setConfig({ ...config, research: { ...(config.research || {}), sources: list } });
            };
            return (
              <div
                key={s.id || idx}
                style={{
                  marginTop: 8,
                  padding: 10,
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  opacity: s.enabled === false ? 0.55 : 1,
                }}
              >
                <div className="m-stack" style={{ display: "grid", gridTemplateColumns: "120px 1fr 100px auto", gap: 8, alignItems: "center" }}>
                  <select
                    style={styles.input}
                    value={s.type}
                    onChange={(e) => updateSource({ type: e.target.value })}
                  >
                    <option value="reddit">reddit</option>
                    <option value="hackernews">hackernews</option>
                    <option value="rss">rss</option>
                    <option value="youtube">youtube</option>
                  </select>
                  <input
                    style={styles.input}
                    placeholder="Label (e.g. r/automation)"
                    value={s.label || ""}
                    onChange={(e) => updateSource({ label: e.target.value })}
                  />
                  <select
                    style={styles.input}
                    value={s.enabled === false ? "off" : "on"}
                    onChange={(e) => updateSource({ enabled: e.target.value === "on" })}
                  >
                    <option value="on">enabled</option>
                    <option value="off">disabled</option>
                  </select>
                  <button style={styles.danger} onClick={remove}>×</button>
                </div>

                <div style={{ marginTop: 8 }}>
                  {s.type === "reddit" ? (
                    <div className="m-stack" style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8 }}>
                      <input
                        style={styles.input}
                        placeholder="Subreddit (no r/)"
                        value={s.config?.subreddit || ""}
                        onChange={(e) => updateConfig({ subreddit: e.target.value })}
                      />
                      <input
                        style={styles.input}
                        type="number"
                        min={5}
                        max={50}
                        placeholder="Limit"
                        value={s.config?.limit ?? 25}
                        onChange={(e) => updateConfig({ limit: Number(e.target.value) || 25 })}
                      />
                    </div>
                  ) : null}

                  {s.type === "rss" ? (
                    <input
                      style={styles.input}
                      placeholder="https://example.com/feed.xml"
                      value={s.config?.url || ""}
                      onChange={(e) => updateConfig({ url: e.target.value })}
                    />
                  ) : null}

                  {s.type === "youtube" ? (
                    <input
                      style={styles.input}
                      placeholder="Channel ID (UC...)"
                      value={s.config?.channelId || ""}
                      onChange={(e) => updateConfig({ channelId: e.target.value })}
                    />
                  ) : null}

                  {s.type === "hackernews" ? (
                    <div>
                      <div className="m-stack" style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }}>
                        <input
                          style={styles.input}
                          type="number"
                          placeholder="Min score"
                          value={s.config?.minScore ?? 100}
                          onChange={(e) => updateConfig({ minScore: Number(e.target.value) || 0 })}
                        />
                        <input
                          style={styles.input}
                          placeholder="Keywords (comma-separated, optional)"
                          value={(s.config?.keywords || []).join(", ")}
                          onChange={(e) =>
                            updateConfig({
                              keywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
                            })
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          <button
            style={{ ...styles.ghost, marginTop: 10 }}
            onClick={() => {
              const id = `src-${Date.now()}`;
              const list = config.research?.sources || [];
              setConfig({
                ...config,
                research: {
                  ...(config.research || {}),
                  sources: [
                    ...list,
                    { id, type: "reddit", enabled: true, label: "New source", config: { subreddit: "", limit: 25 } },
                  ],
                },
              });
            }}
          >+ Add source</button>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              style={styles.primary}
              disabled={busy}
              onClick={() => saveSection({ research: config.research })}
            >Save research settings</button>
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
