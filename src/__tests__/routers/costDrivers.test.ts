// src/__tests__/routers/costDrivers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAggregate, mockQueryRaw } = vi.hoisted(() => ({
  mockAggregate: vi.fn(),
  mockQueryRaw:  vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: {
    llmEvent: { aggregate: mockAggregate },
    $queryRaw: mockQueryRaw,
  },
}));

import { createCallerFactory, createContext } from '@/server/trpc';
import { costDriversRouter } from '@/server/routers/costDrivers';

const createCaller = createCallerFactory(costDriversRouter);

beforeEach(() => vi.clearAllMocks());

// ─── sixDimension ─────────────────────────────────────────────────────────────

describe('costDriversRouter.sixDimension', () => {
  const PROVIDER_ROW  = { label: 'anthropic', cost: 15.0 };
  const MODEL_ROW     = { label: 'claude-opus-4', cost: 12.0 };
  const SURFACE_ROW   = { label: 'api', cost: 10.0 };
  const PROJECT_ROW   = { label: 'research', cost: 8.0 };
  const CONTENT_ROW   = { label: 'code', cost: 6.0 };
  const REGION_ROW    = { label: 'us-east-1', cost: 4.0 };

  beforeEach(() => {
    // Promise.all fires 6 $queryRaw calls in order: provider, model, surface, project, contentType, region
    mockQueryRaw
      .mockResolvedValueOnce([PROVIDER_ROW])
      .mockResolvedValueOnce([MODEL_ROW])
      .mockResolvedValueOnce([SURFACE_ROW])
      .mockResolvedValueOnce([PROJECT_ROW])
      .mockResolvedValueOnce([CONTENT_ROW])
      .mockResolvedValueOnce([REGION_ROW]);
  });

  it('returns all 6 dimension keys', async () => {
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('surface');
    expect(result).toHaveProperty('project');
    expect(result).toHaveProperty('contentType');
    expect(result).toHaveProperty('region');
  });

  it('maps label and numeric costUsd', async () => {
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    expect(result.provider[0].label).toBe('anthropic');
    expect(result.provider[0].costUsd).toBeCloseTo(15.0);
  });

  it('computes pct as 100% for a single-item dimension', async () => {
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    expect(result.provider[0].pct).toBeCloseTo(100);
  });

  it('replaces null label with (unknown)', async () => {
    mockQueryRaw.mockReset();
    mockQueryRaw
      .mockResolvedValueOnce([{ label: null, cost: 5.0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    expect(result.provider[0].label).toBe('(unknown)');
  });

  it('returns empty arrays when no rows', async () => {
    mockQueryRaw.mockReset();
    for (let i = 0; i < 6; i++) mockQueryRaw.mockResolvedValueOnce([]);
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    expect(result.provider).toHaveLength(0);
    expect(result.model).toHaveLength(0);
  });

  it('assigns a color string to each item', async () => {
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    expect(result.provider[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('pct sums to ~100 across multi-item dimension', async () => {
    mockQueryRaw.mockReset();
    mockQueryRaw
      .mockResolvedValueOnce([
        { label: 'anthropic', cost: 15.0 },
        { label: 'google',    cost: 5.0 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    const total = result.provider.reduce((s, r) => s + r.pct, 0);
    expect(total).toBeCloseTo(100);
  });
});

// ─── qualityCostByProject ─────────────────────────────────────────────────────

describe('costDriversRouter.qualityCostByProject', () => {
  const QC_ROW = {
    label: 'research',
    cost: 14.2,
    avg_quality: 96.0,
    dominant_model: 'claude-opus-4',
  };

  it('maps label, costUsd, quality, model', async () => {
    mockQueryRaw.mockResolvedValue([QC_ROW]);
    const caller = createCaller(createContext());
    const result = await caller.qualityCostByProject({ lookback: '24H' });
    expect(result[0].label).toBe('research');
    expect(result[0].costUsd).toBeCloseTo(14.2);
    expect(result[0].quality).toBeCloseTo(96.0);
    expect(result[0].model).toBe('claude-opus-4');
  });

  it('returns empty array when no rows', async () => {
    mockQueryRaw.mockResolvedValue([]);
    const caller = createCaller(createContext());
    const result = await caller.qualityCostByProject({ lookback: '24H' });
    expect(result).toEqual([]);
  });

  it('defaults null label to "unknown"', async () => {
    mockQueryRaw.mockResolvedValue([{ ...QC_ROW, label: null }]);
    const caller = createCaller(createContext());
    const result = await caller.qualityCostByProject({ lookback: '24H' });
    expect(result[0].label).toBe('unknown');
  });

  it('defaults null dominant_model to "unknown"', async () => {
    mockQueryRaw.mockResolvedValue([{ ...QC_ROW, dominant_model: null }]);
    const caller = createCaller(createContext());
    const result = await caller.qualityCostByProject({ lookback: '24H' });
    expect(result[0].model).toBe('unknown');
  });
});

// ─── baseline ─────────────────────────────────────────────────────────────────

describe('costDriversRouter.baseline', () => {
  function makeAgg(overrides: Record<string, unknown> = {}) {
    return { _sum: { costUsd: '21.72', cachedTokens: 3_500_000, inputTokens: 8_000_000, reasoningTokens: 0, outputTokens: 2_000_000, ...overrides } };
  }

  it('returns numeric dailyCostUsd', async () => {
    mockAggregate
      .mockResolvedValueOnce(makeAgg({ costUsd: '21.72' }))  // totals
      .mockResolvedValueOnce(makeAgg({ costUsd: '9.13' }))   // opusCost
      .mockResolvedValueOnce(makeAgg())                        // cacheAgg
      .mockResolvedValueOnce(makeAgg());                       // reasoningAgg
    const caller = createCaller(createContext());
    const result = await caller.baseline();
    expect(typeof result.dailyCostUsd).toBe('number');
    expect(result.dailyCostUsd).toBeCloseTo(21.72);
  });

  it('computes opusSharePct as percentage of total', async () => {
    mockAggregate
      .mockResolvedValueOnce(makeAgg({ costUsd: '20.0' }))
      .mockResolvedValueOnce(makeAgg({ costUsd: '10.0' }))
      .mockResolvedValueOnce(makeAgg())
      .mockResolvedValueOnce(makeAgg());
    const caller = createCaller(createContext());
    const result = await caller.baseline();
    expect(result.opusSharePct).toBe(50);
  });

  it('computes cacheDepthPct from cachedTokens / (inputTokens + cachedTokens)', async () => {
    mockAggregate
      .mockResolvedValueOnce(makeAgg({ costUsd: '10.0' }))
      .mockResolvedValueOnce(makeAgg({ costUsd: '4.0' }))
      .mockResolvedValueOnce(makeAgg({ cachedTokens: 2_000_000, inputTokens: 8_000_000 }))
      .mockResolvedValueOnce(makeAgg());
    const caller = createCaller(createContext());
    const result = await caller.baseline();
    // 2M / (8M + 2M) = 20%
    expect(result.cacheDepthPct).toBe(20);
  });

  it('returns 0 for opusSharePct when total cost is 0', async () => {
    mockAggregate
      .mockResolvedValueOnce(makeAgg({ costUsd: '0' }))
      .mockResolvedValueOnce(makeAgg({ costUsd: '0' }))
      .mockResolvedValueOnce(makeAgg())
      .mockResolvedValueOnce(makeAgg());
    const caller = createCaller(createContext());
    const result = await caller.baseline();
    expect(result.opusSharePct).toBe(0);
  });

  it('returns 0 for cacheDepthPct when no tokens', async () => {
    mockAggregate
      .mockResolvedValueOnce(makeAgg({ costUsd: '5.0' }))
      .mockResolvedValueOnce(makeAgg({ costUsd: '0' }))
      .mockResolvedValueOnce(makeAgg({ cachedTokens: 0, inputTokens: 0 }))
      .mockResolvedValueOnce(makeAgg());
    const caller = createCaller(createContext());
    const result = await caller.baseline();
    expect(result.cacheDepthPct).toBe(0);
  });

  it('all returned fields are integers (Math.round applied)', async () => {
    mockAggregate
      .mockResolvedValueOnce(makeAgg({ costUsd: '21.72' }))
      .mockResolvedValueOnce(makeAgg({ costUsd: '9.13' }))
      .mockResolvedValueOnce(makeAgg())
      .mockResolvedValueOnce(makeAgg());
    const caller = createCaller(createContext());
    const result = await caller.baseline();
    expect(Number.isInteger(result.opusSharePct)).toBe(true);
    expect(Number.isInteger(result.cacheDepthPct)).toBe(true);
    expect(Number.isInteger(result.reasoningBudgetPct)).toBe(true);
  });
});
