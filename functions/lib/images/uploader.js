// Uploads an image to Cloudinary by remote URL — Cloudinary fetches the URL
// itself, so we never need to download bytes through the function. Uses a
// signed upload (server-side, requires api_secret) so we can pick the folder
// and public_id deterministically.

const crypto = require("crypto");

// Build the signature string per Cloudinary's spec:
//   sha1(sorted_params_string + api_secret)
// where sorted_params_string is `key1=value1&key2=value2&...` in alphabetical
// key order, EXCLUDING file, cloud_name, resource_type, api_key, signature.
function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

async function uploadToCloudinary({
  cloudName,
  apiKey,
  apiSecret,
  imageUrl,
  folder,
  publicId,
}) {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary credentials missing");
  }
  if (!imageUrl) {
    throw new Error("imageUrl required");
  }

  const timestamp = Math.floor(Date.now() / 1000);

  // Params that go into the signature (everything we want signed except file).
  const signedParams = {
    folder,
    public_id: publicId,
    timestamp,
    overwrite: "true",
  };

  const signature = signParams(signedParams, apiSecret);

  const form = new URLSearchParams();
  form.set("file", imageUrl); // Cloudinary fetches this URL
  form.set("api_key", apiKey);
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  form.set("folder", folder);
  form.set("public_id", publicId);
  form.set("overwrite", "true");

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
  const res = await fetch(url, { method: "POST", body: form });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload HTTP ${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = await res.json();
  if (!data.secure_url) {
    throw new Error("Cloudinary returned no secure_url");
  }

  return {
    secureUrl: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    format: data.format,
  };
}

module.exports = { uploadToCloudinary };
