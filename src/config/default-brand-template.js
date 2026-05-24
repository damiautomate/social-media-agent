// Default brand config seeded for new users on first sign-up.
// All values are editable in /onboarding and /settings.

export const DEFAULT_BRAND_TEMPLATE = {
  identity: {
    name: "",
    handle: "",
    tagline: "Marketing automation, CRM systems, and freelance workflows that compound.",
  },
  voice: {
    tone: ["Direct", "Practical", "Human", "Specific"],
    samplePosts: [],
    signaturePhrases: [
      "Here's what most people miss",
      "I tested this so you don't have to",
      "Three things changed when I",
      "The unsexy truth about",
    ],
    avoidPhrases: [
      "game-changer",
      "revolutionary",
      "in today's fast-paced world",
      "leverage synergies",
      "unlock your potential",
      "thoughts?",
    ],
  },
  contentPillars: [
    {
      id: "automation",
      name: "Automation",
      description: "Marketing automation tactics, workflow design, n8n / Zapier / Make recipes, AI agents.",
      weight: 30,
      angles: [
        "before/after a workflow",
        "the failure mode nobody warns you about",
        "tooling tradeoffs",
        "what I'd build first if I started over",
      ],
    },
    {
      id: "crm",
      name: "CRM",
      description: "CRM strategy, lead lifecycle, segmentation, deliverability, list hygiene, GoHighLevel / HubSpot / Klaviyo.",
      weight: 25,
      angles: [
        "audit a broken funnel",
        "why this segment outperformed",
        "the 1-line tweak that fixed deliverability",
      ],
    },
    {
      id: "freelance",
      name: "Freelance",
      description: "Running a freelance practice from Nigeria: pricing, scoping, client comms, contracts, getting paid.",
      weight: 25,
      angles: [
        "the email that closed the deal",
        "scope creep diary",
        "pricing experiments",
      ],
    },
    {
      id: "tools",
      name: "Tools",
      description: "Hands-on reviews and stack walkthroughs of tools the audience actually uses day-to-day.",
      weight: 10,
      angles: [
        "side-by-side comparison",
        "when NOT to use this tool",
        "the underrated feature",
      ],
    },
    {
      id: "personal",
      name: "Personal",
      description: "Behind-the-scenes, lessons, mindset, building in public.",
      weight: 10,
      angles: [
        "the thing I got wrong",
        "what changed this quarter",
        "an honest progress update",
      ],
    },
  ],
  platforms: {
    linkedin: {
      enabled: true,
      postingFrequency: "5/week",
      bestTimes: ["Tue 09:00", "Wed 12:00", "Thu 09:00"],
      rules: {
        hookCharLimit: 150,
        idealLength: "1200-1800 chars",
        emojis: "sparingly",
        externalLinks: "first comment only",
        hashtagCount: "1-3 contextual",
      },
      contentFormats: {
        textPost: 50,
        carousel: 25,
        nativeVideo: 15,
        document: 10,
      },
    },
    instagram: {
      enabled: true,
      postingFrequency: "4/week",
      bestTimes: ["Mon 19:00", "Wed 19:00", "Fri 19:00"],
      rules: {
        captionKeywordsOverHashtags: true,
        hashtagCount: "3-5 max",
        altTextRequired: true,
        reelHookSeconds: 2,
      },
      contentFormats: {
        reel: 50,
        carousel: 35,
        single: 15,
      },
    },
    tiktok: {
      enabled: true,
      postingFrequency: "3/week",
      bestTimes: ["Tue 18:00", "Thu 18:00", "Sat 11:00"],
      rules: {
        hookSeconds: 2,
        idealDurationSeconds: "15-60",
        aigcLabelOnAi: true,
        captionsRequired: true,
        noWatermarks: true,
      },
      contentFormats: {
        shortVideo: 100,
      },
    },
    facebook: {
      enabled: true,
      postingFrequency: "2/week",
      bestTimes: ["Wed 13:00", "Sun 11:00"],
      rules: {
        nativeOverLinkPosts: true,
        toneAdjustment: "casual, community-first",
        crossPost: false,
      },
      contentFormats: {
        textPost: 40,
        video: 35,
        carousel: 25,
      },
    },
  },
  // ---- Phase 3b: Visual style ----
  // Drives image generation. Every image prompt is shaped by this block.
  visualStyle: {
    description:
      "Modern, clean, content-focused photography and minimal illustration. Warm but not saturated. Editorial feel, never stocky.",
    aesthetic: "modern_minimalist",
    // GPT Image 2 quality tier: "low" (~$0.006/img, draft-quality), "medium"
    // (~$0.053/img, social-ready), or "high" (~$0.21/img, premium but slow).
    imageQuality: "medium",
    colorPalette: ["#0F1B2D", "#D4AF37", "#FFFFFF", "#E5E7EB"],
    avoidElements: [
      "embedded text or typography",
      "stock-photo cliches (handshakes, businesspeople pointing at screens)",
      "AI-art tells (warped hands, melted faces, oversaturated palettes)",
      "lens flares and bloom effects",
      "watermarks or signage",
    ],
    referenceUrls: [],
  },
  // ---- Phase 2: Research Agent ----
  // Auto-populates the ideas bank weekly (and on-demand) from real-world signals.
  research: {
    enabled: true,
    schedule: { dayOfWeek: "monday", hourUtc: 6 },
    targetIdeasPerRun: 12,
    dedupeWindowDays: 14,
    // Composite relevanceScore (0-10) = sum(score * weight) across these four dimensions.
    // Weights sum to 1.0.
    scoringWeights: {
      relevance: 0.35,
      novelty: 0.25,
      voiceFit: 0.25,
      urgency: 0.15,
    },
    sources: [
      // --- Reddit ---
      { id: "rd_automation",    type: "reddit", enabled: true,  label: "r/automation",          config: { subreddit: "automation",          limit: 25 } },
      { id: "rd_n8n",           type: "reddit", enabled: true,  label: "r/n8n",                 config: { subreddit: "n8n",                 limit: 20 } },
      { id: "rd_zapier",        type: "reddit", enabled: true,  label: "r/zapier",              config: { subreddit: "zapier",              limit: 15 } },
      { id: "rd_marketingauto", type: "reddit", enabled: true,  label: "r/marketingautomation", config: { subreddit: "marketingautomation", limit: 20 } },
      { id: "rd_freelance",     type: "reddit", enabled: true,  label: "r/freelance",           config: { subreddit: "freelance",           limit: 20 } },
      { id: "rd_entrepreneur",  type: "reddit", enabled: false, label: "r/Entrepreneur",        config: { subreddit: "Entrepreneur",        limit: 15 } },

      // --- Hacker News ---
      // Filters top stories by minScore AND optional keyword match (any keyword).
      // Leave keywords [] to send all qualifying stories to Claude for filtering.
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

      // --- RSS ---
      // Seed with safe, popular feeds. User adds more from Settings.
      { id: "rss_zapier_blog", type: "rss", enabled: true, label: "Zapier Blog",
        config: { url: "https://zapier.com/blog/feeds/latest/" } },
      { id: "rss_n8n_blog",    type: "rss", enabled: true, label: "n8n Blog",
        config: { url: "https://blog.n8n.io/rss/" } },

      // --- YouTube channel RSS ---
      // Format: https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}
      // Channel ID is NOT the @handle. Find it by opening any video on the channel,
      // viewing page source, and searching for "channelId":"UC...".
      // Empty by default — add tracked competitor channels from Settings.
    ],
  },
};

export default DEFAULT_BRAND_TEMPLATE;
