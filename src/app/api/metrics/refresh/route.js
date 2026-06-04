import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { createPendingJob } from "@/lib/content-bank.js";

// Queues a metrics-refresh job; the edge function pulls performance from each platform.
export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const jobId = await createPendingJob(auth.userId, { type: "metrics" });
  return NextResponse.json({ ok: true, jobId });
}
