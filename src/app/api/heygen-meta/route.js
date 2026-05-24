import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, getBrandConfig, updateBrandConfig } from "@/lib/content-bank.js";

// Fetch the user's avatars and voices from HeyGen.
async function fetchHeygenLists(apiKey) {
  const [avatarsRes, voicesRes] = await Promise.all([
    fetch("https://api.heygen.com/v2/avatars", { headers: { "X-Api-Key": apiKey } }),
    fetch("https://api.heygen.com/v2/voices", { headers: { "X-Api-Key": apiKey } }),
  ]);

  if (!avatarsRes.ok) {
    throw new Error(`HeyGen /v2/avatars HTTP ${avatarsRes.status}`);
  }
  if (!voicesRes.ok) {
    throw new Error(`HeyGen /v2/voices HTTP ${voicesRes.status}`);
  }

  const avatarsData = await avatarsRes.json();
  const voicesData = await voicesRes.json();

  const avatars = (avatarsData?.data?.avatars || []).map((a) => ({
    id: a.avatar_id,
    name: a.avatar_name || a.avatar_id,
    preview: a.preview_image_url || null,
    type: "avatar",
  }));
  const talkingPhotos = (avatarsData?.data?.talking_photos || []).map((p) => ({
    id: p.talking_photo_id,
    name: p.talking_photo_name || p.talking_photo_id,
    preview: p.preview_image_url || null,
    type: "talking_photo",
  }));
  const voices = (voicesData?.data?.voices || []).slice(0, 200).map((v) => ({
    id: v.voice_id,
    name: v.name || v.voice_id,
    language: v.language || null,
    gender: v.gender || null,
  }));

  return { avatars: [...avatars, ...talkingPhotos], voices };
}

// GET: lists available avatars + voices, plus the current selection.
export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const user = await getUser(auth.userId);
  if (!user?.heygenApiKey) {
    return NextResponse.json({ error: "HeyGen key not configured" }, { status: 400 });
  }

  try {
    const { avatars, voices } = await fetchHeygenLists(user.heygenApiKey);
    const config = await getBrandConfig(auth.userId);
    const selected = config?.videoStyle?.avatar || {};
    return NextResponse.json({ avatars, voices, selected });
  } catch (e) {
    return NextResponse.json({ error: String(e.message).slice(0, 300) }, { status: 502 });
  }
}

// PUT: save the user's avatar + voice selection to brandConfig.videoStyle.avatar
export async function PUT(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { avatarId, avatarType, voiceId, backgroundColor } = body || {};
  if (!avatarId || !voiceId) {
    return NextResponse.json({ error: "avatarId and voiceId required" }, { status: 400 });
  }

  const existing = (await getBrandConfig(auth.userId)) || {};
  const merged = {
    ...(existing.videoStyle || {}),
    avatar: {
      avatarId,
      avatarType: avatarType || "avatar",
      voiceId,
    },
  };
  if (backgroundColor) merged.backgroundColor = backgroundColor;

  await updateBrandConfig(auth.userId, { videoStyle: merged });
  return NextResponse.json({ ok: true, videoStyle: merged });
}
