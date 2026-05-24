// fal.ai REST client. We avoid the @fal-ai/client SDK to keep Cloud Function
// cold-start small. fal exposes a uniform queue API across all video models:
//   1. POST https://queue.fal.run/{endpoint}            → returns request_id
//   2. GET  https://queue.fal.run/{endpoint}/requests/{id}/status
//   3. GET  https://queue.fal.run/{endpoint}/requests/{id}            → final result
//
// Auth: header "Authorization: Key {fal_api_key}" (NOT Bearer).

const QUEUE_BASE = "https://queue.fal.run";

const POLL_INTERVAL_MS = 8000;
const POLL_MAX_TRIES = 75;   // up to 10 minutes per clip

function authHeaders(apiKey) {
  return {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function submitJob({ apiKey, model, prompt, aspectRatio, duration }) {
  const input = {
    [model.promptField]: prompt,
    [model.aspectField]: aspectRatio,
    [model.durationField]: duration || model.defaultDuration,
    ...(model.extraInput || {}),
  };

  const url = `${QUEUE_BASE}/${model.endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`fal.ai submit HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.request_id) {
    throw new Error(`fal.ai submit returned no request_id: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.request_id;
}

async function fetchStatus({ apiKey, model, requestId }) {
  const url = `${QUEUE_BASE}/${model.endpoint}/requests/${encodeURIComponent(requestId)}/status`;
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`fal.ai status HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchResult({ apiKey, model, requestId }) {
  const url = `${QUEUE_BASE}/${model.endpoint}/requests/${encodeURIComponent(requestId)}`;
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`fal.ai result HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

// Submit + poll + return video URL. Handles fal's status enum:
// IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED
async function generateClip({ apiKey, model, prompt, aspectRatio, duration }) {
  const requestId = await submitJob({ apiKey, model, prompt, aspectRatio, duration });

  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await fetchStatus({ apiKey, model, requestId });

    if (status.status === "COMPLETED") {
      const result = await fetchResult({ apiKey, model, requestId });
      const videoUrl = result?.video?.url;
      if (!videoUrl) throw new Error("fal.ai completed but returned no video.url");
      return {
        requestId,
        videoUrl,
        fileSize: result?.video?.file_size || null,
        contentType: result?.video?.content_type || "video/mp4",
        duration: duration || model.defaultDuration,
      };
    }
    if (status.status === "FAILED" || status.status === "ERROR") {
      const detail = status?.error || status?.detail || "unknown";
      throw new Error(`fal.ai generation failed: ${JSON.stringify(detail).slice(0, 200)}`);
    }
    // Otherwise: IN_QUEUE | IN_PROGRESS — keep polling
  }
  throw new Error("fal.ai polling timed out (10 min)");
}

// Test the API key without spending credits.
// fal doesn't have a dedicated ping endpoint, but submitting an obviously
// malformed body should produce a 401 (bad key) or 422 (validation) —
// 401 means key is invalid, anything else means the key works.
async function pingKey(apiKey) {
  const res = await fetch(`${QUEUE_BASE}/fal-ai/kling-video/v2.6/pro/text-to-video`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({}),
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, detail: "Unauthorized — check your fal.ai key" };
  }
  // 400/422 = key is valid, body just empty → that's fine for a ping
  return { ok: true };
}

module.exports = { generateClip, pingKey };
