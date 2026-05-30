// Research pipeline ported to Deno. Fetchers + Claude scorer.
// RSS uses a lightweight regex parser (no fast-xml-parser dependency).

import { anthropicMessage, extractJson } from "./shared.ts";

const UA = "social-media-agent/1.0 (research bot)";

// ---------- normalize ----------
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "ref_src", "ref_url", "src", "source",
  "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "_hsenc", "_hsmi",
]);

function normalizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const s = rawUrl.trim();
  try {
    const u = new URL(s);
    const params = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) params.set(k, v);
    }
    const qs = params.toString();
    let path = u.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    const host = u.host.toLowerCase().replace(/^www\./, "");
    return `${host}${path}${qs ? "?" + qs : ""}`;
  } catch {
    return s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashUrl(rawUrl: string): Promise<string> {
  return (await sha1Hex(normalizeUrl(rawUrl))).slice(0, 24);
}

function stripHtml(s: string): string {
  if (!s || typeof s !== "string") return "";
  return s
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ").trim();
}

// ---------- fetchers ----------
async function fetchReddit(source: any): Promise<any[]> {
  const { subreddit, limit = 25 } = source.config || {};
  if (!subreddit) throw new Error("Reddit source missing 'subreddit'");
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}&raw_json=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Reddit r/${subreddit} returned HTTP ${res.status}`);
  const data = await res.json();
  const children = data?.data?.children || [];
  return children.filter((c: any) => c?.data && !c.data.stickied).map((c: any) => {
    const p = c.data;
    const permalink = `https://www.reddit.com${p.permalink || ""}`;
    const isSelf = !!p.is_self;
    const externalUrl = !isSelf && p.url && !String(p.url).includes("reddit.com") ? p.url : null;
    return {
      sourceType: "reddit", sourceId: source.id, sourceLabel: source.label,
      url: permalink, title: p.title || "", snippet: (p.selftext || "").slice(0, 800),
      author: p.author || null, score: typeof p.score === "number" ? p.score : 0,
      publishedAt: (p.created_utc || 0) * 1000,
      meta: { subreddit: p.subreddit || subreddit, numComments: p.num_comments || 0, externalUrl, flair: p.link_flair_text || null, upvoteRatio: p.upvote_ratio ?? null },
    };
  });
}

async function fetchHackerNews(source: any): Promise<any[]> {
  const { minScore = 50, keywords = [] } = source.config || {};
  const TOPSTORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
  const MAX_FETCH = 80;
  const idsRes = await fetch(TOPSTORIES_URL);
  if (!idsRes.ok) throw new Error(`HN topstories HTTP ${idsRes.status}`);
  const allIds = await idsRes.json();
  const ids = (Array.isArray(allIds) ? allIds : []).slice(0, MAX_FETCH);
  const items = await Promise.all(ids.map(async (id: number) => {
    try { const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`); return r.ok ? await r.json() : null; }
    catch { return null; }
  }));
  const kws = (keywords || []).map((k: string) => String(k).toLowerCase());
  const matchesKeywords = (text: string) => kws.length === 0 || kws.some((k: string) => text.toLowerCase().includes(k));
  return items
    .filter((it: any) => it && it.type === "story" && !it.deleted && !it.dead)
    .filter((it: any) => (it.score || 0) >= minScore)
    .filter((it: any) => matchesKeywords(`${it.title || ""} ${it.text || ""}`))
    .map((it: any) => {
      const hnUrl = `https://news.ycombinator.com/item?id=${it.id}`;
      return {
        sourceType: "hackernews", sourceId: source.id, sourceLabel: source.label,
        url: it.url || hnUrl, title: it.title || "", snippet: stripHtml(it.text || "").slice(0, 800),
        author: it.by || null, score: it.score || 0, publishedAt: (it.time || 0) * 1000,
        meta: { hnUrl, numComments: it.descendants || 0 },
      };
    });
}

// Lightweight RSS/Atom parser via regex (Deno-friendly, no deps)
function parseFeedItems(xml: string): { isAtom: boolean; blocks: string[] } {
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const tag = isAtom ? "entry" : "item";
  const re = new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, "gi");
  const blocks = xml.match(re) || [];
  return { isAtom, blocks };
}
function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}
function extractAtomLink(block: string): string {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return alt[1];
  const any = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return any ? any[1] : "";
}

