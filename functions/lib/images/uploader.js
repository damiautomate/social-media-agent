// Uploads images OR videos to Cloudinary by remote URL.
// Cloudinary fetches the URL itself — we never download/re-upload bytes.
// Uses signed uploads (server-side, requires api_secret).

const crypto = require("crypto");

function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

async function uploadToCloudinaryResource({
  resourceType,  // "image" or "video"
  cloudName,
  apiKey,
  apiSecret,
  fileUrl,       // remote URL OR data URI
  folder,
  publicId,
}) {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary credentials missing");
  }
  if (!fileUrl) throw new Error("fileUrl required");

  const timestamp = Math.floor(Date.now() / 1000);

  const signedParams = {
    folder,
    public_id: publicId,
    timestamp,
    overwrite: "true",
  };
  const signature = signParams(signedParams, apiSecret);

  const form = new URLSearchParams();
  form.set("file", fileUrl);
  form.set("api_key", apiKey);
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  form.set("folder", folder);
  form.set("public_id", publicId);
  form.set("overwrite", "true");

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`;
  const res = await fetch(url, { method: "POST", body: form });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cloudinary ${resourceType} upload HTTP ${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = await res.json();
  if (!data.secure_url) {
    throw new Error(`Cloudinary returned no secure_url for ${resourceType}`);
  }

  return {
    secureUrl: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    duration: data.duration || null,   // videos only
    format: data.format,
  };
}

// Image: backward-compatible wrapper (same shape as Phase 3b's uploader)
async function uploadToCloudinary(args) {
  return uploadToCloudinaryResource({ ...args, resourceType: "image", fileUrl: args.imageUrl });
}

// Video: new in Phase 3c.1
async function uploadVideoToCloudinary(args) {
  return uploadToCloudinaryResource({ ...args, resourceType: "video", fileUrl: args.videoUrl });
}

module.exports = { uploadToCloudinary, uploadVideoToCloudinary };
