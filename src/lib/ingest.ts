// src/lib/ingest.ts

import { createHash } from 'crypto';
import { calcCost } from './pricing';
import { getBillingUnit } from './service-registry';

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
  billingUnit: string;
  qualityScore?: string;
  eventHash?: string;
  rawPayload: unknown;
}

function computeEventHash(model: string, ts: Date, inputTokens: number, outputTokens: number, cachedTokens: number, cacheCreationTokens: number): string {
  const tsSecond = Math.floor(ts.getTime() / 1000);
  return createHash('sha256')
    .update(`${model}:${tsSecond}:${inputTokens}:${outputTokens}:${cachedTokens}:${cacheCreationTokens}`)
    .digest('hex');
}

const CREATIVE_PROVIDERS = new Set(['elevenlabs', 'heygen', 'leonardo', 'stability']);

// Creative service payload format:
// { provider, service_type, model, units_used, cost_usd, latency_ms, status, metadata }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCreativePayload(body: any): NormalizedEvent | null {
  const provider: string = body.provider;
  if (!CREATIVE_PROVIDERS.has(provider)) return null;
  return {
    provider,
    model:              body.model ?? body.service_type ?? provider,
    surface:            body.metadata?.surface,
    sessionId:          body.metadata?.session_id,
    project:            body.metadata?.project,
    inputTokens:        Math.round(body.units_used ?? 0),
    outputTokens:       0,
    reasoningTokens:    0,
    cachedTokens:       0,
    cacheCreationTokens: 0,
    costUsd:            Number(body.cost_usd ?? 0).toFixed(6),
    latencyMs:          body.latency_ms ? Math.round(body.latency_ms) : undefined,
    status:             body.status ?? (body.error ? 'error' : 'ok'),
    contentType:        body.service_type ?? provider,
    billingUnit:        getBillingUnit(provider),
    rawPayload:         body,
  };
}

// LiteLLM wraps all providers in a consistent envelope:
// https://docs.litellm.ai/docs/proxy/logging
// The raw vendor response is in `response` field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseIngestPayload(body: any): NormalizedEvent | null {
  if (body?.provider && CREATIVE_PROVIDERS.has(body.provider)) return parseCreativePayload(body);
  if (!body || typeof body !== 'object') return null;

  // LiteLLM standard envelope
  const model: string = body.model ?? body.response?.model ?? '';
  const provider: string = body.custom_llm_provider ?? inferProvider(model);
  const usage = body.usage ?? body.response?.usage ?? {};
  const latencyMs: number | undefined = body.response_time ? Math.round(body.response_time * 1000) : undefined;
  const sessionId: string | undefined = body.metadata?.session_id ?? body.metadata?.tags?.session_id;
  const project: string | undefined = body.metadata?.project ?? body.metadata?.tags?.project;
  const surface: string | undefined = body.metadata?.surface ?? body.metadata?.tags?.surface;
  const status: string = body.error ? 'error' : (body.response?.choices?.[0]?.finish_reason === 'stop' ? 'ok' : 'ok');
  const contentType: string | undefined = body.content_type ?? undefined;
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
    // LiteLLM normalizes Gemini to OpenAI format; raw usageMetadata is not forwarded.
    // Thinking tokens land in usage.thinking_tokens (our callback) or completion_tokens_details.
    inputTokens     = usage.input_tokens ?? 0;
    outputTokens    = usage.output_tokens ?? 0;
    reasoningTokens = usage.thinking_tokens ?? 0;
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
    ? Number(litellmCost).toFixed(8)
    : calcCost({ model, inputTokens, outputTokens, reasoningTokens, cachedTokens, cacheCreationTokens });

  const ts = new Date();
  const eventHash = computeEventHash(model, ts, inputTokens, outputTokens, cachedTokens, cacheCreationTokens);

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
    contentType,
    billingUnit: getBillingUnit(provider),
    qualityScore,
    eventHash,
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
