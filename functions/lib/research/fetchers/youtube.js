// YouTube channel feed fetcher.
// Uses YouTube's official Atom feed (no API key required):
//   https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}
// Returns the channel's ~15 most recent videos.

const { fetchRss } = require("./rss.js");

async function fetchYouTube(source) {
  const { channelId } = source.config || {};
  if (!channelId) throw new Error("YouTube source missing 'channelId'");

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  // Reuse the Atom parser via fetchRss with the feedUrl injected and a different sourceType tag.
  const wrappedSource = {
    ...source,
    config: { ...source.config, url: feedUrl },
  };
  const signals = await fetchRss(wrappedSource, { sourceType: "youtube" });

  // Enrich meta with channel info
  return signals.map((s) => ({
    ...s,
    meta: { ...s.meta, channelId, feedUrl },
  }));
}

module.exports = { fetchYouTube };
