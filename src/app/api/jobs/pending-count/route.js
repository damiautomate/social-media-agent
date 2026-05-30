import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { supabaseAdmin } from "@/lib/supabase-admin.js";

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { count } = await supabaseAdmin
    .from("pending_jobs").select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId).in("status", ["queued", "processing"]);
  return NextResponse.json({ count: count || 0 });
}
