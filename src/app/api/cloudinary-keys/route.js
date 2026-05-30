import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, setCloudinary } from "@/lib/content-bank.js";

function mask(k){ return k ? `••••••••${k.slice(-4)}` : null; }
export async function GET(request){
  const auth = await verifyAuth(request);
  if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
  const user = await getUser(auth.userId);
  const c = user?.cloudinary||{};
  return NextResponse.json({hasCreds:!!(c.cloudName&&c.apiKey&&c.apiSecret), cloudName:c.cloudName||"", apiKeyMasked:mask(c.apiKey), folder:c.folder||""});
}
export async function POST(request){
  const auth = await verifyAuth(request);
  if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
  let body; try{ body = await request.json(); }catch{ return NextResponse.json({error:"Invalid JSON"},{status:400}); }
  const {cloudName,apiKey,apiSecret,folder} = body||{};
  if(!cloudName||!apiKey||!apiSecret) return NextResponse.json({error:"cloudName, apiKey, apiSecret all required"},{status:400});
  await setCloudinary(auth.userId, {cloudName,apiKey,apiSecret,folder:folder||"social-agent"});
  return NextResponse.json({ok:true, cloudName, apiKeyMasked:mask(apiKey), folder:folder||"social-agent"});
}
