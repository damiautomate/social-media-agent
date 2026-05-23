// Generic RSS / Atom feed fetcher.
// Handles both formats (channel/item and feed/entry) via fast-xml-parser.

const { XMLParser } = require("fast-xml-parser");
const { stripHtml, ensureArray } = require("../normalize.js");

const UA = "social-media-agent/1.0 (research bot)";
const MAX_ITEMS = 25;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  trimValues: true,
});

function getText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (typeof v["#text"] === "string") return v["#text"];
    if (typeof v["@_href"] === "string") return v["@_href"];
  }
  return String(v);
}

// Atom <link> can be a single object or an array; we want the "alternate" href.
function pickAtomLink(link) {
  const arr = ensureArray(link);
  const alt = arr.find((l) => l && l["@_rel"] === "alternate");
  const chosen = alt || arr[0];
  if (!chosen) return "";
  if (typeof chosen === "string") return chosen;
  return chosen["@_href"] || "";
}

async function fetchRss(source, opts = {}) {
  const { url } = source.config || {};
  if (!url) throw new Error("RSS source missing 'url'");

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`RSS ${url} HTTP ${res.status}`);
  const xml = await res.text();

  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (e) {
    throw new Error(`RSS parse failed for ${url}: ${e.message}`);
  }

  let items = [];
  let isAtom = false;

  if (parsed?.rss?.channel?.item) {
    items = ensureArray(parsed.rss.channel.item);
  } else if (parsed?.feed?.entry) {
    items = ensureArray(parsed.feed.entry);
    isAtom = true;
  } else if (parsed?.["rdf:RDF"]?.item) {
    // RSS 1.0 (RDF)
    items = ensureArray(parsed["rdf:RDF"].item);
  } else {
    return [];
  }

  const sourceType = opts.sourceType || "rss";

  return items.slice(0, MAX_ITEMS).map((it) => {
    const title = getText(it.title).trim();
    const link = isAtom ? pickAtomLink(it.link) : getText(it.link) || getText(it.guid);
    const descRaw = isAtom
      ? (getText(it.summary) || getText(it.content))
      : (getText(it.description) || getText(it["content:encoded"]));
    const snippet = stripHtml(descRaw).slice(0, 800);
    const author = isAtom
      ? getText(it.author?.name) || null
      : (getText(it["dc:creator"]) || getText(it.author) || null);
    const dateStr = isAtom ? (getText(it.published) || getText(it.updated)) : getText(it.pubDate);
    const publishedAt = dateStr ? Date.parse(dateStr) || Date.now() : Date.now();

    return {
      sourceType,
      sourceId: source.id,
      sourceLabel: source.label,
      url: link,
      title,
      snippet,
      author,
      score: null,
      publishedAt,
      meta: { feedUrl: url },
    };
  }).filter((s) => s.url && s.title);
}

module.exports = { fetchRss };
