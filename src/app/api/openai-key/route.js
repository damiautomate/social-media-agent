import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, setOpenaiApiKey } from "@/lib/content-bank.js";

function mask(key) {
  if (!key) return null;
  return `••••••••${key.slice(-4)}`;
}

// Hits OpenAI's /v1/models endpoint — auth-only, no cost.
async function testOpenaiKey(apiKey) {
  const res = await fetch("https://api.openai.com/v1/models?limit=1", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, detail: await res.text().catch(() => "") };
}

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = await getUser(auth.userId);
  return NextResponse.json({
    hasKey: !!user?.openaiApiKey,
    masked: mask(user?.openaiApiKey),
  });
}

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { apiKey } = body || {};
  if (!apiKey || typeof apiKey !== "string" || apiKey.length < 20) {
    return NextResponse.json({ error: "API key looks invalid" }, { status: 400 });
  }

  const test = await testOpenaiKey(apiKey);
  if (!test.ok) {
    return NextResponse.json(
      { error: "OpenAI key failed validation", detail: test.detail?.slice?.(0, 200) || `HTTP ${test.status}` },
      { status: 400 },
    );
  }

  await setOpenaiApiKey(auth.userId, apiKey);
  return NextResponse.json({ ok: true, masked: mask(apiKey) });
          }