async function fetchRss(source: any, opts: { sourceType?: string } = {}): Promise<any[]> {
  const { url } = source.config || {};
  if (!url) throw new Error("RSS source missing 'url'");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`RSS ${url} HTTP ${res.status}`);
  const xml = await res.text();
  const { isAtom, blocks } = parseFeedItems(xml);
  const sourceType = opts.sourceType || "rss";
  const MAX_ITEMS = 25;
  return blocks.slice(0, MAX_ITEMS).map((b) => {
    const title = stripHtml(extractTag(b, "title"));
    const link = isAtom ? extractAtomLink(b) : (extractTag(b, "link") || extractTag(b, "guid"));
    const descRaw = isAtom ? (extractTag(b, "summary") || extractTag(b, "content"))
      : (extractTag(b, "description") || extractTag(b, "content:encoded"));
    const snippet = stripHtml(descRaw).slice(0, 800);
    const author = isAtom ? stripHtml(extractTag(b, "name")) : (extractTag(b, "dc:creator") || extractTag(b, "author"));
    const dateStr = isAtom ? (extractTag(b, "published") || extractTag(b, "updated")) : extractTag(b, "pubDate");
    const publishedAt = dateStr ? (Date.parse(dateStr) || Date.now()) : Date.now();
    return { sourceType, sourceId: source.id, sourceLabel: source.label, url: link, title, snippet, author: author || null, score: null, publishedAt, meta: { feedUrl: url } };
  }).filter((s) => s.url && s.title);
}

async function fetchYouTube(source: any): Promise<any[]> {
  const { channelId } = source.config || {};
  if (!channelId) throw new Error("YouTube source missing 'channelId'");
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const wrapped = { ...source, config: { ...source.config, url: feedUrl } };
  const signals = await fetchRss(wrapped, { sourceType: "youtube" });
  return signals.map((s) => ({ ...s, meta: { ...s.meta, channelId, feedUrl } }));
}

export async function fetchYouTubeForBootstrap(channelId: string): Promise<{ title: string; snippet: string }[]> {
  if (!channelId || !channelId.trim()) return [];
  try {
    const signals = await fetchYouTube({ id: "bootstrap_yt", type: "youtube", enabled: true, label: "User YouTube", config: { channelId: channelId.trim() } });
    return signals.slice(0, 10).map((s) => ({ title: s.title, snippet: s.snippet }));
  } catch (e) {
    console.warn("Bootstrap YouTube fetch failed:", (e as Error).message);
    return [];
  }
}

