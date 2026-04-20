import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAggregate, mockCount, mockQueryRaw } = vi.hoisted(() => ({
  mockAggregate: vi.fn(),
  mockCount:     vi.fn(),
  mockQueryRaw:  vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: {
    llmEvent: {
      aggregate: mockAggregate,
      count:     mockCount,
    },
    $queryRaw: mockQueryRaw,
  },
}));

import { createCallerFactory, createContext } from '@/server/trpc';
import { archiveRouter } from '@/server/routers/archive';

const createCaller = createCallerFactory(archiveRouter);

const MOCK_AGG = {
  _sum:   { costUsd: '3.750000', inputTokens: 12000, cachedTokens: 4000 },
  _count: { id: 200 },
  _avg:   { latencyMs: 950 },
};

function resetMocks() {
  mockAggregate.mockResolvedValue(MOCK_AGG);
  mockCount.mockResolvedValue(8);
  // $queryRaw called 3x: byModel, byProvider, daily
  mockQueryRaw
    .mockResolvedValueOnce([{ model: 'claude-sonnet-4-6', cost: 3.0, calls: 160 }])
    .mockResolvedValueOnce([{ provider: 'anthropic', cost: 3.5, calls: 180 }])
    .mockResolvedValueOnce([{ day: new Date('2026-03-15T00:00:00Z'), cost: 1.5, calls: 80 }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMocks();
});

describe('archiveRouter.summary', () => {
  it('returns totalCostUsd as a number', async () => {
    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    expect(typeof result.totalCostUsd).toBe('number');
    expect(result.totalCostUsd).toBeCloseTo(3.75);
  });

  it('returns totalCalls', async () => {
    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    expect(result.totalCalls).toBe(200);
  });

  it('returns errorCount from llmEvent.count', async () => {
    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    expect(result.errorCount).toBe(8);
  });

  it('returns avgLatencyMs', async () => {
    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    expect(result.avgLatencyMs).toBeCloseTo(950);
  });

  it('computes cacheHitPct: cached / (input + cached)', async () => {
    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    // 4000 / (12000 + 4000) = 25%
    expect(result.cacheHitPct).toBeCloseTo(25, 1);
  });

  it('maps byModel array with numeric cost', async () => {
    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    expect(result.byModel).toHaveLength(1);
    expect(result.byModel[0].model).toBe('claude-sonnet-4-6');
    expect(typeof result.byModel[0].cost).toBe('number');
    expect(result.byModel[0].calls).toBe(160);
  });

  it('maps byProvider array with numeric cost', async () => {
    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    expect(result.byProvider).toHaveLength(1);
    expect(result.byProvider[0].provider).toBe('anthropic');
    expect(typeof result.byProvider[0].cost).toBe('number');
  });

  it('maps daily array with day as YYYY-MM-DD string', async () => {
    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof result.daily[0].cost).toBe('number');
  });

  it('returns cacheHitPct 0 when no tokens', async () => {
    mockAggregate.mockResolvedValueOnce({
      _sum:   { costUsd: '0', inputTokens: 0, cachedTokens: 0 },
      _count: { id: 0 },
      _avg:   { latencyMs: null },
    });
    mockCount.mockResolvedValueOnce(0);
    mockQueryRaw.mockResolvedValue([]);

    const caller = createCaller(createContext());
    const result = await caller.summary({ from: '2026-03-01', to: '2026-03-31' });
    expect(result.cacheHitPct).toBe(0);
  });
});
