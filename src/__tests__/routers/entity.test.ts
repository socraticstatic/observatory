import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { entityRouter } from '@/server/routers/entity';

const createCaller = createCallerFactory(entityRouter);
const mockDb = {
  $queryRaw: vi.fn(),
  llmEvent: { findMany: vi.fn() },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

describe('entityRouter.projects', () => {
  const ROW = { project: 'obs', calls: 100n, cost: 0.5, sessions: 12n };

  it('converts bigint calls and sessions to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.projects({ lookback: '24H' });
    expect(typeof result[0].calls).toBe('number');
    expect(result[0].calls).toBe(100);
    expect(typeof result[0].sessions).toBe('number');
    expect(result[0].sessions).toBe(12);
  });

  it('maps cost to costUsd', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, cost: 0.25 }]);
    const result = await caller.projects({ lookback: '24H' });
    expect(result[0].costUsd).toBeCloseTo(0.25);
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.projects({ lookback: '1H' });
    expect(result).toEqual([]);
  });
});

describe('entityRouter.sessions', () => {
  const ROW = {
    session_id: 'sess-xyz',
    calls: 3n,
    cost: 0.01,
    first_ts: new Date('2026-01-01T08:00:00Z'),
    last_ts: new Date('2026-01-01T09:00:00Z'),
  };

  it('maps session_id to sessionId and formats ISO timestamps', async () => {
    mockDb.$queryRaw.mockResolvedValue([ROW]);
    const result = await caller.sessions({ project: 'obs', lookback: '24H' });
    expect(result[0].sessionId).toBe('sess-xyz');
    expect(result[0].firstTs).toBe('2026-01-01T08:00:00.000Z');
    expect(result[0].lastTs).toBe('2026-01-01T09:00:00.000Z');
  });

  it('converts bigint calls to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, calls: 5n }]);
    const result = await caller.sessions({ project: 'obs', lookback: '24H' });
    expect(typeof result[0].calls).toBe('number');
    expect(result[0].calls).toBe(5);
  });

  it('maps cost to costUsd', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ROW, cost: 0.05 }]);
    const result = await caller.sessions({ project: 'obs', lookback: '24H' });
    expect(result[0].costUsd).toBeCloseTo(0.05);
  });

  it('returns empty array for no rows', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.sessions({ project: 'obs', lookback: '1H' });
    expect(result).toEqual([]);
  });
});

describe('entityRouter.turns', () => {
  const MOCK_EVENT = {
    id: 'e1',
    ts: new Date('2026-01-01T10:00:00Z'),
    model: 'claude-3-5-sonnet-20241022',
    inputTokens: 500,
    outputTokens: 250,
    costUsd: 0.001,
    latencyMs: 1000,
    status: 'ok',
  };

  it('assigns sequential turn numbers and formats ts as ISO', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([
      MOCK_EVENT,
      { ...MOCK_EVENT, id: 'e2', ts: new Date('2026-01-01T10:01:00Z') },
    ]);
    const result = await caller.turns({ sessionId: 'sess-abc' });
    expect(result[0].turn).toBe(1);
    expect(result[1].turn).toBe(2);
    expect(result[0].ts).toBe('2026-01-01T10:00:00.000Z');
    expect(result[1].ts).toBe('2026-01-01T10:01:00.000Z');
  });

  it('converts costUsd to number', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([MOCK_EVENT]);
    const result = await caller.turns({ sessionId: 'sess-abc' });
    expect(typeof result[0].costUsd).toBe('number');
    expect(result[0].costUsd).toBeCloseTo(0.001);
  });

  it('preserves model and tokens', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([MOCK_EVENT]);
    const result = await caller.turns({ sessionId: 'sess-abc' });
    expect(result[0].model).toBe('claude-3-5-sonnet-20241022');
    expect(result[0].inputTokens).toBe(500);
    expect(result[0].outputTokens).toBe(250);
  });

  it('defaults null latencyMs to null', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([{ ...MOCK_EVENT, latencyMs: null }]);
    const result = await caller.turns({ sessionId: 'sess-abc' });
    expect(result[0].latencyMs).toBeNull();
  });

  it('orders events by ts ascending', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([
      { ...MOCK_EVENT, ts: new Date('2026-01-01T10:02:00Z') },
      { ...MOCK_EVENT, ts: new Date('2026-01-01T10:00:00Z') },
    ]);
    const result = await caller.turns({ sessionId: 'sess-abc' });
    expect(result[0].turn).toBe(1);
    expect(result[1].turn).toBe(2);
  });

  it('returns empty array for no events', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([]);
    const result = await caller.turns({ sessionId: 'sess-empty' });
    expect(result).toEqual([]);
  });

  it('filters by sessionId', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([MOCK_EVENT]);
    await caller.turns({ sessionId: 'sess-test-123' });
    expect(mockDb.llmEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-test-123' },
      })
    );
  });
});
