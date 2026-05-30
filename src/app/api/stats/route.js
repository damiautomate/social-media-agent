import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getStats } from "@/lib/content-bank.js";

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const stats = await getStats(auth.userId);
  return NextResponse.json(stats);
}
