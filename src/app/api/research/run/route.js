import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import {
  createResearchJob,
  hasActiveResearchJob,
  getUser,
} from "@/lib/content-bank.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = await getUser(auth.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.anthropicApiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured. Set one in Settings." },
      { status: 400 },
    );
  }

  if (await hasActiveResearchJob(auth.userId)) {
    return NextResponse.json(
      { error: "A research run is already in progress." },
      { status: 429 },
    );
  }

  const jobId = await createResearchJob(auth.userId);
  return NextResponse.json({ jobId, status: "queued" });
}
