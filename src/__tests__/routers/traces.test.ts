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
    expect(JSON.parse(result.nextCursor!)).toEqual({ ts: '2026-04-19T12:00:00.000Z', id: 'evt-001' });
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

describe('tracesRouter.listTree', () => {
  it('returns root spans with nested children', async () => {
    const ROOT_EVENT = {
      id: 'root-1', ts: new Date('2026-04-27T10:00:00Z'),
      provider: 'anthropic', model: 'claude-sonnet-4-6',
      spanId: 'span-root', parentSpanId: null,
      inputTokens: 500, outputTokens: 200, cachedTokens: 0, reasoningTokens: 0,
      costUsd: '0.001', latencyMs: 800, status: 'ok',
      surface: null, project: 'test', sessionId: 'sess-1', userId: null,
    };
    const CHILD_EVENT = {
      ...ROOT_EVENT, id: 'child-1',
      spanId: 'span-child', parentSpanId: 'span-root',
      inputTokens: 100, outputTokens: 50,
    };
    mockFindMany.mockResolvedValue([ROOT_EVENT, CHILD_EVENT]);

    const caller = createCaller(createContext());
    const result = await caller.listTree({ lookback: '24H' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('root-1');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe('child-1');
  });

  it('returns root nodes with empty children when no parent-child relationships', async () => {
    const EVENT_A = {
      id: 'a-1', ts: new Date(), provider: 'anthropic', model: 'claude-haiku',
      spanId: null, parentSpanId: null,
      inputTokens: 200, outputTokens: 80, cachedTokens: 0, reasoningTokens: 0,
      costUsd: '0.0002', latencyMs: 300, status: 'ok',
      surface: null, project: null, sessionId: null, userId: null,
    };
    mockFindMany.mockResolvedValue([EVENT_A]);

    const caller = createCaller(createContext());
    const result = await caller.listTree({ lookback: '24H' });

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(0);
  });

  it('resolves without error on circular span references', async () => {
    const EVENT_A = {
      id: 'cycle-a', ts: new Date(), provider: 'anthropic', model: 'claude-haiku',
      spanId: 'span-a', parentSpanId: 'span-b', // A's parent is B
      inputTokens: 100, outputTokens: 50, cachedTokens: 0, reasoningTokens: 0,
      costUsd: '0.0001', latencyMs: 200, status: 'ok',
      surface: null, project: null, sessionId: null, userId: null,
    };
    const EVENT_B = {
      ...EVENT_A, id: 'cycle-b',
      spanId: 'span-b', parentSpanId: 'span-a', // B's parent is A — cycle!
    };
    mockFindMany.mockResolvedValue([EVENT_A, EVENT_B]);

    const caller = createCaller(createContext());
    const result = await caller.listTree({ lookback: '24H' });

    // Cycle is broken: both nodes end up as roots rather than infinitely nested
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Verify no node appears as a descendant of itself
    const allNodes = result.flatMap(n => [n, ...n.children]);
    for (const node of allNodes) {
      expect(node.children.some(c => c.id === node.id)).toBe(false);
    }
  });
});
