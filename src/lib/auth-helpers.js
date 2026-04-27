import { adminAuth } from "./firebase-admin.js";

export async function verifyAuth(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Missing auth token", status: 401 };
  }
  const token = authHeader.substring(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      userId: decoded.uid,
      email: decoded.email || null,
    };
  } catch (err) {
    return { error: "Invalid token", status: 401 };
  }
}
