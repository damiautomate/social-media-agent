import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { setApiKey, getUser, setOnboardingComplete } from "@/lib/content-bank.js";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function mask(key) {
  if (!key) return null;
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}

async function testApiKey(apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  });

  if (res.ok) return { ok: true };
  let detail = "";
  try {
    const data = await res.json();
    detail = data?.error?.message || data?.error?.type || "";
  } catch {
    detail = await res.text();
  }
  return { ok: false, status: res.status, detail };
}

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = await getUser(auth.userId);
  return NextResponse.json({
    hasKey: !!user?.anthropicApiKey,
    masked: mask(user?.anthropicApiKey),
  });
}

export async function POST(request) {
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

  const { apiKey, completeOnboarding } = body || {};
  if (!apiKey || typeof apiKey !== "string" || apiKey.length < 20) {
    return NextResponse.json({ error: "API key looks invalid" }, { status: 400 });
  }

  const test = await testApiKey(apiKey);
  if (!test.ok) {
    return NextResponse.json(
      {
        error: "API key failed validation",
        detail: test.detail || `HTTP ${test.status}`,
      },
      { status: 400 },
    );
  }

  await setApiKey(auth.userId, apiKey);
  if (completeOnboarding) {
    await setOnboardingComplete(auth.userId);
  }

  return NextResponse.json({ ok: true, masked: mask(apiKey) });
}
