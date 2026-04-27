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

  const USER_ROW_DEFAULT = { label: 'user-alice', cost: 3.0, calls: BigInt(10), sessions: BigInt(2), avg_lat_ms: 300, p95_lat_ms: 600 };

  const PROMPT_ROW_DEFAULT = { label: 'abc123def456', cost: 2.0, calls: BigInt(5), sessions: BigInt(1), avg_lat_ms: 200, p95_lat_ms: 400 };

  beforeEach(() => {
    // Promise.all fires 8 $queryRaw calls in order: provider, model, surface, project, contentType, region, user, prompt
    mockQueryRaw
      .mockResolvedValueOnce([PROVIDER_ROW])
      .mockResolvedValueOnce([MODEL_ROW])
      .mockResolvedValueOnce([SURFACE_ROW])
      .mockResolvedValueOnce([PROJECT_ROW])
      .mockResolvedValueOnce([CONTENT_ROW])
      .mockResolvedValueOnce([REGION_ROW])
      .mockResolvedValueOnce([USER_ROW_DEFAULT])
      .mockResolvedValueOnce([PROMPT_ROW_DEFAULT]);
  });

  it('returns all 6 dimension keys plus user and prompt', async () => {
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('surface');
    expect(result).toHaveProperty('project');
    expect(result).toHaveProperty('contentType');
    expect(result).toHaveProperty('region');
    expect(result).toHaveProperty('user');
    expect(result).toHaveProperty('prompt');
  });

  it('returns a user dimension alongside provider/model/etc', async () => {
    const USER_ROW = {
      label: 'user-alice', cost: 4.5,
      calls: BigInt(20), sessions: BigInt(5),
      avg_lat_ms: 450, p95_lat_ms: 900,
    };
    mockQueryRaw.mockReset();
    mockQueryRaw
      .mockResolvedValueOnce([PROVIDER_ROW])
      .mockResolvedValueOnce([MODEL_ROW])
      .mockResolvedValueOnce([SURFACE_ROW])
      .mockResolvedValueOnce([PROJECT_ROW])
      .mockResolvedValueOnce([CONTENT_ROW])
      .mockResolvedValueOnce([REGION_ROW])
      .mockResolvedValueOnce([USER_ROW])
      .mockResolvedValueOnce([]);
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '30D' });
    expect(result).toHaveProperty('user');
    expect(Array.isArray(result.user)).toBe(true);
    expect(result.user[0].label).toBe('user-alice');
    expect(result.user[0].costUsd).toBeCloseTo(4.5);
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
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const caller = createCaller(createContext());
    const result = await caller.sixDimension({ lookback: '24H' });
    expect(result.provider[0].label).toBe('(unknown)');
  });

  it('returns empty arrays when no rows', async () => {
    mockQueryRaw.mockReset();
    for (let i = 0; i < 8; i++) mockQueryRaw.mockResolvedValueOnce([]);
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
    has_quality: true,
  };

  it('maps label, costUsd, quality, model, hasQuality', async () => {
    mockQueryRaw.mockResolvedValue([QC_ROW]);
    const caller = createCaller(createContext());
    const result = await caller.qualityCostByProject({ lookback: '24H' });
    expect(result[0].label).toBe('research');
    expect(result[0].costUsd).toBeCloseTo(14.2);
    expect(result[0].quality).toBeCloseTo(96.0);
    expect(result[0].model).toBe('claude-opus-4');
    expect(result[0].hasQuality).toBe(true);
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

  it('hasQuality is false when has_quality is falsy', async () => {
    mockQueryRaw.mockResolvedValue([{ ...QC_ROW, has_quality: false }]);
    const caller = createCaller(createContext());
    const result = await caller.qualityCostByProject({ lookback: '24H' });
    expect(result[0].hasQuality).toBe(false);
  });

  it('returns events without qualityScore when has_quality is false', async () => {
    mockQueryRaw.mockResolvedValue([{ ...QC_ROW, avg_quality: 0, has_quality: false }]);
    const caller = createCaller(createContext());
    const result = await caller.qualityCostByProject({ lookback: '24H' });
    expect(result[0].quality).toBeCloseTo(0);
    expect(result[0].hasQuality).toBe(false);
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

// ─── contextComposition ───────────────────────────────────────────────────────

describe('costDriversRouter.contextComposition', () => {
  const CTX_ROW = {
    cached:           800,
    cache_creation:   200,
    fresh_input:      400,
    output_tokens:    340,
    reasoning_tokens: 60,
  };

  it('returns totalTokens as sum of all token types', async () => {
    mockQueryRaw.mockResolvedValue([CTX_ROW]);
    const caller = createCaller(createContext());
    const result = await caller.contextComposition({ lookback: '24H' });
    expect(result.totalTokens).toBe(800 + 200 + 400 + 340 + 60);
  });

  it('segments have correct labels', async () => {
    mockQueryRaw.mockResolvedValue([CTX_ROW]);
    const caller = createCaller(createContext());
    const result = await caller.contextComposition({ lookback: '24H' });
    const labels = result.segments.map(s => s.label);
    expect(labels).toContain('Cached Context');
    expect(labels).toContain('Fresh Input');
    expect(labels).toContain('Output');
  });

  it('pct values sum to ~100', async () => {
    mockQueryRaw.mockResolvedValue([CTX_ROW]);
    const caller = createCaller(createContext());
    const result = await caller.contextComposition({ lookback: '24H' });
    const total = result.segments.reduce((s, seg) => s + seg.pct, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it('filters out zero-token segments', async () => {
    mockQueryRaw.mockResolvedValue([{ ...CTX_ROW, reasoning_tokens: 0, cache_creation: 0 }]);
    const caller = createCaller(createContext());
    const result = await caller.contextComposition({ lookback: '24H' });
    const labels = result.segments.map(s => s.label);
    expect(labels).not.toContain('Reasoning');
    expect(labels).not.toContain('Cache Write');
  });

  it('returns totalTokens 0 and empty segments when no data', async () => {
    mockQueryRaw.mockResolvedValue([{ cached: 0, cache_creation: 0, fresh_input: 0, output_tokens: 0, reasoning_tokens: 0 }]);
    const caller = createCaller(createContext());
    const result = await caller.contextComposition({ lookback: '24H' });
    expect(result.totalTokens).toBe(0);
    expect(result.segments).toHaveLength(0);
  });

  it('each segment has label, tokens, pct, color', async () => {
    mockQueryRaw.mockResolvedValue([CTX_ROW]);
    const caller = createCaller(createContext());
    const result = await caller.contextComposition({ lookback: '24H' });
    for (const seg of result.segments) {
      expect(typeof seg.label).toBe('string');
      expect(typeof seg.tokens).toBe('number');
      expect(typeof seg.pct).toBe('number');
      expect(seg.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
