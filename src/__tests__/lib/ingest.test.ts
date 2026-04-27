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
