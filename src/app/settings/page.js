"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);

  // keys
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyMsg, setKeyMsg] = useState({ ok: "", err: "" });

  const [hasOpenai, setHasOpenai] = useState(false);
  const [openaiMasked, setOpenaiMasked] = useState(null);
  const [openaiInput, setOpenaiInput] = useState("");
  const [openaiMsg, setOpenaiMsg] = useState({ ok: "", err: "" });

  const [cloud, setCloud] = useState({ hasCreds: false, cloudName: "", apiKeyMasked: null, folder: "" });
  const [cloudInput, setCloudInput] = useState({ cloudName: "", apiKey: "", apiSecret: "", folder: "social-agent" });
  const [cloudMsg, setCloudMsg] = useState({ ok: "", err: "" });

  const [hasHeygen, setHasHeygen] = useState(false);
  const [heygenMasked, setHeygenMasked] = useState(null);
  const [heygenInput, setHeygenInput] = useState("");
  const [heygenMsg, setHeygenMsg] = useState({ ok: "", err: "" });
  const [heygenAvatars, setHeygenAvatars] = useState([]);
  const [heygenVoices, setHeygenVoices] = useState([]);
  const [heygenSel, setHeygenSel] = useState({ avatarId: "", avatarType: "avatar", voiceId: "" });
  const [heygenLoading, setHeygenLoading] = useState(false);

  const [hasFalai, setHasFalai] = useState(false);
  const [falaiMasked, setFalaiMasked] = useState(null);
  const [falaiInput, setFalaiInput] = useState("");
  const [falaiMsg, setFalaiMsg] = useState({ ok: "", err: "" });

  // publishing
  const [postizInput, setPostizInput] = useState({ baseUrl: "", apiKey: "" });
  const [postizMasked, setPostizMasked] = useState(null);
  const [postizHasKey, setPostizHasKey] = useState(false);
  const [postizIntegrations, setPostizIntegrations] = useState([]);
  const [postizMsg, setPostizMsg] = useState({ ok: "", err: "" });

  const [savingBrand, setSavingBrand] = useState(false);
  const [brandMsg, setBrandMsg] = useState({ ok: "", err: "" });

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
      const h = { Authorization: `Bearer ${token}` };
      const [cfg, key, oai, cl, hg, fal, postiz] = await Promise.all([
        fetch("/api/brand-config", { headers: h }).then((r) => r.json()),
        fetch("/api/api-key", { headers: h }).then((r) => r.json()),
        fetch("/api/openai-key", { headers: h }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/cloudinary-keys", { headers: h }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/heygen-key", { headers: h }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/falai-key", { headers: h }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/postiz-config", { headers: h }).then((r) => r.json()).catch(() => ({})),
      ]);
      setConfig(cfg.brandConfig || null);
      setHasKey(!!key.hasKey); setMaskedKey(key.masked);
      setHasOpenai(!!oai.hasKey); setOpenaiMasked(oai.masked);
      setCloud({ hasCreds: !!cl.hasCreds, cloudName: cl.cloudName || "", apiKeyMasked: cl.apiKeyMasked || null, folder: cl.folder || "" });
      if (cl.cloudName) setCloudInput((s) => ({ ...s, cloudName: cl.cloudName, folder: cl.folder || "social-agent" }));
      setHasHeygen(!!hg.hasKey); setHeygenMasked(hg.masked);
      setHasFalai(!!fal.hasKey); setFalaiMasked(fal.masked);
      setPostizMasked(postiz?.postiz?.masked || null);
      setPostizHasKey(!!postiz?.postiz?.hasKey);
      setPostizInput({ baseUrl: postiz?.postiz?.baseUrl || "", apiKey: "" });
      setPostizIntegrations(Array.isArray(postiz.integrations) ? postiz.integrations : []);
      const av = cfg.brandConfig?.videoStyle?.avatar;
      if (av) setHeygenSel({ avatarId: av.avatarId || "", avatarType: av.avatarType || "avatar", voiceId: av.voiceId || "" });
    })();
  }, [user]);

  async function getToken() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token; }
  async function authedFetch(path, options = {}) {
    const token = await getToken();
    return fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }

  async function saveAnthropic() {
    setKeyMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/api-key", { method: "POST", body: JSON.stringify({ apiKey: keyInput }) });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setHasKey(true); setMaskedKey(d.masked); setKeyInput(""); setKeyMsg({ ok: "Verified and saved.", err: "" }); }
    else setKeyMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  async function saveOpenai() {
    setOpenaiMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/openai-key", { method: "POST", body: JSON.stringify({ apiKey: openaiInput }) });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setHasOpenai(true); setOpenaiMasked(d.masked); setOpenaiInput(""); setOpenaiMsg({ ok: "Verified and saved.", err: "" }); }
    else setOpenaiMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  async function saveCloud() {
    setCloudMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/cloudinary-keys", { method: "POST", body: JSON.stringify(cloudInput) });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setCloud({ hasCreds: true, cloudName: d.cloudName, apiKeyMasked: d.apiKeyMasked, folder: d.folder }); setCloudInput((s) => ({ ...s, apiKey: "", apiSecret: "" })); setCloudMsg({ ok: "Saved.", err: "" }); }
    else setCloudMsg({ ok: "", err: d.error || "Save failed" });
  }
  async function saveHeygen() {
    setHeygenMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/heygen-key", { method: "POST", body: JSON.stringify({ apiKey: heygenInput }) });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setHasHeygen(true); setHeygenMasked(d.masked); setHeygenInput(""); setHeygenMsg({ ok: "Verified. Load your avatars below.", err: "" }); }
    else setHeygenMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  async function loadHeygenMeta() {
    setHeygenMsg({ ok: "", err: "" }); setHeygenLoading(true);
    const res = await authedFetch("/api/heygen-meta");
    setHeygenLoading(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setHeygenAvatars(d.avatars || []); setHeygenVoices(d.voices || []); if (d.selected?.avatarId) setHeygenSel({ avatarId: d.selected.avatarId, avatarType: d.selected.avatarType || "avatar", voiceId: d.selected.voiceId }); }
    else setHeygenMsg({ ok: "", err: d.error || "Failed to load" });
  }
  async function saveHeygenSel() {
    if (!heygenSel.avatarId || !heygenSel.voiceId) { setHeygenMsg({ ok: "", err: "Pick an avatar AND a voice" }); return; }
    setBusy(true);
    const res = await authedFetch("/api/heygen-meta", { method: "PUT", body: JSON.stringify({ ...heygenSel, backgroundColor: config?.videoStyle?.backgroundColor || "#0F1B2D" }) });
    setBusy(false);
    if (res.ok) { const d = await res.json(); setConfig({ ...config, videoStyle: d.videoStyle }); setHeygenMsg({ ok: "Avatar and voice saved.", err: "" }); }
    else { const d = await res.json().catch(() => ({})); setHeygenMsg({ ok: "", err: d.error || "Save failed" }); }
  }
  async function saveFalai() {
    setFalaiMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/falai-key", { method: "POST", body: JSON.stringify({ apiKey: falaiInput }) });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setHasFalai(true); setFalaiMasked(d.masked); setFalaiInput(""); setFalaiMsg({ ok: "Verified and saved.", err: "" }); }
    else setFalaiMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  function updateBroll(field, value) {
    setConfig({ ...config, videoStyle: { ...(config.videoStyle || {}), broll: { ...(config.videoStyle?.broll || { modelId: "kling-2.6-pro", duration: "5", defaultMode: "single", storyboardClipCount: 3 }), [field]: value } } });
  }
  function updateMediaPref(value) {
    setConfig({ ...config, publishing: { ...(config.publishing || {}), mediaPreference: value } });
  }
  async function savePostiz() {
    if (!postizInput.baseUrl || !postizInput.apiKey) { setPostizMsg({ ok: "", err: "Both base URL and API key required" }); return; }
    setPostizMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/postiz-config", { method: "POST", body: JSON.stringify(postizInput) });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setPostizHasKey(true); setPostizMasked(d.masked); setPostizIntegrations(d.integrations || []); setPostizInput({ baseUrl: postizInput.baseUrl, apiKey: "" }); setPostizMsg({ ok: `Connected. ${(d.integrations || []).length} integration(s). Map each below.`, err: "" }); }
    else setPostizMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  function updateIntegrationKey(integrationId, platformKey) {
    setPostizIntegrations(postizIntegrations.map((i) => i.integrationId === integrationId ? { ...i, platformKey } : i));
  }
  async function saveMappings() {
    setBusy(true);
    const res = await authedFetch("/api/postiz-config", { method: "PUT", body: JSON.stringify({ integrations: postizIntegrations }) });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setPostizIntegrations(d.integrations || []); setPostizMsg({ ok: "Platform mappings saved.", err: "" }); }
    else setPostizMsg({ ok: "", err: d.error || "Save failed" });
  }

  // brand config edits
  function setIdentity(field, value) { setConfig({ ...config, identity: { ...(config.identity || {}), [field]: value } }); }
  function setVoiceField(field, value) { setConfig({ ...config, voice: { ...(config.voice || {}), [field]: value } }); }
  async function saveBrand() {
    setSavingBrand(true); setBrandMsg({ ok: "", err: "" });
    const res = await authedFetch("/api/brand-config", { method: "PUT", body: JSON.stringify({
      identity: config.identity, voice: config.voice, visualStyle: config.visualStyle, videoStyle: config.videoStyle, publishing: config.publishing,
    }) });
    setSavingBrand(false);
    if (res.ok) setBrandMsg({ ok: "Saved.", err: "" });
    else setBrandMsg({ ok: "", err: "Save failed" });
  }

  if (!user || !config) {
    return <main style={styles.page}><div style={{ padding: 40, color: "#71717a" }}>Loading…</div></main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.h1}>Settings</h1>
        <a href="/" style={styles.navLink}>← Dashboard</a>
      </div>

      {/* Anthropic */}
      <Section title="Anthropic API Key">
        <p style={styles.sub}>Powers draft generation. {hasKey ? `Current: ${maskedKey}` : "No key on file."}</p>
        <input type="password" placeholder="sk-ant-..." value={keyInput} onChange={(e) => setKeyInput(e.target.value)} style={styles.input} />
        <button style={styles.primary} disabled={busy || !keyInput} onClick={saveAnthropic}>{busy ? "Verifying…" : "Test and save"}</button>
        <Msg m={keyMsg} />
      </Section>

      {/* OpenAI */}
      <Section title="OpenAI API Key">
        <p style={styles.sub}>Powers image generation (GPT Image 2). {hasOpenai ? `Current: ${openaiMasked}` : "No key on file."}</p>
        <input type="password" placeholder="sk-..." value={openaiInput} onChange={(e) => setOpenaiInput(e.target.value)} style={styles.input} />
        <button style={styles.primary} disabled={busy || !openaiInput} onClick={saveOpenai}>{busy ? "Verifying…" : "Test and save"}</button>
        <Msg m={openaiMsg} />
      </Section>

      {/* Cloudinary */}
      <Section title="Cloudinary">
        <p style={styles.sub}>Hosts generated images + videos. {cloud.hasCreds ? `Cloud: ${cloud.cloudName} · key ${cloud.apiKeyMasked}` : "No credentials on file."}</p>
        <label style={styles.label}>Cloud name</label>
        <input value={cloudInput.cloudName} onChange={(e) => setCloudInput({ ...cloudInput, cloudName: e.target.value })} style={styles.input} />
        <label style={styles.label}>API key</label>
        <input value={cloudInput.apiKey} onChange={(e) => setCloudInput({ ...cloudInput, apiKey: e.target.value })} style={styles.input} />
        <label style={styles.label}>API secret</label>
        <input type="password" value={cloudInput.apiSecret} onChange={(e) => setCloudInput({ ...cloudInput, apiSecret: e.target.value })} style={styles.input} />
        <label style={styles.label}>Folder</label>
        <input value={cloudInput.folder} onChange={(e) => setCloudInput({ ...cloudInput, folder: e.target.value })} style={styles.input} />
        <button style={styles.primary} disabled={busy} onClick={saveCloud}>Save</button>
        <Msg m={cloudMsg} />
      </Section>

      {/* HeyGen */}
      <Section title="HeyGen (Avatar Video)">
        <p style={styles.sub}>Powers AI avatar video. {hasHeygen ? `Current: ${heygenMasked}` : "No key on file."} Create your avatar at app.heygen.com/avatars first.</p>
        <input type="password" placeholder="HeyGen key" value={heygenInput} onChange={(e) => setHeygenInput(e.target.value)} style={styles.input} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={styles.primary} disabled={busy || !heygenInput} onClick={saveHeygen}>{busy ? "Verifying…" : "Test and save"}</button>
          {hasHeygen ? <button style={styles.ghost} disabled={heygenLoading} onClick={loadHeygenMeta}>{heygenLoading ? "Loading…" : "Load my avatars + voices"}</button> : null}
        </div>
        {heygenAvatars.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <label style={styles.label}>Avatar ({heygenAvatars.length})</label>
            <select style={styles.input} value={heygenSel.avatarId} onChange={(e) => { const a = heygenAvatars.find((x) => x.id === e.target.value); setHeygenSel({ ...heygenSel, avatarId: e.target.value, avatarType: a?.type || "avatar" }); }}>
              <option value="">— select —</option>
              {heygenAvatars.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
            </select>
            <label style={styles.label}>Voice ({heygenVoices.length})</label>
            <select style={styles.input} value={heygenSel.voiceId} onChange={(e) => setHeygenSel({ ...heygenSel, voiceId: e.target.value })}>
              <option value="">— select —</option>
              {heygenVoices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.language ? ` · ${v.language}` : ""}</option>)}
            </select>
            <button style={{ ...styles.primary, marginTop: 12 }} disabled={busy} onClick={saveHeygenSel}>Save avatar + voice</button>
          </div>
        ) : null}
        <Msg m={heygenMsg} />
      </Section>

      {/* fal.ai */}
      <Section title="fal.ai (B-roll Scenes)">
        <p style={styles.sub}>Powers scene B-roll (Kling/Veo). {hasFalai ? `Current: ${falaiMasked}` : "No key on file."}</p>
        <input type="password" placeholder="fal.ai key" value={falaiInput} onChange={(e) => setFalaiInput(e.target.value)} style={styles.input} />
        <button style={styles.primary} disabled={busy || !falaiInput} onClick={saveFalai}>{busy ? "Verifying…" : "Test and save"}</button>
        <Msg m={falaiMsg} />
        <label style={styles.label}>B-roll model</label>
        <select style={styles.input} value={config.videoStyle?.broll?.modelId || "kling-2.6-pro"} onChange={(e) => updateBroll("modelId", e.target.value)}>
          <option value="kling-2.6-pro">Kling 2.6 Pro — ~$0.10/sec (recommended)</option>
          <option value="kling-2.5-turbo-pro">Kling 2.5 Turbo Pro — ~$0.07/sec</option>
          <option value="kling-2.1-standard">Kling 2.1 Standard — ~$0.05/sec</option>
          <option value="veo3-fast">Veo 3 Fast — ~$0.15/sec</option>
          <option value="veo3-standard">Veo 3 Standard — ~$0.40/sec</option>
        </select>
        <label style={styles.label}>Clip duration</label>
        <select style={styles.input} value={config.videoStyle?.broll?.duration || "5"} onChange={(e) => updateBroll("duration", e.target.value)}>
          <option value="5">5s</option><option value="8">8s</option><option value="10">10s</option>
        </select>
        <label style={styles.label}>Storyboard clip count (2-5)</label>
        <input type="number" min="2" max="5" style={styles.input} value={config.videoStyle?.broll?.storyboardClipCount || 3} onChange={(e) => updateBroll("storyboardClipCount", Math.min(Math.max(Number(e.target.value), 2), 5))} />
        <p style={styles.hint}>Click "Save brand settings" at the bottom to persist model choices.</p>
      </Section>

      {/* Publishing */}
      <Section title="Publishing (Postiz)">
        <p style={styles.sub}>One API for LinkedIn, IG, TikTok, FB + more. Self-host (free) or Postiz Cloud. Connect your accounts in Postiz first.</p>
        <label style={styles.label}>Postiz base URL</label>
        <input value={postizInput.baseUrl} onChange={(e) => setPostizInput({ ...postizInput, baseUrl: e.target.value })} style={styles.input} placeholder="https://your-postiz.example.com or https://api.postiz.com" />
        <label style={styles.label}>Postiz API key {postizHasKey ? `(current: ${postizMasked})` : ""}</label>
        <input type="password" value={postizInput.apiKey} onChange={(e) => setPostizInput({ ...postizInput, apiKey: e.target.value })} style={styles.input} />
        <button style={styles.primary} disabled={busy || !postizInput.baseUrl || !postizInput.apiKey} onClick={savePostiz}>{busy ? "Connecting…" : "Test & load integrations"}</button>
        <Msg m={postizMsg} />
        {postizIntegrations.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <p style={styles.hint}>Map each integration to a platform key (lowercase): linkedin, instagram, tiktok, facebook, x, youtube.</p>
            {postizIntegrations.map((i) => (
              <div key={i.integrationId} style={styles.intRow}>
                {i.picture ? <img src={i.picture} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} /> : null}
                <div style={{ flex: 1, fontSize: 13 }}><div style={{ color: "#e4e4e7" }}>{i.name}</div><div style={{ color: "#71717a", fontSize: 11 }}>{i.platform}</div></div>
                <input type="text" placeholder="platform key" value={i.platformKey || ""} onChange={(e) => updateIntegrationKey(i.integrationId, e.target.value)} style={{ ...styles.input, width: 130, margin: 0, padding: "6px 10px" }} />
              </div>
            ))}
            <button style={styles.primary} disabled={busy} onClick={saveMappings}>Save platform mappings</button>
          </div>
        ) : null}
        <label style={styles.label}>Media preference</label>
        <select style={styles.input} value={config.publishing?.mediaPreference || "video_first"} onChange={(e) => updateMediaPref(e.target.value)}>
          <option value="video_first">Video first — avatar → broll → images</option>
          <option value="image_first">Image first — images → avatar → broll</option>
          <option value="broll_first">B-roll first — broll → avatar → images</option>
          <option value="text_only">Text only</option>
        </select>
      </Section>

      {/* Identity + voice */}
      <Section title="Identity">
        <label style={styles.label}>Name</label>
        <input value={config.identity?.name || ""} onChange={(e) => setIdentity("name", e.target.value)} style={styles.input} />
        <label style={styles.label}>Handle</label>
        <input value={config.identity?.handle || ""} onChange={(e) => setIdentity("handle", e.target.value)} style={styles.input} />
        <label style={styles.label}>Tagline</label>
        <input value={config.identity?.tagline || ""} onChange={(e) => setIdentity("tagline", e.target.value)} style={styles.input} />
      </Section>

      <Section title="Voice">
        <label style={styles.label}>Tone (comma-separated)</label>
        <input value={(config.voice?.tone || []).join(", ")} onChange={(e) => setVoiceField("tone", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} style={styles.input} />
        <label style={styles.label}>Signature phrases (one per line)</label>
        <textarea value={(config.voice?.signaturePhrases || []).join("\n")} onChange={(e) => setVoiceField("signaturePhrases", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} style={{ ...styles.input, minHeight: 90, fontFamily: "inherit" }} />
        <label style={styles.label}>Avoid phrases (one per line)</label>
        <textarea value={(config.voice?.avoidPhrases || []).join("\n")} onChange={(e) => setVoiceField("avoidPhrases", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} style={{ ...styles.input, minHeight: 90, fontFamily: "inherit" }} />
      </Section>

      <div style={{ marginTop: 8, marginBottom: 60 }}>
        <button style={{ ...styles.primary, width: "100%", padding: "14px" }} disabled={savingBrand} onClick={saveBrand}>{savingBrand ? "Saving…" : "Save brand settings"}</button>
        <Msg m={brandMsg} />
      </div>
    </main>
  );
}

function Section({ title, children }) {
  return (<div style={styles.section}><h2 style={styles.h2}>{title}</h2>{children}</div>);
}
function Msg({ m }) {
  return (<>{m.ok ? <div style={styles.ok}>{m.ok}</div> : null}{m.err ? <div style={styles.err}>{m.err}</div> : null}</>);
}

const styles = {
  page: { maxWidth: 720, margin: "0 auto", padding: "24px 16px 80px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  h1: { fontSize: 24, margin: 0, color: "#fafafa" },
  navLink: { color: "#a78bfa", textDecoration: "none", fontSize: 14 },
  section: { backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 20, marginBottom: 16 },
  h2: { fontSize: 17, margin: "0 0 10px", color: "#fafafa" },
  sub: { color: "#a1a1aa", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" },
  hint: { color: "#71717a", fontSize: 11, marginTop: 6 },
  label: { display: "block", color: "#a1a1aa", fontSize: 12, margin: "12px 0 5px" },
  input: { width: "100%", boxSizing: "border-box", backgroundColor: "#0a0a0a", color: "#e4e4e7", border: "1px solid #27272a", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginTop: 4 },
  primary: { marginTop: 12, padding: "10px 16px", backgroundColor: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  ghost: { marginTop: 12, padding: "10px 16px", backgroundColor: "#27272a", color: "#e4e4e7", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 14, cursor: "pointer" },
  intRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 6, backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: 6 },
  ok: { marginTop: 10, color: "#a7f3d0", fontSize: 13 },
  err: { marginTop: 10, color: "#fca5a5", fontSize: 13 },
};
