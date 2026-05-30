import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { supabaseAdmin } from "@/lib/supabase-admin.js";

export async function POST(request) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data: snap } = await supabaseAdmin.from("bootstrap_proposals")
    .select("status").eq("user_id", auth.userId).maybeSingle();
  if (!snap) return NextResponse.json({ ok: true });
  if (snap.status === "pending") {
    await supabaseAdmin.from("bootstrap_proposals")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("user_id", auth.userId);
  }
  return NextResponse.json({ ok: true });
}