const FETCHER_BY_TYPE: Record<string, (s: any) => Promise<any[]>> = {
  reddit: fetchReddit, hackernews: fetchHackerNews, rss: fetchRss, youtube: fetchYouTube,
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function fetchAllSources(sources: any[]): Promise<{ signals: any[]; errors: any[] }> {
  const enabled = (sources || []).filter((s) => s && s.enabled !== false);
  const results = await Promise.allSettled(enabled.map(async (s) => {
    const fetcher = FETCHER_BY_TYPE[s.type];
    if (!fetcher) throw new Error(`Unknown source type: ${s.type}`);
    return withTimeout(fetcher(s), 15000, `${s.type}:${s.id}`);
  }));
  const signals: any[] = [];
  const errors: any[] = [];
  results.forEach((r, idx) => {
    const src = enabled[idx];
    if (r.status === "fulfilled") signals.push(...(r.value || []));
    else errors.push({ sourceId: src.id, sourceType: src.type, sourceLabel: src.label, error: String((r.reason as Error)?.message || r.reason) });
  });
  return { signals, errors };
}

// ---------- scorer ----------
function clamp(n: any, lo: number, hi: number): number {
  const x = Number(n);
  if (Number.isNaN(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}
function composite(scores: any, weights: any): number {
  const w = weights || {};
  const total = (Number(w.relevance) || 0) + (Number(w.novelty) || 0) + (Number(w.voiceFit) || 0) + (Number(w.urgency) || 0);
  const denom = total > 0 ? total : 1;
  const r = clamp(scores?.relevance, 0, 10), n = clamp(scores?.novelty, 0, 10), v = clamp(scores?.voiceFit, 0, 10), u = clamp(scores?.urgency, 0, 10);
  const raw = r * (Number(w.relevance) || 0) + n * (Number(w.novelty) || 0) + v * (Number(w.voiceFit) || 0) + u * (Number(w.urgency) || 0);
  return Math.round((raw / denom) * 10) / 10;
}

function scorerSystemPrompt(brandConfig: any, weights: any, targetCount: number): string {
  const identity = brandConfig.identity || {};
  const voice = brandConfig.voice || {};
  const pillars = brandConfig.contentPillars || [];
  const tone = (voice.tone || []).join(", ");
  const signature = (voice.signaturePhrases || []).join(" | ") || "(none)";
  const avoid = (voice.avoidPhrases || []).join(", ") || "(none)";
  const samples = (voice.samplePosts || []).slice(0, 3).map((s: any, i: number) => `Sample ${i + 1} (${s.platform || "any"}):\n${(s.text || "").slice(0, 600)}`).join("\n\n") || "(no samples provided)";
  const pillarLines = pillars.map((p: any) => `- id="${p.id}" — ${p.name}: ${p.description} (weight ${p.weight}; angles: ${(p.angles || []).join(" | ")})`).join("\n") || "(no pillars defined)";
  const validPillarIds = pillars.map((p: any) => p.id).join(", ") || "(none)";
  return [
    `You are a research analyst building a content idea bank for ${identity.name || "this user"}` + (identity.handle ? ` (@${identity.handle})` : "") + ".",
    identity.tagline ? `Tagline: ${identity.tagline}` : "",
    "", "## Voice", `Tone descriptors: ${tone || "(unspecified)"}`,
    `Signature phrases the user reaches for: ${signature}`, `Phrases to NEVER suggest: ${avoid}`,
    "", "## Sample posts (this is the user's actual voice)", samples,
    "", "## Content pillars (each idea MUST map to one of these by id)", pillarLines,
    `Valid pillarId values: ${validPillarIds}`,
    "", "## Your job",
    `You will receive a batch of raw signals (forum posts, articles, videos, discussions) gathered from this user's research sources. Output the top ${targetCount} content ideas the user should consider posting about, ranked by overall fit.`,
    "", "Rules:",
    "1. Dedupe SEMANTICALLY. If 3 signals are about the same underlying topic, produce ONE idea that cites all 3.",
    "2. You may combine multiple related signals into a single richer idea.",
    "3. Skip signals that don't fit the user's pillars — do not stretch.",
    "4. Each idea must have a concrete angle, not a generic topic. 'AI agents' is bad. 'Why most AI agent demos collapse on a 5-step task' is good.",
    "5. Match the user's voice when writing the topic and angle (use their signature phrasing patterns, avoid their banned phrases).",
    "", "## Scoring (each 0-10)", "Score every idea on four dimensions:",
    `- relevance: how closely does this connect to the user's pillars and audience? Weight in composite: ${weights.relevance}.`,
    `- novelty: is this fresh / contrarian / underdiscussed, or rehashed common knowledge? Weight: ${weights.novelty}.`,
    `- voiceFit: would this user naturally write about this, given their voice samples? Weight: ${weights.voiceFit}.`,
    `- urgency: is this time-sensitive (trending now, news hook) vs evergreen? Weight: ${weights.urgency}.`,
    "", "## Output format", "Respond with ONLY a single JSON object — no prose, no markdown fences:",
    `{
  "ideas": [
    {
      "topic": "Short topic statement (10-20 words)",
      "angle": "The specific angle / hook this idea takes (one sentence)",
      "pillarId": "one of the valid pillar ids above",
      "scores": { "relevance": 0-10, "novelty": 0-10, "voiceFit": 0-10, "urgency": 0-10 },
      "sourceSignalIds": ["s1", "s7"],
      "reasoning": "1-2 sentences on why this scored as it did"
    }
  ]
}`,
    `Return exactly ${targetCount} ideas (fewer is OK if there isn't enough material — never invent ideas unrelated to the signals).`,
  ].filter(Boolean).join("\n");
}

function scorerUserPrompt(signals: any[]): string {
  const lines = signals.map((s, i) => {
    const idx = `s${i + 1}`;
    const meta: string[] = [];
    if (s.score != null) meta.push(`score=${s.score}`);
    if (s.author) meta.push(`by=${s.author}`);
    if (s.meta?.subreddit) meta.push(`sub=r/${s.meta.subreddit}`);
    const metaStr = meta.length ? ` (${meta.join(", ")})` : "";
    const snippet = (s.snippet || "").slice(0, 400);
    return `[${idx}] (${s.sourceLabel} · ${s.sourceType})${metaStr}\nTITLE: ${s.title}\n${snippet ? `SNIPPET: ${snippet}\n` : ""}URL: ${s.url}`;
  });
  return [`Here are ${signals.length} fresh signals from the user's research sources. Produce the top ideas per the system instructions.`, "", lines.join("\n\n")].join("\n");
}

async function scoreSignalsIntoIdeas({ apiKey, brandConfig, signals, targetCount, weights }: any): Promise<{ ideas: any[]; tokensUsed: number }> {
  const MAX_SIGNALS_TO_SCORE = 80;
  const capped = [...signals].sort((a, b) => {
    const sa = (a.score || 0) + (a.publishedAt || 0) / 1e13;
    const sb = (b.score || 0) + (b.publishedAt || 0) / 1e13;
    return sb - sa;
  }).slice(0, MAX_SIGNALS_TO_SCORE);
  if (capped.length === 0) return { ideas: [], tokensUsed: 0 };

  const system = scorerSystemPrompt(brandConfig, weights, targetCount);
  const user = scorerUserPrompt(capped);
  const { text, tokensUsed } = await anthropicMessage(apiKey, { system, user, maxTokens: 4000 });

  let parsed: any;
  try { parsed = extractJson(text); }
  catch (e) { throw new Error(`Scorer JSON parse failed: ${(e as Error).message}. Raw: ${text.slice(0, 200)}`); }

  const rawIdeas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
  const validPillarIds = new Set((brandConfig.contentPillars || []).map((p: any) => p.id));
  const signalByIdx: Record<string, any> = {};
  capped.forEach((s, i) => { signalByIdx[`s${i + 1}`] = s; });

  const ideas = rawIdeas
    .filter((it: any) => it && typeof it.topic === "string" && it.topic.trim())
    .map((it: any) => {
      const scores = {
        relevance: clamp(it.scores?.relevance, 0, 10), novelty: clamp(it.scores?.novelty, 0, 10),
        voiceFit: clamp(it.scores?.voiceFit, 0, 10), urgency: clamp(it.scores?.urgency, 0, 10),
      };
      const refSignals = (it.sourceSignalIds || []).map((id: string) => signalByIdx[id]).filter(Boolean);
      let pillarId = it.pillarId;
      if (!validPillarIds.has(pillarId)) pillarId = (brandConfig.contentPillars || [])[0]?.id || null;
      return {
        topic: String(it.topic).trim(), angle: it.angle ? String(it.angle).trim() : null, pillarId, scores,
        relevanceScore: composite(scores, weights),
        urgency: scores.urgency >= 8 ? "high" : scores.urgency >= 5 ? "normal" : "low",
        sourceUrls: refSignals.map((s: any) => s.url),
        sourceLabels: [...new Set(refSignals.map((s: any) => s.sourceLabel))],
        reasoning: it.reasoning ? String(it.reasoning).slice(0, 500) : null,
      };
    })
    .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);

  return { ideas, tokensUsed };
}

// ---------- main research entry ----------
export async function runResearch({ admin, userId, jobId, brandConfig, apiKey }: any): Promise<any> {
  const research = (brandConfig.research && Object.keys(brandConfig.research).length) ? brandConfig.research : null;
  if (!research) return { ideasCreated: 0, note: "No research config" };

  const enabledSources = (research.sources || []).filter((s: any) => s.enabled !== false);
  if (!enabledSources.length) return { ideasCreated: 0, note: "No enabled research sources" };

  const { signals, errors } = await fetchAllSources(enabledSources);

  // Dedupe against research_signals from the last N days
  const dedupeWindowDays = research.dedupeWindowDays || 14;
  const cutoffIso = new Date(Date.now() - dedupeWindowDays * 86400000).toISOString();
  const candidates = signals.filter((s) => s && s.url && s.title);

  const fresh: any[] = [];
  for (const s of candidates) {
    const h = await hashUrl(s.url);
    const { data: existing } = await admin.from("research_signals")
      .select("id, created_at").eq("user_id", userId).eq("raw->>urlHash", h)
      .gte("created_at", cutoffIso).limit(1);
    if (existing && existing.length) continue;
    fresh.push({ s, h });
  }

  // Store fresh signals (audit trail)
  if (fresh.length) {
    const rows = fresh.map(({ s, h }) => ({
      user_id: userId, source: s.sourceType, title: s.title, url: s.url, score: s.score ?? 0,
      raw: { urlHash: h, sourceLabel: s.sourceLabel, snippet: s.snippet, author: s.author, publishedAt: s.publishedAt, meta: s.meta },
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await admin.from("research_signals").insert(rows.slice(i, i + 200));
    }
  }

  const freshSignals = fresh.map((f) => f.s);
  if (freshSignals.length === 0) {
    return { ideasCreated: 0, signalsCount: signals.length, freshCount: 0, errors, note: "All signals were duplicates of recent fetches" };
  }

  const { ideas, tokensUsed } = await scoreSignalsIntoIdeas({
    apiKey, brandConfig: { ...brandConfig, research }, signals: freshSignals,
    targetCount: research.targetIdeasPerRun || 12, weights: research.scoringWeights,
  });

  // Write ideas
  if (ideas.length) {
    const rows = ideas.map((idea: any) => ({
      user_id: userId, topic: idea.topic, angle: idea.angle || null, pillar: idea.pillarId || null,
      source: "research", urgency: idea.urgency || "normal", relevance_score: idea.relevanceScore,
      score_detail: { scores: idea.scores, sourceUrls: idea.sourceUrls, sourceLabels: idea.sourceLabels, reasoning: idea.reasoning, jobId },
      status: "new",
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await admin.from("ideas").insert(rows.slice(i, i + 200));
    }
  }

  return { ideasCreated: ideas.length, signalsCount: signals.length, freshCount: freshSignals.length, tokensUsed, errors };
}
