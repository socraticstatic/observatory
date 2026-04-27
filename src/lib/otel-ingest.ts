// src/lib/otel-ingest.ts
// Parses OTel ResourceSpans JSON → NormalizedEvent[]
// Follows OTel GenAI semantic conventions v1.0.0

import { type NormalizedEvent } from './ingest';
import { getBillingUnit } from './service-registry';

type AttrValue = { stringValue?: string; intValue?: number; doubleValue?: number };
type Attribute  = { key: string; value: AttrValue };

function getAttr(attrs: Attribute[], key: string): string | number | undefined {
  const a = attrs.find(a => a.key === key);
  if (!a) return undefined;
  const v = a.value;
  return v.stringValue ?? v.intValue ?? v.doubleValue;
}

function inferProvider(system: string | undefined, model: string): string {
  if (system) return system.toLowerCase();
  if (model.includes('claude'))  return 'anthropic';
  if (model.includes('gemini'))  return 'google';
  if (model.includes('grok'))    return 'xai';
  if (model.includes('llama') || model.includes('mistral')) return 'local';
  return 'unknown';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOtelPayload(body: any): NormalizedEvent[] {
  if (!body || typeof body !== 'object') return [];
  const resourceSpans = body.resourceSpans;
  if (!Array.isArray(resourceSpans) || resourceSpans.length === 0) return [];

  const results: NormalizedEvent[] = [];

  for (const rs of resourceSpans) {
    for (const ss of (rs.scopeSpans ?? [])) {
      for (const span of (ss.spans ?? [])) {
        const attrs: Attribute[] = span.attributes ?? [];

        const system = getAttr(attrs, 'gen_ai.system') as string | undefined;
        const model  = (getAttr(attrs, 'gen_ai.request.model') as string | undefined) ?? '';
        if (!model) continue;

        const provider            = inferProvider(system, model);
        const inputTokens         = Number(getAttr(attrs, 'gen_ai.usage.input_tokens')                ?? 0);
        const outputTokens        = Number(getAttr(attrs, 'gen_ai.usage.output_tokens')               ?? 0);
        const cachedTokens        = Number(getAttr(attrs, 'gen_ai.usage.cache_read_input_tokens')     ?? 0);
        const cacheCreationTokens = Number(getAttr(attrs, 'gen_ai.usage.cache_creation_input_tokens') ?? 0);
        const reasoningTokens     = Number(getAttr(attrs, 'gen_ai.usage.thinking_tokens')             ?? 0);

        const startNs   = Number(BigInt(span.startTimeUnixNano ?? 0));
        const endNs     = Number(BigInt(span.endTimeUnixNano   ?? 0));
        const latencyMs = endNs > startNs ? Math.round((endNs - startNs) / 1_000_000) : undefined;

        const sessionId    = (getAttr(attrs, 'session.id') as string | undefined) || (span.traceId as string | undefined);
        const userId       = getAttr(attrs, 'user.id')   as string | undefined;
        const project      = getAttr(attrs, 'project')   as string | undefined;
        const surface      = getAttr(attrs, 'surface')   as string | undefined;
        const spanId       = span.spanId       as string | undefined;
        const parentSpanId = (span.parentSpanId && span.parentSpanId !== '')
          ? (span.parentSpanId as string) : undefined;

        const status = span.status?.code === 2 ? 'error' : 'ok';

        results.push({
          provider,
          model,
          surface,
          sessionId,
          userId,
          spanId,
          parentSpanId,
          project,
          inputTokens,
          outputTokens,
          reasoningTokens,
          cachedTokens,
          cacheCreationTokens,
          costUsd: '0',
          latencyMs,
          status,
          contentType: undefined,
          billingUnit: getBillingUnit(provider),
          rawPayload: span,
        } as NormalizedEvent);
      }
    }
  }

  return results;
}
