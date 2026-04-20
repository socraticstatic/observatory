// src/__tests__/routers/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { sessionsRouter } from '@/server/routers/sessions';

const createCaller = createCallerFactory(sessionsRouter);

const MOCK_ROW = {
  session_id: 'sess-abc123',
  project: 'myproject',
  surface: 'api',
  started_at: new Date('2026-01-01T10:00:00Z'),
  ended_at:   new Date('2026-01-01T10:05:00Z'),
  call_count:  3n,
  total_cost:  0.0045,
  total_tokens: 5000n,
  avg_lat:     1200,
  error_count: 0n,
  models:      ['claude-3-5-sonnet-20241022'],
};

const MOCK_EVENT = {
  id:           'evt-001',
  ts:           new Date('2026-01-01T10:00:00Z'),
  model:        'claude-3-5-sonnet-20241022',
  provider:     'anthropic',
  inputTokens:  1000,
  outputTokens: 500,
  cachedTokens: 200,
  costUsd:      0.0015,
  latencyMs:    1200,
  status:       'ok',
  contentType:  'text',
};

const mockDb = {
  $queryRaw:  vi.fn(),
  llmEvent:   { findMany: vi.fn() },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

describe('sessionsRouter.list', () => {
  it('maps session_id to sessionId', async () => {
    mockDb.$queryRaw.mockResolvedValue([MOCK_ROW]);
    const result = await caller.list({ lookback: '24H' });
    expect(result[0].sessionId).toBe('sess-abc123');
  });

  it('converts bigint call_count to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...MOCK_ROW, call_count: 42n }]);
    const result = await caller.list({ lookback: '24H' });
    expect(typeof result[0].callCount).toBe('number');
    expect(result[0].callCount).toBe(42);
  });

  it('converts bigint error_count to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...MOCK_ROW, error_count: 5n }]);
    const result = await caller.list({ lookback: '24H' });
    expect(typeof result[0].errorCount).toBe('number');
    expect(result[0].errorCount).toBe(5);
  });

  it('computes durationMs from started_at / ended_at', async () => {
    mockDb.$queryRaw.mockResolvedValue([MOCK_ROW]);
    const result = await caller.list({ lookback: '24H' });
    expect(result[0].durationMs).toBe(300_000); // 5 min
  });

  it('returns startedAt as ISO string', async () => {
    mockDb.$queryRaw.mockResolvedValue([MOCK_ROW]);
    const result = await caller.list({ lookback: '24H' });
    expect(result[0].startedAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('returns empty array when no sessions', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.list({ lookback: '1H' });
    expect(result).toEqual([]);
  });
});

describe('sessionsRouter.events', () => {
  it('returns events with ISO ts and numeric costUsd', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([MOCK_EVENT]);
    const result = await caller.events({ sessionId: 'sess-abc123', lookback: '24H' });
    expect(result[0].ts).toBe('2026-01-01T10:00:00.000Z');
    expect(typeof result[0].costUsd).toBe('number');
  });

  it('queries null sessionId for (no session) placeholder', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([]);
    await caller.events({ sessionId: '(no session)', lookback: '24H' });
    const where = mockDb.llmEvent.findMany.mock.calls[0][0].where;
    expect(where.sessionId).toBeNull();
  });
});
