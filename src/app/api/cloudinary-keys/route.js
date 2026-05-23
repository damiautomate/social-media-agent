import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, setCloudinaryKeys } from "@/lib/content-bank.js";

function mask(s) {
  if (!s) return null;
  return `••••••••${s.slice(-4)}`;
}

// Verify by hitting Cloudinary's /resources endpoint with the credentials.
async function testCloudinary({ cloudName, apiKey, apiSecret }) {
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image?max_results=1`;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, detail: await res.text().catch(() => "") };
}

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = await getUser(auth.userId);
  const c = user?.cloudinary || {};
  return NextResponse.json({
    hasCreds: !!(c.cloudName && c.apiKey && c.apiSecret),
    cloudName: c.cloudName || null,
    apiKeyMasked: mask(c.apiKey),
    folder: c.folder || null,
  });
}

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { cloudName, apiKey, apiSecret, folder } = body || {};
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "cloudName, apiKey, and apiSecret are all required" },
      { status: 400 },
    );
  }

  const test = await testCloudinary({ cloudName, apiKey, apiSecret });
  if (!test.ok) {
    return NextResponse.json(
      { error: "Cloudinary credentials failed validation", detail: test.detail?.slice?.(0, 200) || `HTTP ${test.status}` },
      { status: 400 },
    );
  }

  await setCloudinaryKeys(auth.userId, { cloudName, apiKey, apiSecret, folder: folder || "social-agent" });
  return NextResponse.json({ ok: true });
}
