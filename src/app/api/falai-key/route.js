import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, setFalaiApiKey } from "@/lib/content-bank.js";

function mask(key) {
  if (!key) return null;
  return `••••••••${key.slice(-4)}`;
}

// Ping fal.ai by submitting an empty body to a real endpoint.
// 401/403 → bad key. 400/422 → key works (just rejected validation).
async function testFalaiKey(apiKey) {
  const res = await fetch("https://queue.fal.run/fal-ai/kling-video/v2.6/pro/text-to-video", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (res.status === 401 || res.status === 403) {
    const detail = await res.text().catch(() => "");
    return { ok: false, detail: detail.slice(0, 200) || `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = await getUser(auth.userId);
  return NextResponse.json({
    hasKey: !!user?.falaiApiKey,
    masked: mask(user?.falaiApiKey),
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

  const test = await testFalaiKey(apiKey);
  if (!test.ok) {
    return NextResponse.json(
      { error: "fal.ai key failed validation", detail: test.detail },
      { status: 400 },
    );
  }

  await setFalaiApiKey(auth.userId, apiKey);
  return NextResponse.json({ ok: true, masked: mask(apiKey) });
}
