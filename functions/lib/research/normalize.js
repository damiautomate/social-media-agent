const crypto = require("crypto");

// Tracking params that don't change content identity.
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "ref_src", "ref_url", "src", "source",
  "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "_hsenc", "_hsmi",
]);

// Strip protocol, www, trailing slash, fragment, and tracking query params.
function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  let s = rawUrl.trim();
  try {
    const u = new URL(s);
    // Drop tracking params
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
    // Fallback for malformed URLs: lowercase + trim
    return s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

function hashUrl(rawUrl) {
  const norm = normalizeUrl(rawUrl);
  return crypto.createHash("sha1").update(norm).digest("hex").slice(0, 24);
}

// Doc ID for the research_signals collection. Scoped per user.
function signalDocId(userId, rawUrl) {
  return `${userId}_${hashUrl(rawUrl)}`;
}

// Strip HTML tags + decode common entities. Lightweight, no deps.
function stripHtml(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

module.exports = {
  normalizeUrl,
  hashUrl,
  signalDocId,
  stripHtml,
  ensureArray,
};
