import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, getBrandConfig, updateBrandConfig } from "@/lib/content-bank.js";

async function fetchLists(apiKey){
  const [a,v] = await Promise.all([
    fetch("https://api.heygen.com/v2/avatars",{headers:{"X-Api-Key":apiKey}}),
    fetch("https://api.heygen.com/v2/voices",{headers:{"X-Api-Key":apiKey}}),
  ]);
  if(!a.ok) throw new Error(`HeyGen /v2/avatars HTTP ${a.status}`);
  if(!v.ok) throw new Error(`HeyGen /v2/voices HTTP ${v.status}`);
  const ad = await a.json(); const vd = await v.json();
  const avatars = (ad?.data?.avatars||[]).map(x=>({id:x.avatar_id,name:x.avatar_name||x.avatar_id,preview:x.preview_image_url||null,type:"avatar"}));
  const photos = (ad?.data?.talking_photos||[]).map(x=>({id:x.talking_photo_id,name:x.talking_photo_name||x.talking_photo_id,preview:x.preview_image_url||null,type:"talking_photo"}));
  const voices = (vd?.data?.voices||[]).slice(0,200).map(x=>({id:x.voice_id,name:x.name||x.voice_id,language:x.language||null,gender:x.gender||null}));
  return {avatars:[...avatars,...photos], voices};
}
export async function GET(request){
  const auth = await verifyAuth(request);
  if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
  const user = await getUser(auth.userId);
  if(!user?.heygenApiKey) return NextResponse.json({error:"HeyGen key not configured"},{status:400});
  try{
    const {avatars,voices} = await fetchLists(user.heygenApiKey);
    const cfg = await getBrandConfig(auth.userId);
    const selected = cfg?.videoStyle?.avatar || {};
    return NextResponse.json({avatars,voices,selected});
  }catch(e){ return NextResponse.json({error:String(e.message).slice(0,300)},{status:502}); }
}
export async function PUT(request){
  const auth = await verifyAuth(request);
  if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
  let body; try{ body = await request.json(); }catch{ return NextResponse.json({error:"Invalid JSON"},{status:400}); }
  const {avatarId,avatarType,voiceId,backgroundColor} = body||{};
  if(!avatarId||!voiceId) return NextResponse.json({error:"avatarId and voiceId required"},{status:400});
  const existing = (await getBrandConfig(auth.userId))||{};
  const merged = { ...(existing.videoStyle||{}), avatar:{avatarId,avatarType:avatarType||"avatar",voiceId} };
  if(backgroundColor) merged.backgroundColor = backgroundColor;
  await updateBrandConfig(auth.userId, {videoStyle:merged});
  return NextResponse.json({ok:true, videoStyle:merged});
}
