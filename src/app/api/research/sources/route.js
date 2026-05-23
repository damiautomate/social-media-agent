import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getBrandConfig, updateBrandConfig } from "@/lib/content-bank.js";
import { DEFAULT_BRAND_TEMPLATE } from "@/config/default-brand-template.js";

const VALID_SOURCE_TYPES = new Set(["reddit", "rss", "hackernews", "youtube"]);

function validateSource(s) {
  if (!s || typeof s !== "object") return "Source must be an object";
  if (!s.id || typeof s.id !== "string") return "Source id required";
  if (!VALID_SOURCE_TYPES.has(s.type)) return `Invalid type: ${s.type}`;
  if (!s.label || typeof s.label !== "string") return "Source label required";
  if (!s.config || typeof s.config !== "object") return "Source config required";

  if (s.type === "reddit" && !s.config.subreddit) {
    return "Reddit source needs config.subreddit";
  }
  if (s.type === "rss" && !s.config.url) {
    return "RSS source needs config.url";
  }
  if (s.type === "youtube" && !s.config.channelId) {
    return "YouTube source needs config.channelId";
  }
  if (s.type === "hackernews" && (s.config.minScore == null || isNaN(Number(s.config.minScore)))) {
    return "HN source needs numeric config.minScore";
  }
  return null;
}

function validateResearchPatch(patch) {
  if (!patch || typeof patch !== "object") return "Invalid body";

  if (patch.targetIdeasPerRun != null) {
    const n = Number(patch.targetIdeasPerRun);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return "targetIdeasPerRun must be an integer 1-50";
    }
  }
  if (patch.dedupeWindowDays != null) {
    const n = Number(patch.dedupeWindowDays);
    if (!Number.isInteger(n) || n < 1 || n > 90) {
      return "dedupeWindowDays must be an integer 1-90";
    }
  }
  if (patch.scoringWeights) {
    const w = patch.scoringWeights;
    const total = ["relevance", "novelty", "voiceFit", "urgency"]
      .map((k) => Number(w[k]) || 0)
      .reduce((a, b) => a + b, 0);
    if (total <= 0) return "scoringWeights must sum to a positive number";
  }
  if (patch.sources != null) {
    if (!Array.isArray(patch.sources)) return "sources must be an array";
    for (const s of patch.sources) {
      const err = validateSource(s);
      if (err) return err;
    }
  }
  return null;
}

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const config = await getBrandConfig(auth.userId);
  const research = (config && config.research) || DEFAULT_BRAND_TEMPLATE.research;
  return NextResponse.json({ research });
}

export async function PUT(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const err = validateResearchPatch(body);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  const existing = (await getBrandConfig(auth.userId)) || {};
  const merged = { ...(existing.research || DEFAULT_BRAND_TEMPLATE.research), ...body };
  await updateBrandConfig(auth.userId, { research: merged });

  return NextResponse.json({ research: merged });
}
