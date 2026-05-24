import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, setHeygenApiKey } from "@/lib/content-bank.js";

function mask(key) {
  if (!key) return null;
  return `••••••••${key.slice(-4)}`;
}

// HeyGen has no dedicated "ping" endpoint, but /v2/avatars is cheap (just lists).
async function testHeygenKey(apiKey) {
  const res = await fetch("https://api.heygen.com/v2/avatars", {
    headers: { "X-Api-Key": apiKey },
  });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, detail: await res.text().catch(() => "") };
}

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = await getUser(auth.userId);
  return NextResponse.json({
    hasKey: !!user?.heygenApiKey,
    masked: mask(user?.heygenApiKey),
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

  const test = await testHeygenKey(apiKey);
  if (!test.ok) {
    return NextResponse.json(
      { error: "HeyGen key failed validation", detail: test.detail?.slice?.(0, 200) || `HTTP ${test.status}` },
      { status: 400 },
    );
  }

  await setHeygenApiKey(auth.userId, apiKey);
  return NextResponse.json({ ok: true, masked: mask(apiKey) });
}
