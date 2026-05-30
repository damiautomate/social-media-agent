import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getBrandConfig, updateBrandConfig } from "@/lib/content-bank.js";

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const config = await getBrandConfig(auth.userId);
  return NextResponse.json({ brandConfig: config });
}

export async function PUT(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const config = await updateBrandConfig(auth.userId, body || {});
  return NextResponse.json({ brandConfig: config });
}
