"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client.js";
import { AppShell } from "@/components/AppShell.js";

const TABS = [
  { key: "channels", label: "Channels" },
  { key: "keys", label: "AI Keys" },
  { key: "media", label: "Media & Video" },
  { key: "publishing", label: "Publishing" },
  { key: "brand", label: "Brand Voice" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("keys");

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

  const [postizInput, setPostizInput] = useState({ baseUrl: "", apiKey: "" });
  const [postizMasked, setPostizMasked] = useState(null);
  const [postizHasKey, setPostizHasKey] = useState(false);
  const [postizIntegrations, setPostizIntegrations] = useState([]);
  const [postizMsg, setPostizMsg] = useState({ ok: "", err: "" });
  const [pubProvider, setPubProvider] = useState("direct");

  const [savingBrand, setSavingBrand] = useState(false);
  const [brandMsg, setBrandMsg] = useState({ ok: "", err: "" });

  // DIY social channel connections
  const [connections, setConnections] = useState([]);
  const [connBusy, setConnBusy] = useState("");
  const [connMsg, setConnMsg] = useState({ ok: "", err: "" });

  const CHANNELS = [
    { key: "linkedin", label: "LinkedIn", note: "Posts to your personal profile" },
    { key: "facebook", label: "Facebook", note: "Posts to a Facebook Page you manage" },
    { key: "instagram", label: "Instagram", note: "Requires an IG Business account linked to a Page" },
    { key: "tiktok", label: "TikTok", note: "Video only · posts private until your app passes TikTok audit" },
  ];

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
      setPubProvider(postiz?.provider || "direct");
      setPostizMasked(postiz?.postiz?.masked || null);
      setPostizHasKey(!!postiz?.postiz?.hasKey);
      setPostizInput({ baseUrl: postiz?.postiz?.baseUrl || "", apiKey: "" });
      setPostizIntegrations(Array.isArray(postiz.integrations) ? postiz.integrations : []);
      fetch("/api/connections", { headers: h }).then((r) => r.json()).then((c) => setConnections(c.connections || [])).catch(() => {});
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
    setBusy(false); const d = await res.json().catch(() => ({}));
    if (res.ok) { setHasKey(true); setMaskedKey(d.masked); setKeyInput(""); setKeyMsg({ ok: "Verified and saved.", err: "" }); }
    else setKeyMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  async function saveOpenai() {
    setOpenaiMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/openai-key", { method: "POST", body: JSON.stringify({ apiKey: openaiInput }) });
    setBusy(false); const d = await res.json().catch(() => ({}));
    if (res.ok) { setHasOpenai(true); setOpenaiMasked(d.masked); setOpenaiInput(""); setOpenaiMsg({ ok: "Verified and saved.", err: "" }); }
    else setOpenaiMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  async function saveCloud() {
    setCloudMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/cloudinary-keys", { method: "POST", body: JSON.stringify(cloudInput) });
    setBusy(false); const d = await res.json().catch(() => ({}));
    if (res.ok) { setCloud({ hasCreds: true, cloudName: d.cloudName, apiKeyMasked: d.apiKeyMasked, folder: d.folder }); setCloudInput((s) => ({ ...s, apiKey: "", apiSecret: "" })); setCloudMsg({ ok: "Saved.", err: "" }); }
    else setCloudMsg({ ok: "", err: d.error || "Save failed" });
  }
  async function saveHeygen() {
    setHeygenMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/heygen-key", { method: "POST", body: JSON.stringify({ apiKey: heygenInput }) });
    setBusy(false); const d = await res.json().catch(() => ({}));
    if (res.ok) { setHasHeygen(true); setHeygenMasked(d.masked); setHeygenInput(""); setHeygenMsg({ ok: "Verified. Load your avatars below.", err: "" }); }
    else setHeygenMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  async function loadHeygenMeta() {
    setHeygenMsg({ ok: "", err: "" }); setHeygenLoading(true);
    const res = await authedFetch("/api/heygen-meta");
    setHeygenLoading(false); const d = await res.json().catch(() => ({}));
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
    setBusy(false); const d = await res.json().catch(() => ({}));
    if (res.ok) { setHasFalai(true); setFalaiMasked(d.masked); setFalaiInput(""); setFalaiMsg({ ok: "Verified and saved.", err: "" }); }
    else setFalaiMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  function updateBroll(field, value) {
    setConfig({ ...config, videoStyle: { ...(config.videoStyle || {}), broll: { ...(config.videoStyle?.broll || { modelId: "kling-2.6-pro", duration: "5", defaultMode: "single", storyboardClipCount: 3 }), [field]: value } } });
  }
  function updateMediaPref(value) { setConfig({ ...config, publishing: { ...(config.publishing || {}), mediaPreference: value } }); }
  async function savePostiz() {
    if (!postizInput.baseUrl || !postizInput.apiKey) { setPostizMsg({ ok: "", err: "Both base URL and API key required" }); return; }
    setPostizMsg({ ok: "", err: "" }); setBusy(true);
    const res = await authedFetch("/api/postiz-config", { method: "POST", body: JSON.stringify(postizInput) });
    setBusy(false); const d = await res.json().catch(() => ({}));
    if (res.ok) { setPostizHasKey(true); setPostizMasked(d.masked); setPostizIntegrations(d.integrations || []); setPostizInput({ baseUrl: postizInput.baseUrl, apiKey: "" }); setPostizMsg({ ok: `Connected. ${(d.integrations || []).length} integration(s). Map each below.`, err: "" }); }
    else setPostizMsg({ ok: "", err: d.error + (d.detail ? `: ${d.detail}` : "") });
  }
  async function changeProvider(provider) {
    setPubProvider(provider);
    await authedFetch("/api/publishing-provider", { method: "POST", body: JSON.stringify({ provider }) });
  }
  function updateIntegrationKey(integrationId, platformKey) {
    setPostizIntegrations(postizIntegrations.map((i) => i.integrationId === integrationId ? { ...i, platformKey } : i));
  }
  async function saveMappings() {
    setBusy(true);
    const res = await authedFetch("/api/postiz-config", { method: "PUT", body: JSON.stringify({ integrations: postizIntegrations }) });
    setBusy(false); const d = await res.json().catch(() => ({}));
    if (res.ok) { setPostizIntegrations(d.integrations || []); setPostizMsg({ ok: "Platform mappings saved.", err: "" }); }
    else setPostizMsg({ ok: "", err: d.error || "Save failed" });
  }
  async function refreshConnections() {
    const token = await getToken();
    const res = await fetch("/api/connections", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const c = await res.json(); setConnections(c.connections || []); }
  }
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) { setTab("channels"); setConnMsg({ ok: `${p.get("connected")} connected.`, err: "" }); window.history.replaceState({}, "", "/settings"); }
    else if (p.get("channel_error")) { setTab("channels"); setConnMsg({ ok: "", err: decodeURIComponent(p.get("channel_error")) }); window.history.replaceState({}, "", "/settings"); }
  }, []);
  async function connectChannel(platform) {
    setConnMsg({ ok: "", err: "" }); setConnBusy(platform);
    const res = await authedFetch(`/api/connect/${platform}/start`);
    const d = await res.json().catch(() => ({}));
    setConnBusy("");
    if (res.ok && d.url) window.location.href = d.url;
    else setConnMsg({ ok: "", err: d.error || "Could not start connection" });
  }
  async function disconnectChannel(platform) {
    if (!confirm(`Disconnect ${platform}?`)) return;
    setConnBusy(platform);
    await authedFetch("/api/connections", { method: "DELETE", body: JSON.stringify({ platform }) });
    setConnBusy("");
    refreshConnections();
  }

  function setIdentity(field, value) { setConfig({ ...config, identity: { ...(config.identity || {}), [field]: value } }); }
  function setVoiceField(field, value) { setConfig({ ...config, voice: { ...(config.voice || {}), [field]: value } }); }
  function setVisualField(field, value) { setConfig({ ...config, visualStyle: { ...(config.visualStyle || {}), [field]: value } }); }
  async function saveBrand() {
    setSavingBrand(true); setBrandMsg({ ok: "", err: "" });
    const res = await authedFetch("/api/brand-config", { method: "PUT", body: JSON.stringify({
      identity: config.identity, voice: config.voice, visualStyle: config.visualStyle, videoStyle: config.videoStyle, publishing: config.publishing,
    }) });
    setSavingBrand(false);
    if (res.ok) setBrandMsg({ ok: "Saved.", err: "" });
    else setBrandMsg({ ok: "", err: "Save failed" });
  }
  async function logout() { await supabase.auth.signOut(); router.replace("/login"); }

  if (!user || !config) {
    return (
      <AppShell active="settings" onSignOut={logout}>
        <main className="main">
          <div className="page-head"><div className="skeleton" style={{ height: 36, width: 160 }} /></div>
          <div className="skeleton" style={{ height: 300 }} />
        </main>
      </AppShell>
    );
  }

  const keyDot = (on) => <span className="dot" style={{ background: on ? "var(--mint)" : "var(--ink-4)" }} />;

  return (
    <AppShell active="settings" onSignOut={logout}>
      <main className="main">
        <div className="page-head">
          <div className="eyebrow">Configuration</div>
          <h1 className="page-title">Settings</h1>
        </div>

        <div className="tabs-strip">
          {TABS.map((t) => (
            <button key={t.key} className={`tabpill ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {/* ===== CHANNELS (DIY direct publishing) ===== */}
        {tab === "channels" ? (
          <div className="card card-pad">
            <h2 className="section-title">Connected channels</h2>
            <p className="section-desc">Connect your own social accounts for direct publishing — no third-party scheduler. Each connects with one tap once your platform apps are approved.</p>
            <Msg m={connMsg} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {CHANNELS.map((ch) => {
                const conn = connections.find((c) => c.platform === ch.key);
                return (
                  <div key={ch.key} className="int-row" style={{ alignItems: "flex-start" }}>
                    <span className="dot" style={{ background: conn ? "var(--mint)" : "var(--ink-4)", width: 10, height: 10, marginTop: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>{ch.label}</div>
                      {conn ? (
                        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>
                          {conn.accountName || "Connected"}{conn.accountUsername ? ` · @${conn.accountUsername}` : ""}
                          {conn.tokenExpiresAt ? ` · token expires ${new Date(conn.tokenExpiresAt).toLocaleDateString()}` : ""}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{ch.note}</div>
                      )}
                    </div>
                    {conn ? (
                      <button className="btn btn-sm btn-rose" disabled={connBusy === ch.key} onClick={() => disconnectChannel(ch.key)}>Disconnect</button>
                    ) : (
                      <button className="btn btn-sm btn-primary" disabled={connBusy === ch.key} onClick={() => connectChannel(ch.key)}>{connBusy === ch.key ? "…" : "Connect"}</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="note note-info" style={{ marginTop: 16 }}>
              Direct publishing requires your own approved developer apps per platform. See the setup checklist (DIY_PLATFORM_SETUP.md) for exactly what to register.
            </div>
          </div>
        ) : null}

        {/* ===== AI KEYS ===== */}
        {tab === "keys" ? (
          <div className="card card-pad">
            <h2 className="section-title">Anthropic</h2>
            <div className="keystat">{keyDot(hasKey)} {hasKey ? `On file · ${maskedKey}` : "Required for drafts, research, scripts"}</div>
            <div className="field"><input className="input" type="password" placeholder="sk-ant-…" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} /></div>
            <button className="btn btn-primary" disabled={busy || !keyInput} onClick={saveAnthropic}>{busy ? "Verifying…" : "Test & save"}</button>
            <Msg m={keyMsg} />

            <div style={{ height: 1, background: "var(--line-soft)", margin: "22px 0" }} />

            <h2 className="section-title">OpenAI</h2>
            <div className="keystat">{keyDot(hasOpenai)} {hasOpenai ? `On file · ${openaiMasked}` : "Powers image generation (GPT Image 2)"}</div>
            <div className="field"><input className="input" type="password" placeholder="sk-…" value={openaiInput} onChange={(e) => setOpenaiInput(e.target.value)} /></div>
            <button className="btn btn-primary" disabled={busy || !openaiInput} onClick={saveOpenai}>{busy ? "Verifying…" : "Test & save"}</button>
            <Msg m={openaiMsg} />
          </div>
        ) : null}

        {/* ===== MEDIA & VIDEO ===== */}
        {tab === "media" ? (
          <>
            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Cloudinary</h2>
              <div className="keystat">{keyDot(cloud.hasCreds)} {cloud.hasCreds ? `${cloud.cloudName} · ${cloud.apiKeyMasked}` : "Hosts generated images & video"}</div>
              <div className="field"><label className="label">Cloud name</label><input className="input" value={cloudInput.cloudName} onChange={(e) => setCloudInput({ ...cloudInput, cloudName: e.target.value })} /></div>
              <div className="field"><label className="label">API key</label><input className="input" value={cloudInput.apiKey} onChange={(e) => setCloudInput({ ...cloudInput, apiKey: e.target.value })} /></div>
              <div className="field"><label className="label">API secret</label><input className="input" type="password" value={cloudInput.apiSecret} onChange={(e) => setCloudInput({ ...cloudInput, apiSecret: e.target.value })} /></div>
              <div className="field"><label className="label">Folder</label><input className="input" value={cloudInput.folder} onChange={(e) => setCloudInput({ ...cloudInput, folder: e.target.value })} /></div>
              <button className="btn btn-primary" disabled={busy} onClick={saveCloud}>Save</button>
              <Msg m={cloudMsg} />
            </div>

            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <h2 className="section-title">HeyGen · Avatar video</h2>
              <div className="keystat">{keyDot(hasHeygen)} {hasHeygen ? `On file · ${heygenMasked}` : "Create your avatar at app.heygen.com first"}</div>
              <div className="field"><input className="input" type="password" placeholder="HeyGen key" value={heygenInput} onChange={(e) => setHeygenInput(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" disabled={busy || !heygenInput} onClick={saveHeygen}>{busy ? "Verifying…" : "Test & save"}</button>
                {hasHeygen ? <button className="btn btn-ghost" disabled={heygenLoading} onClick={loadHeygenMeta}>{heygenLoading ? "Loading…" : "Load avatars + voices"}</button> : null}
              </div>
              {heygenAvatars.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <div className="field"><label className="label">Avatar ({heygenAvatars.length})</label>
                    <select className="select" value={heygenSel.avatarId} onChange={(e) => { const a = heygenAvatars.find((x) => x.id === e.target.value); setHeygenSel({ ...heygenSel, avatarId: e.target.value, avatarType: a?.type || "avatar" }); }}>
                      <option value="">— select —</option>
                      {heygenAvatars.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                    </select>
                  </div>
                  <div className="field"><label className="label">Voice ({heygenVoices.length})</label>
                    <select className="select" value={heygenSel.voiceId} onChange={(e) => setHeygenSel({ ...heygenSel, voiceId: e.target.value })}>
                      <option value="">— select —</option>
                      {heygenVoices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.language ? ` · ${v.language}` : ""}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-primary" disabled={busy} onClick={saveHeygenSel}>Save avatar + voice</button>
                </div>
              ) : null}
              <Msg m={heygenMsg} />
            </div>

            <div className="card card-pad">
              <h2 className="section-title">fal.ai · B-roll</h2>
              <div className="keystat">{keyDot(hasFalai)} {hasFalai ? `On file · ${falaiMasked}` : "Scene B-roll (Kling / Veo)"}</div>
              <div className="field"><input className="input" type="password" placeholder="fal.ai key" value={falaiInput} onChange={(e) => setFalaiInput(e.target.value)} /></div>
              <button className="btn btn-primary" disabled={busy || !falaiInput} onClick={saveFalai}>{busy ? "Verifying…" : "Test & save"}</button>
              <Msg m={falaiMsg} />
              <div className="field" style={{ marginTop: 16 }}><label className="label">B-roll model</label>
                <select className="select" value={config.videoStyle?.broll?.modelId || "kling-2.6-pro"} onChange={(e) => updateBroll("modelId", e.target.value)}>
                  <option value="kling-2.6-pro">Kling 2.6 Pro — ~$0.10/sec (recommended)</option>
                  <option value="kling-2.5-turbo-pro">Kling 2.5 Turbo Pro — ~$0.07/sec</option>
                  <option value="kling-2.1-standard">Kling 2.1 Standard — ~$0.05/sec</option>
                  <option value="veo3-fast">Veo 3 Fast — ~$0.15/sec</option>
                  <option value="veo3-standard">Veo 3 Standard — ~$0.40/sec</option>
                </select>
              </div>
              <div className="field"><label className="label">Clip duration</label>
                <select className="select" value={config.videoStyle?.broll?.duration || "5"} onChange={(e) => updateBroll("duration", e.target.value)}>
                  <option value="5">5s</option><option value="8">8s</option><option value="10">10s</option>
                </select>
              </div>
              <div className="field"><label className="label">Storyboard clip count (2-5)</label>
                <input className="input" type="number" min="2" max="5" value={config.videoStyle?.broll?.storyboardClipCount || 3} onChange={(e) => updateBroll("storyboardClipCount", Math.min(Math.max(Number(e.target.value), 2), 5))} />
              </div>
              <button className="btn btn-ghost" disabled={savingBrand} onClick={saveBrand}>{savingBrand ? "Saving…" : "Save model choices"}</button>
              <Msg m={brandMsg} />
            </div>
          </>
        ) : null}

        {/* ===== PUBLISHING ===== */}
        {tab === "publishing" ? (
          <>
          <div className="card card-pad">
            <h2 className="section-title">Publishing method</h2>
            <p className="section-desc">Direct = post straight to platforms with your own connected channels (Settings → Channels). Postiz = route through a Postiz instance.</p>
            <div className="seg" style={{ display: "flex", marginBottom: 18 }}>
              <button className={`seg-btn ${pubProvider === "direct" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => changeProvider("direct")}>Direct (DIY)</button>
              <button className={`seg-btn ${pubProvider === "postiz" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => changeProvider("postiz")}>Postiz</button>
            </div>
            {pubProvider === "direct" ? (
              <div className="note note-info" style={{ marginTop: 0 }}>Direct publishing is on. Connect your accounts under <strong>Settings → Channels</strong>, then use Post now / Schedule on any draft.</div>
            ) : null}
          </div>

          {pubProvider === "postiz" ? (
          <div className="card card-pad" style={{ marginTop: 14 }}>
            <h2 className="section-title">Postiz</h2>
            <p className="section-desc">One API for LinkedIn, IG, TikTok, FB & more. Connect your accounts inside Postiz first, then paste your key here.</p>
            <div className="field"><label className="label">Postiz base URL</label><input className="input" value={postizInput.baseUrl} onChange={(e) => setPostizInput({ ...postizInput, baseUrl: e.target.value })} placeholder="https://api.postiz.com or your self-host URL" /></div>
            <div className="field"><label className="label">API key {postizHasKey ? `· current ${postizMasked}` : ""}</label><input className="input" type="password" value={postizInput.apiKey} onChange={(e) => setPostizInput({ ...postizInput, apiKey: e.target.value })} /></div>
            <button className="btn btn-primary" disabled={busy || !postizInput.baseUrl || !postizInput.apiKey} onClick={savePostiz}>{busy ? "Connecting…" : "Test & load integrations"}</button>
            <Msg m={postizMsg} />

            {postizIntegrations.length > 0 ? (
              <div style={{ marginTop: 18 }}>
                <p className="section-desc">Map each channel to a platform key: <code>linkedin</code>, <code>instagram</code>, <code>tiktok</code>, <code>facebook</code>.</p>
                {postizIntegrations.map((i) => (
                  <div key={i.integrationId} className="int-row">
                    {i.picture ? <img src={i.picture} alt="" /> : <span className="dot" style={{ background: "var(--accent)", width: 10, height: 10 }} />}
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, color: "var(--ink)" }}>{i.name}</div><div style={{ fontSize: 11, color: "var(--ink-3)" }}>{i.platform}</div></div>
                    <input className="input" style={{ width: 130, padding: "8px 10px" }} placeholder="platform key" value={i.platformKey || ""} onChange={(e) => updateIntegrationKey(i.integrationId, e.target.value)} />
                  </div>
                ))}
                <button className="btn btn-primary" disabled={busy} onClick={saveMappings}>Save mappings</button>
              </div>
            ) : null}

            <div style={{ height: 1, background: "var(--line-soft)", margin: "22px 0" }} />
            <div className="field"><label className="label">Media preference when publishing</label>
              <select className="select" value={config.publishing?.mediaPreference || "video_first"} onChange={(e) => updateMediaPref(e.target.value)}>
                <option value="video_first">Video first — avatar → broll → images</option>
                <option value="image_first">Image first — images → avatar → broll</option>
                <option value="broll_first">B-roll first — broll → avatar → images</option>
                <option value="text_only">Text only</option>
              </select>
            </div>
            <button className="btn btn-ghost" disabled={savingBrand} onClick={saveBrand}>{savingBrand ? "Saving…" : "Save preference"}</button>
          </div>
          ) : null}
          </>
        ) : null}

        {/* ===== BRAND VOICE ===== */}
        {tab === "brand" ? (
          <>
            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Post images</h2>
              <p className="section-desc">How generated post images look. Branded design cards (recommended) render your hook as clean typography on your brand colors — what a designer would make, and the strongest-performing format. Photo mode generates a realistic photograph instead.</p>
              <div className="seg" style={{ display: "flex", marginBottom: 14 }}>
                <button className={`seg-btn ${(config.visualStyle?.imageStyle || "branded") !== "photo" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setVisualField("imageStyle", "branded")}>Branded card</button>
                <button className={`seg-btn ${config.visualStyle?.imageStyle === "photo" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setVisualField("imageStyle", "photo")}>Photo</button>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div className="field" style={{ flex: 1, minWidth: 130 }}>
                  <label className="label">Background color</label>
                  <input className="input" value={config.visualStyle?.bgColor || "#0E1116"} onChange={(e) => setVisualField("bgColor", e.target.value)} placeholder="#0E1116" />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 130 }}>
                  <label className="label">Accent color</label>
                  <input className="input" value={config.visualStyle?.accentColor || "#8B5CF6"} onChange={(e) => setVisualField("accentColor", e.target.value)} placeholder="#8B5CF6" />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 130 }}>
                  <label className="label">Text color</label>
                  <input className="input" value={config.visualStyle?.textColor || "#F4F4F6"} onChange={(e) => setVisualField("textColor", e.target.value)} placeholder="#F4F4F6" />
                </div>
              </div>
              <button className="btn btn-primary" disabled={savingBrand} onClick={saveBrand}>{savingBrand ? "Saving…" : "Save image style"}</button>
              <Msg m={brandMsg} />
            </div>

            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <h2 className="section-title">Identity</h2>
              <div className="field"><label className="label">Name</label><input className="input" value={config.identity?.name || ""} onChange={(e) => setIdentity("name", e.target.value)} /></div>
              <div className="field"><label className="label">Handle</label><input className="input" value={config.identity?.handle || ""} onChange={(e) => setIdentity("handle", e.target.value)} /></div>
              <div className="field"><label className="label">Tagline</label><input className="input" value={config.identity?.tagline || ""} onChange={(e) => setIdentity("tagline", e.target.value)} /></div>
            </div>
            <div className="card card-pad">
              <h2 className="section-title">Voice</h2>
              <div className="field"><label className="label">Tone (comma-separated)</label><input className="input" value={(config.voice?.tone || []).join(", ")} onChange={(e) => setVoiceField("tone", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></div>
              <div className="field"><label className="label">Signature phrases (one per line)</label><textarea className="textarea" value={(config.voice?.signaturePhrases || []).join("\n")} onChange={(e) => setVoiceField("signaturePhrases", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} /></div>
              <div className="field"><label className="label">Avoid phrases (one per line)</label><textarea className="textarea" value={(config.voice?.avoidPhrases || []).join("\n")} onChange={(e) => setVoiceField("avoidPhrases", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} /></div>
              <button className="btn btn-primary btn-block" disabled={savingBrand} onClick={saveBrand}>{savingBrand ? "Saving…" : "Save brand voice"}</button>
              <Msg m={brandMsg} />
            </div>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}

function Msg({ m }) {
  return (<>{m.ok ? <div className="note note-ok">{m.ok}</div> : null}{m.err ? <div className="note note-err">{m.err}</div> : null}</>);
}
