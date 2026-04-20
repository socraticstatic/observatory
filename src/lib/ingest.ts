// src/lib/ingest.ts

export interface NormalizedEvent {
  provider: string;
  model: string;
  surface?: string;
  sessionId?: string;
  project?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  costUsd: string;
  latencyMs?: number;
  region?: string;
  status: string;
  contentType?: string;
  qualityScore?: string;
  rawPayload: unknown;
}

// Rate table USD per token (rough estimates - replace with real pricing table)
const INPUT_RATE: Record<string, number> = {
  'claude-opus':      0.000015,
  'claude-sonnet':    0.000003,
  'claude-haiku':     0.0000008,
  'gemini-2.5-pro':   0.00000125,
  'gemini-2.5-flash': 0.0000001,
  'grok-3':           0.000003,
  default:            0.000003,
};

const OUTPUT_RATE: Record<string, number> = {
  'claude-opus':      0.000075,
  'claude-sonnet':    0.000015,
  'claude-haiku':     0.000004,
  'gemini-2.5-pro':   0.0000100,
  'gemini-2.5-flash': 0.0000004,
  'grok-3':           0.000015,
  default:            0.000015,
};

function getRate(model: string, table: Record<string, number>): number {
  for (const key of Object.keys(table)) {
    if (key !== 'default' && model.includes(key)) return table[key]!;
  }
  return table.default!;
}

function calcCost(model: string, input: number, output: number, reasoning: number): string {
  const cost =
    input * getRate(model, INPUT_RATE) +
    (output + reasoning) * getRate(model, OUTPUT_RATE);
  return cost.toFixed(6);
}

// LiteLLM wraps all providers in a consistent envelope:
// https://docs.litellm.ai/docs/proxy/logging
// The raw vendor response is in `response` field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseIngestPayload(body: any): NormalizedEvent | null {
  if (!body || typeof body !== 'object') return null;

  // LiteLLM standard envelope
  const model: string = body.model ?? body.response?.model ?? '';
  const provider: string = body.custom_llm_provider ?? inferProvider(model);
  const usage = body.usage ?? body.response?.usage ?? {};
  const latencyMs: number | undefined = body.response_time ? Math.round(body.response_time * 1000) : undefined;
  const sessionId: string | undefined = body.metadata?.session_id ?? body.metadata?.tags?.session_id;
  const project: string | undefined = body.metadata?.project ?? body.metadata?.tags?.project;
  const surface: string | undefined = body.metadata?.surface ?? body.metadata?.tags?.surface;
  const status: string = body.response?.choices?.[0]?.finish_reason === 'stop' ? 'ok' : (body.error ? 'error' : 'ok');
  // Optional quality score — seeder or caller can pass via metadata
  const qualityRaw = body.metadata?.quality_score ?? body.quality_score;
  const qualityScore: string | undefined = qualityRaw != null ? Number(qualityRaw).toFixed(2) : undefined;

  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cachedTokens = 0;
  let cacheCreationTokens = 0;

  if (provider === 'anthropic') {
    // Anthropic: usage.input_tokens + usage.output_tokens
    inputTokens         = usage.input_tokens ?? 0;
    outputTokens        = usage.output_tokens ?? 0;
    cachedTokens        = usage.cache_read_input_tokens ?? 0;
    cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    // Claude 3.7+ thinking tokens
    reasoningTokens     = usage.thinking_tokens ?? 0;
  } else if (provider === 'google') {
    // Gemini: usageMetadata - note: 2.5-pro excludes thought tokens from total
    const meta = body.response?.usageMetadata ?? usage;
    inputTokens     = meta.promptTokenCount ?? meta.input_tokens ?? 0;
    outputTokens    = meta.candidatesTokenCount ?? meta.output_tokens ?? 0;
    // Gemini 2.5 thinking tokens are separate
    reasoningTokens = meta.thoughtsTokenCount ?? 0;
  } else if (provider === 'xai') {
    // Grok: usage.total_tokens but sometimes completion_tokens: 0 bug
    inputTokens  = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
    // Re-count output if vendor returns 0 with content present (known xAI bug)
    if (outputTokens === 0 && body.response?.choices?.[0]?.message?.content) {
      const content: string = body.response.choices[0].message.content;
      outputTokens = Math.ceil(content.length / 4); // rough re-count
    }
  } else {
    // OpenAI-compatible fallback
    inputTokens  = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  }

  // Prefer LiteLLM's own cost field over our rate-table estimate
  const litellmCost = body.response_cost ?? body.cost;
  const costUsd = litellmCost != null
    ? Number(litellmCost).toFixed(6)
    : calcCost(model, inputTokens, outputTokens, reasoningTokens);

  return {
    provider,
    model,
    surface,
    sessionId,
    project,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedTokens,
    cacheCreationTokens,
    costUsd,
    latencyMs,
    status,
    qualityScore,
    rawPayload: body,
  };
}

function inferProvider(model: string): string {
  if (model.includes('claude'))  return 'anthropic';
  if (model.includes('gemini'))  return 'google';
  if (model.includes('grok'))    return 'xai';
  if (model.includes('llama') || model.includes('mistral')) return 'local';
  return 'unknown';
}
