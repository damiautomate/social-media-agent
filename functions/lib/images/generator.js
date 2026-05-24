// Calls OpenAI's GPT Image 2 to generate images.
// Returns the image as a data URI which we then pass to Cloudinary (Cloudinary
// accepts data URIs in its `file` upload parameter, so we never need to
// download/re-upload bytes through the function).
//
// Key constraints:
// - GPT Image 2 ONLY returns base64 (b64_json). No URL response option.
// - Supported standard sizes: 1024x1024, 1024x1536, 1536x1024.
// - Quality tiers: low ($0.006), medium ($0.053), high ($0.211) per image.
//   High triggers a 4-stage reasoning pipeline that can take 30-50x longer
//   than low. Medium is the sweet spot for social media output.

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const MODEL = "gpt-image-2";

// Maps the aspect-ratio strings produced by prompter.aspectFor() to the
// closest GPT Image 2 supported size. GPT Image 2 has three standard sizes.
function sizeFromAspect(aspect) {
  switch (aspect) {
    case "9:16":
    case "4:5":  // closest portrait we can do natively
      return "1024x1536";
    case "16:9":
    case "3:2":
      return "1536x1024";
    case "1:1":
    default:
      return "1024x1024";
  }
}

async function generateImage({ apiKey, prompt, aspectRatio, quality }) {
  const size = sizeFromAspect(aspectRatio);
  const q = ["low", "medium", "high"].includes(quality) ? quality : "medium";

  const body = {
    model: MODEL,
    prompt,
    n: 1,
    size,
    quality: q,
    output_format: "jpeg",
    moderation: "auto",
  };

  const res = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI returned no image data");
  }

  // Cloudinary accepts data URIs in its `file` parameter. This avoids the
  // need to decode to a Buffer or store anywhere intermediate.
  const imageDataUri = `data:image/jpeg;base64,${b64}`;

  return {
    imageUrl: imageDataUri,  // kept this field name to match uploader's interface
    model: MODEL,
    quality: q,
    size,
    predictionId: data?.created ? `openai-${data.created}` : null,
  };
}

module.exports = { generateImage };
