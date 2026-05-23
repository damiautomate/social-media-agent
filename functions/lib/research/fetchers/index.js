// Dispatches each source to its fetcher with a per-source timeout.
// Failures on one source do not stop the rest.

const { fetchReddit } = require("./reddit.js");
const { fetchHackerNews } = require("./hackernews.js");
const { fetchRss } = require("./rss.js");
const { fetchYouTube } = require("./youtube.js");

const FETCH_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

const FETCHER_BY_TYPE = {
  reddit: fetchReddit,
  hackernews: fetchHackerNews,
  rss: fetchRss,
  youtube: fetchYouTube,
};

async function fetchAllSources(sources) {
  const enabled = (sources || []).filter((s) => s && s.enabled !== false);

  const results = await Promise.allSettled(
    enabled.map(async (s) => {
      const fetcher = FETCHER_BY_TYPE[s.type];
      if (!fetcher) throw new Error(`Unknown source type: ${s.type}`);
      return withTimeout(fetcher(s), FETCH_TIMEOUT_MS, `${s.type}:${s.id}`);
    }),
  );

  const signals = [];
  const errors = [];
  results.forEach((r, idx) => {
    const src = enabled[idx];
    if (r.status === "fulfilled") {
      signals.push(...(r.value || []));
    } else {
      errors.push({
        sourceId: src.id,
        sourceType: src.type,
        sourceLabel: src.label,
        error: String(r.reason?.message || r.reason),
      });
    }
  });

  return { signals, errors };
}

module.exports = { fetchAllSources };
