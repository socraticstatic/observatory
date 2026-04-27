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
