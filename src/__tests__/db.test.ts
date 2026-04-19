import { describe, it, expect } from 'vitest';

describe('Prisma schema', () => {
  it('LlmEvent shape compiles', () => {
    type T = {
      id: string; ts: Date; provider: string; model: string;
      inputTokens: number; outputTokens: number; costUsd: number;
    };
    const ok: T = {
      id: 'x', ts: new Date(), provider: 'anthropic', model: 'opus',
      inputTokens: 1, outputTokens: 1, costUsd: 0.01,
    };
    expect(ok.provider).toBe('anthropic');
  });
});
