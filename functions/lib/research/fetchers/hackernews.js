// Fetches HN top stories via the free Firebase API.
// Filters by minimum score and (optional) keyword match.

const { stripHtml } = require("../normalize.js");

const TOPSTORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const ITEM_URL = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const MAX_FETCH = 80; // top N stories to consider before filtering

async function fetchHackerNews(source) {
  const { minScore = 50, keywords = [] } = source.config || {};

  const idsRes = await fetch(TOPSTORIES_URL);
  if (!idsRes.ok) throw new Error(`HN topstories HTTP ${idsRes.status}`);
  const allIds = await idsRes.json();
  const ids = (Array.isArray(allIds) ? allIds : []).slice(0, MAX_FETCH);

  const items = await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await fetch(ITEM_URL(id));
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    }),
  );

  const kws = (keywords || []).map((k) => String(k).toLowerCase());
  const matchesKeywords = (text) => {
    if (kws.length === 0) return true;
    const lower = text.toLowerCase();
    return kws.some((k) => lower.includes(k));
  };

  return items
    .filter((it) => it && it.type === "story" && !it.deleted && !it.dead)
    .filter((it) => (it.score || 0) >= minScore)
    .filter((it) => matchesKeywords(`${it.title || ""} ${it.text || ""}`))
    .map((it) => {
      const hnUrl = `https://news.ycombinator.com/item?id=${it.id}`;
      return {
        sourceType: "hackernews",
        sourceId: source.id,
        sourceLabel: source.label,
        url: it.url || hnUrl, // external article preferred; falls back to discussion
        title: it.title || "",
        snippet: stripHtml(it.text || "").slice(0, 800),
        author: it.by || null,
        score: it.score || 0,
        publishedAt: (it.time || 0) * 1000,
        meta: {
          hnUrl,
          numComments: it.descendants || 0,
        },
      };
    });
}

module.exports = { fetchHackerNews };
