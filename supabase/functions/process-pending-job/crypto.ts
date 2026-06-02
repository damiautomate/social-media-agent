// AES-256-GCM token encryption. Uses the Web Crypto API (crypto.subtle), which
// exists in BOTH the Next.js/Node server runtime AND the Deno edge function —
// so the same logic encrypts (API routes) and decrypts (edge function).
//
// Key comes from SOCIAL_TOKEN_SECRET: a base64 string decoding to 32 bytes.
// Generate one with:  openssl rand -base64 32
//
// Output format (string): "v1.<ivB64>.<cipherB64>"  — IV is 12 random bytes.

const ENC = new TextEncoder();
const DEC = new TextDecoder();

function b64encode(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey() {
  const secret = (typeof process !== "undefined" && process.env && process.env.SOCIAL_TOKEN_SECRET)
    || (typeof Deno !== "undefined" && Deno.env.get("SOCIAL_TOKEN_SECRET"))
    || "";
  if (!secret) throw new Error("SOCIAL_TOKEN_SECRET is not set");
  const raw = b64decode(secret);
  if (raw.length !== 32) throw new Error("SOCIAL_TOKEN_SECRET must decode to 32 bytes (use: openssl rand -base64 32)");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext) {
  if (plaintext == null) return null;
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ENC.encode(String(plaintext)));
  return `v1.${b64encode(iv)}.${b64encode(cipher)}`;
}

export async function decryptToken(payload) {
  if (!payload) return null;
  const parts = String(payload).split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Bad ciphertext format");
  const key = await getKey();
  const iv = b64decode(parts[1]);
  const cipher = b64decode(parts[2]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return DEC.decode(plain);
}
