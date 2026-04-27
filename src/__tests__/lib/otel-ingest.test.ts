import { describe, it, expect } from 'vitest';
import { parseOtelPayload } from '@/lib/otel-ingest';

const SAMPLE_OTEL = {
  resourceSpans: [{
    resource: {
      attributes: [{ key: 'service.name', value: { stringValue: 'my-app' } }],
    },
    scopeSpans: [{
      spans: [{
        traceId: 'aabbccddeeff00112233445566778899',
        spanId:  '0011223344556677',
        parentSpanId: '',
        name: 'chat claude-sonnet-4-6',
        startTimeUnixNano: '1745800000000000000',
        endTimeUnixNano:   '1745800001200000000',
        attributes: [
          { key: 'gen_ai.system',                value: { stringValue: 'anthropic' } },
          { key: 'gen_ai.request.model',         value: { stringValue: 'claude-sonnet-4-6' } },
          { key: 'gen_ai.usage.input_tokens',    value: { intValue: 512 } },
          { key: 'gen_ai.usage.output_tokens',   value: { intValue: 128 } },
          { key: 'gen_ai.usage.cache_read_input_tokens', value: { intValue: 256 } },
          { key: 'session.id',                   value: { stringValue: 'sess-otel-123' } },
          { key: 'user.id',                      value: { stringValue: 'user-42' } },
        ],
        status: { code: 1 },
      }],
    }],
  }],
};

describe('parseOtelPayload', () => {
  it('parses a ResourceSpans payload into NormalizedEvent array', () => {
    const results = parseOtelPayload(SAMPLE_OTEL);
    expect(results).toHaveLength(1);
    const ev = results[0];
    expect(ev.provider).toBe('anthropic');
    expect(ev.model).toBe('claude-sonnet-4-6');
    expect(ev.inputTokens).toBe(512);
    expect(ev.outputTokens).toBe(128);
    expect(ev.cachedTokens).toBe(256);
    expect(ev.sessionId).toBe('sess-otel-123');
    expect(ev.userId).toBe('user-42');
    expect(ev.latencyMs).toBe(1200);
    expect(ev.spanId).toBe('0011223344556677');
    expect(ev.parentSpanId).toBeUndefined();
  });

  it('sets parentSpanId when span has a non-empty parentSpanId', () => {
    const payload = JSON.parse(JSON.stringify(SAMPLE_OTEL));
    payload.resourceSpans[0].scopeSpans[0].spans[0].parentSpanId = 'aabbccdd11223344';
    const results = parseOtelPayload(payload);
    expect(results[0].parentSpanId).toBe('aabbccdd11223344');
  });

  it('maps traceId to sessionId when session.id attribute is absent', () => {
    const payload = JSON.parse(JSON.stringify(SAMPLE_OTEL));
    payload.resourceSpans[0].scopeSpans[0].spans[0].attributes =
      payload.resourceSpans[0].scopeSpans[0].spans[0].attributes.filter(
        (a: { key: string }) => a.key !== 'session.id'
      );
    const results = parseOtelPayload(payload);
    expect(results[0].sessionId).toBe('aabbccddeeff00112233445566778899');
  });

  it('returns empty array for invalid payload', () => {
    expect(parseOtelPayload(null)).toEqual([]);
    expect(parseOtelPayload({})).toEqual([]);
    expect(parseOtelPayload({ resourceSpans: [] })).toEqual([]);
  });
});
