// Stateless OAuth "state" parameter: carries the user id + platform through the
// OAuth round-trip (the callback has no auth header), tamper-proofed with HMAC.
// Format: base64url(JSON).base64url(hmac).  Expires after 15 min.

const ENC = new TextEncoder();

function b64url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function secret() {
  const s = (typeof process !== "undefined" && process.env && process.env.OAUTH_STATE_SECRET)
    || (typeof Deno !== "undefined" && Deno.env.get("OAUTH_STATE_SECRET")) || "";
  if (!s) throw new Error("OAUTH_STATE_SECRET is not set");
  return s;
}
async function hmacKey() {
  return crypto.subtle.importKey("raw", ENC.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signState({ userId, platform, redirect }) {
  const payload = { u: userId, p: platform, r: redirect || "/settings", n: b64url(crypto.getRandomValues(new Uint8Array(8))), exp: Date.now() + 15 * 60 * 1000 };
  const body = b64url(ENC.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyState(state) {
  if (!state || typeof state !== "string" || !state.includes(".")) return null;
  const [body, sig] = state.split(".");
  const key = await hmacKey();
  const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), ENC.encode(body));
  if (!ok) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))); } catch { return null; }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return { userId: payload.u, platform: payload.p, redirect: payload.r };
}
