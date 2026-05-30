import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getUser, setPostizConfig, setPublishingIntegrations, setPublishingProvider } from "@/lib/content-bank.js";

function mask(k){ return k ? `••••••••${k.slice(-4)}` : null; }
function normalizeBaseUrl(b){ if(!b) return ""; let u=b.replace(/\/+$/,""); if(u.endsWith("/public/v1"))return u; if(u.endsWith("/api"))return `${u}/public/v1`; return `${u}/public/v1`; }
async function postizFetch({baseUrl,apiKey,path}){ return fetch(`${normalizeBaseUrl(baseUrl)}${path}`,{headers:{Authorization:apiKey,Accept:"application/json"}}); }

export async function GET(request){
  const auth = await verifyAuth(request);
  if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
  const user = await getUser(auth.userId);
  const pub = user?.publishing||{}; const p = pub.postiz||{};
  return NextResponse.json({ provider:pub.provider||null, postiz:{baseUrl:p.baseUrl||"", hasKey:!!p.apiKey, masked:mask(p.apiKey)}, integrations:Array.isArray(pub.integrations)?pub.integrations:[] });
}

export async function POST(request){
  const auth = await verifyAuth(request);
  if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
  let body; try{ body = await request.json(); }catch{ return NextResponse.json({error:"Invalid JSON"},{status:400}); }
  const {baseUrl,apiKey} = body||{};
  if(!baseUrl||typeof baseUrl!=="string") return NextResponse.json({error:"baseUrl required"},{status:400});
  if(!apiKey||typeof apiKey!=="string"||apiKey.length<8) return NextResponse.json({error:"apiKey looks invalid"},{status:400});
  const testRes = await postizFetch({baseUrl,apiKey,path:"/integrations"});
  if(!testRes.ok){ const d=await testRes.text().catch(()=> ""); return NextResponse.json({error:`Postiz auth/connection failed (HTTP ${testRes.status})`, detail:d.slice(0,200)},{status:400}); }
  const list = await testRes.json().catch(()=>[]);
  const arr = Array.isArray(list)?list:(list?.integrations||list?.data||[]);
  const integrations = arr.map(i=>({integrationId:i.id, name:i.name||i.identifier||i.id, platform:i.providerIdentifier||i.identifier||i.type||"unknown", picture:i.picture||null, platformKey:""}));
  await setPostizConfig(auth.userId, {baseUrl,apiKey});
  await setPublishingProvider(auth.userId, "postiz");
  const existing = (await getUser(auth.userId))?.publishing?.integrations||[];
  const merged = integrations.map(i=>{ const prev = existing.find(e=>e.integrationId===i.integrationId); return {...i, platformKey:prev?.platformKey||""}; });
  await setPublishingIntegrations(auth.userId, merged);
  return NextResponse.json({ok:true, masked:mask(apiKey), integrations:merged});
}

export async function PUT(request){
  const auth = await verifyAuth(request);
  if(auth.error) return NextResponse.json({error:auth.error},{status:auth.status});
  let body; try{ body = await request.json(); }catch{ return NextResponse.json({error:"Invalid JSON"},{status:400}); }
  const {integrations} = body||{};
  if(!Array.isArray(integrations)) return NextResponse.json({error:"integrations array required"},{status:400});
  const safe = integrations.filter(i=>i&&i.integrationId).map(i=>({integrationId:String(i.integrationId), name:String(i.name||""), platform:String(i.platform||""), picture:i.picture||null, platformKey:String(i.platformKey||"").toLowerCase()}));
  await setPublishingIntegrations(auth.userId, safe);
  return NextResponse.json({ok:true, integrations:safe});
}
