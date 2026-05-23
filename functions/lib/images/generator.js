// Calls Replicate's Flux Schnell model to generate images.
// Uses the synchronous "Prefer: wait" pattern so we get the result inline
// instead of having to poll. Falls back to async polling if the wait times out.

const FLUX_SCHNELL_URL =
  "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_TRIES = 40; // ~60s ceiling for slow runs

async function pollPrediction(predictionUrl, apiKey) {
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(predictionUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Replicate poll HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.status === "succeeded") return data;
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`Replicate prediction ${data.status}: ${data.error || ""}`);
    }
  }
  throw new Error("Replicate prediction timed out");
}

// Generates one image for a given prompt. Returns the remote image URL
// (which we then hand off to the uploader to push into Cloudinary).
async function generateImage({ apiKey, prompt, aspectRatio }) {
  const res = await fetch(FLUX_SCHNELL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "wait=55", // block up to 55s; if model is faster we return early
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: aspectRatio || "1:1",
        num_outputs: 1,
        output_format: "jpg",
        output_quality: 90,
        go_fast: true,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Replicate HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  let data = await res.json();

  // If the wait didn't complete, poll the urls.get endpoint
  if (data.status !== "succeeded" && data.urls?.get) {
    data = await pollPrediction(data.urls.get, apiKey);
  }

  // Output is either a string or an array of strings depending on the model.
  let imageUrl = data.output;
  if (Array.isArray(imageUrl)) imageUrl = imageUrl[0];
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("Replicate returned no image URL");
  }

  return {
    imageUrl,
    predictionId: data.id || null,
    model: "flux-schnell",
  };
}

module.exports = { generateImage };
