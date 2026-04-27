const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function extractJson(text) {
  const trimmed = text.trim();
  // Allow either a raw JSON object or a fenced ```json block.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : trimmed;
  return JSON.parse(candidate);
}

async function generateDraft({ apiKey, systemPrompt, userPrompt }) {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = (res.content || []).find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("No text content in Claude response");
  }
  const parsed = extractJson(textBlock.text);
  const tokensUsed =
    (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);
  return { draft: parsed, tokensUsed };
}

module.exports = { generateDraft, CLAUDE_MODEL };
