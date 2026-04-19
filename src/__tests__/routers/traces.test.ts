import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: {
    llmEvent: { findMany: mockFindMany },
  },
}));

import { createCallerFactory, createContext } from '@/server/trpc';
import { tracesRouter } from '@/server/routers/traces';

const createCaller = createCallerFactory(tracesRouter);

const MOCK_EVENT = {
  id: 'evt-001',
  ts: new Date('2026-04-19T12:00:00Z'),
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  inputTokens: 1000,
  outputTokens: 500,
  cachedTokens: 200,
  reasoningTokens: 0,
  costUsd: '0.015000',
  latencyMs: 820,
  status: 'ok',
  sessionId: 'sess-abc',
  project: 'observatory',
  surface: null,
  contentType: null,
  rawPayload: { model: 'claude-sonnet-4-6' },
};

beforeEach(() => {
  mockFindMany.mockClear();
  mockFindMany.mockResolvedValue([MOCK_EVENT]);
});

describe('tracesRouter.list', () => {
  it('returns mapped items with numeric costUsd', async () => {
    const caller = createCaller(createContext());
    const result = await caller.list({ lookback: '24H' });
    expect(result.items).toHaveLength(1);
    expect(typeof result.items[0].costUsd).toBe('number');
    expect(result.items[0].costUsd).toBeCloseTo(0.015);
  });

  it('returns ts as ISO string', async () => {
    const caller = createCaller(createContext());
    const result = await caller.list({ lookback: '24H' });
    expect(result.items[0].ts).toBe('2026-04-19T12:00:00.000Z');
  });

  it('returns nextCursor null when fewer items than limit', async () => {
    const caller = createCaller(createContext());
    const result = await caller.list({ lookback: '24H', limit: 50 });
    expect(result.nextCursor).toBeNull();
  });

  it('returns nextCursor when result equals limit + 1', async () => {
    const extra = { ...MOCK_EVENT, id: 'evt-002', ts: new Date('2026-04-19T11:00:00Z') };
    mockFindMany.mockResolvedValue([MOCK_EVENT, extra]);
    const caller = createCaller(createContext());
    const result = await caller.list({ lookback: '24H', limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('2026-04-19T12:00:00.000Z');
  });

  it('passes provider filter to db when provided', async () => {
    const caller = createCaller(createContext());
    await caller.list({ lookback: '24H', provider: 'google' });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.provider).toBe('google');
  });

  it('passes status filter to db when provided', async () => {
    const caller = createCaller(createContext());
    await caller.list({ lookback: '24H', status: 'error' });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.status).toBe('error');
  });
});
