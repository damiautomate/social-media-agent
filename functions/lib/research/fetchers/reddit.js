// Fetches hot posts from a subreddit via Reddit's public JSON endpoint.
// No auth required, but a descriptive User-Agent is needed to avoid 429s.

const UA = "social-media-agent/1.0 (research bot)";

async function fetchReddit(source) {
  const { subreddit, limit = 25 } = source.config || {};
  if (!subreddit) throw new Error("Reddit source missing 'subreddit'");

  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}&raw_json=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`Reddit r/${subreddit} returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const children = data?.data?.children || [];

  return children
    .filter((c) => c?.data && !c.data.stickied) // skip pinned mod posts
    .map((c) => {
      const p = c.data;
      const permalink = `https://www.reddit.com${p.permalink || ""}`;
      const isSelf = !!p.is_self;
      const externalUrl =
        !isSelf && p.url && !String(p.url).includes("reddit.com") ? p.url : null;

      return {
        sourceType: "reddit",
        sourceId: source.id,
        sourceLabel: source.label,
        url: permalink, // discussion URL — Claude sees more context this way
        title: p.title || "",
        snippet: (p.selftext || "").slice(0, 800),
        author: p.author || null,
        score: typeof p.score === "number" ? p.score : 0,
        publishedAt: (p.created_utc || 0) * 1000,
        meta: {
          subreddit: p.subreddit || subreddit,
          numComments: p.num_comments || 0,
          externalUrl, // article being discussed, if any
          flair: p.link_flair_text || null,
          upvoteRatio: p.upvote_ratio ?? null,
        },
      };
    });
}

module.exports = { fetchReddit };
