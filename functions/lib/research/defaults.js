// Mirror of the `research` block in src/config/default-brand-template.js.
// Used by the Cloud Function to backfill defaults for users who onboarded
// before Phase 2 shipped (their brandConfig has no `research` field yet).

const RESEARCH_DEFAULTS = {
  enabled: true,
  schedule: { dayOfWeek: "monday", hourUtc: 6 },
  targetIdeasPerRun: 12,
  dedupeWindowDays: 14,
  scoringWeights: {
    relevance: 0.35,
    novelty: 0.25,
    voiceFit: 0.25,
    urgency: 0.15,
  },
  sources: [
    { id: "rd_automation",    type: "reddit", enabled: true,  label: "r/automation",          config: { subreddit: "automation",          limit: 25 } },
    { id: "rd_n8n",           type: "reddit", enabled: true,  label: "r/n8n",                 config: { subreddit: "n8n",                 limit: 20 } },
    { id: "rd_zapier",        type: "reddit", enabled: true,  label: "r/zapier",              config: { subreddit: "zapier",              limit: 15 } },
    { id: "rd_marketingauto", type: "reddit", enabled: true,  label: "r/marketingautomation", config: { subreddit: "marketingautomation", limit: 20 } },
    { id: "rd_freelance",     type: "reddit", enabled: true,  label: "r/freelance",           config: { subreddit: "freelance",           limit: 20 } },
    { id: "rd_entrepreneur",  type: "reddit", enabled: false, label: "r/Entrepreneur",        config: { subreddit: "Entrepreneur",        limit: 15 } },
    {
      id: "hn_top",
      type: "hackernews",
      enabled: true,
      label: "Hacker News top stories",
      config: {
        minScore: 100,
        keywords: ["automation", "crm", "no-code", "ai agent", "saas", "freelance"],
      },
    },
    { id: "rss_zapier_blog", type: "rss", enabled: true, label: "Zapier Blog",
      config: { url: "https://zapier.com/blog/feeds/latest/" } },
    { id: "rss_n8n_blog",    type: "rss", enabled: true, label: "n8n Blog",
      config: { url: "https://blog.n8n.io/rss/" } },
  ],
};

// Returns the user's research config, merging defaults for any missing top-level fields.
// Does NOT merge into the sources array — if the user has explicitly customized sources,
// we respect that fully. Defaults are only used when the field is undefined.
function mergeResearchDefaults(researchConfig) {
  if (!researchConfig || typeof researchConfig !== "object") {
    return { ...RESEARCH_DEFAULTS };
  }
  return {
    enabled: researchConfig.enabled ?? RESEARCH_DEFAULTS.enabled,
    schedule: researchConfig.schedule || RESEARCH_DEFAULTS.schedule,
    targetIdeasPerRun: researchConfig.targetIdeasPerRun || RESEARCH_DEFAULTS.targetIdeasPerRun,
    dedupeWindowDays: researchConfig.dedupeWindowDays || RESEARCH_DEFAULTS.dedupeWindowDays,
    scoringWeights: researchConfig.scoringWeights || RESEARCH_DEFAULTS.scoringWeights,
    sources: Array.isArray(researchConfig.sources)
      ? researchConfig.sources
      : RESEARCH_DEFAULTS.sources,
  };
}

module.exports = { RESEARCH_DEFAULTS, mergeResearchDefaults };
