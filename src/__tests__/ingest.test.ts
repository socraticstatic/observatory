import { describe, it, expect } from 'vitest';
import { parseIngestPayload } from '../lib/ingest';

describe('parseIngestPayload', () => {
  it('parses Anthropic payload', () => {
    const body = {
      model: 'claude-sonnet-4-5-20251014',
      custom_llm_provider: 'anthropic',
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 300 },
      response_time: 1.5,
      response: { choices: [{ finish_reason: 'stop' }] },
    };
    const result = parseIngestPayload(body);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('anthropic');
    expect(result!.inputTokens).toBe(1000);
    expect(result!.outputTokens).toBe(200);
    expect(result!.cachedTokens).toBe(300);
    expect(result!.latencyMs).toBe(1500);
    expect(result!.status).toBe('ok');
  });

  it('parses Google payload', () => {
    const body = {
      model: 'gemini-2.5-pro-preview-05-06',
      custom_llm_provider: 'google',
      response: {
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 150, thoughtsTokenCount: 200 },
        choices: [{ finish_reason: 'stop' }],
      },
    };
    const result = parseIngestPayload(body);
    expect(result!.provider).toBe('google');
    expect(result!.inputTokens).toBe(500);
    expect(result!.reasoningTokens).toBe(200);
  });

  it('handles xAI grok bug (completion_tokens=0)', () => {
    const body = {
      model: 'grok-3',
      custom_llm_provider: 'xai',
      usage: { prompt_tokens: 800, completion_tokens: 0 },
      response: { choices: [{ finish_reason: 'stop', message: { content: 'Hello world! This is a response.' } }] },
    };
    const result = parseIngestPayload(body);
    expect(result!.outputTokens).toBeGreaterThan(0);
  });

  it('returns null for non-object payload', () => {
    expect(parseIngestPayload(null)).toBeNull();
    expect(parseIngestPayload('string')).toBeNull();
  });
});
