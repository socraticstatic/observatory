import { describe, it, expect } from 'vitest';
import { parseIngestPayload } from '../../lib/ingest';

describe('parseIngestPayload — userId extraction', () => {
  it('extracts userId from body.user', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      user: 'user-abc',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.userId).toBe('user-abc');
  });

  it('extracts userId from body.metadata.user_id', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      metadata: { user_id: 'user-xyz' },
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.userId).toBe('user-xyz');
  });

  it('body.user takes precedence over metadata.user_id', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      user: 'user-primary',
      metadata: { user_id: 'user-secondary' },
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.userId).toBe('user-primary');
  });

  it('returns undefined userId when not provided', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.userId).toBeUndefined();
  });
});

describe('parseIngestPayload — span fields', () => {
  it('extracts spanId from body.id', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      id: 'span-abc-001',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.spanId).toBe('span-abc-001');
  });

  it('extracts parentSpanId from body.parent_id', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      id: 'span-child',
      parent_id: 'span-root',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.spanId).toBe('span-child');
    expect(result?.parentSpanId).toBe('span-root');
  });

  it('returns undefined for spanId when not provided', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.spanId).toBeUndefined();
    expect(result?.parentSpanId).toBeUndefined();
  });
});

describe('parseIngestPayload — promptHash', () => {
  it('computes a 12-char hex hash of the system prompt', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user',   content: 'Hello' },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.promptHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('returns undefined promptHash when no messages present', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.promptHash).toBeUndefined();
  });

  it('returns same hash for the same system prompt', () => {
    const payload = {
      model: 'claude-sonnet-4-6', custom_llm_provider: 'anthropic',
      messages: [{ role: 'system', content: 'My system prompt.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const r1 = parseIngestPayload(payload);
    const r2 = parseIngestPayload(payload);
    expect(r1?.promptHash).toBe(r2?.promptHash);
  });
});
