// Verifies the Supabase access token (JWT) sent in the Authorization header.
// Returns { userId, email } or { error, status } — same shape the API routes
// already expect, so route code barely changes from the Firebase version.
import { supabaseAdmin } from "./supabase-admin.js";

export async function verifyAuth(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Missing auth token", status: 401 };
  }
  const token = authHeader.substring(7);
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return { error: "Invalid token", status: 401 };
    }
    return { userId: data.user.id, email: data.user.email || null };
  } catch {
    return { error: "Invalid token", status: 401 };
  }
}
