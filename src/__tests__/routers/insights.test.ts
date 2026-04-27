// src/__tests__/routers/insights.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { insightsRouter } from '@/server/routers/insights';

const createCaller = createCallerFactory(insightsRouter);
const mockDb = {
  $queryRaw: vi.fn(),
  annotation: { findMany: vi.fn(), create: vi.fn() },
  llmEvent: { findMany: vi.fn() },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCaller({ db: mockDb as any });

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.annotation.findMany.mockResolvedValue([]);
  mockDb.llmEvent.findMany.mockResolvedValue([]);
});

// ZOMBIE_ROW produces type='loop' because steps > 12 and last_ts is old enough
// (ageMs > 5 * 60_000). We use a date far in the past so ageMs is large.
const ZOMBIE_ROW = {
  session_id: 'sess-zombie',
  project: 'myproject',
  surface: 'api',
  steps: 80n,
  cost: 0.45,
  first_ts: new Date('2019-12-31T10:00:00Z'),
  last_ts: new Date('2020-01-01T10:00:00Z'), // very old => ageMs >> 10min
  first_input: 1000n,
  last_input: 50000n,
};

describe('insightsRouter.whyInsights', () => {
  // $queryRaw call order inside whyInsights:
  //   Promise.all fires both cacheToday and cache7d simultaneously.
  //   Prisma (or our mock) processes them in the order they appear in the array:
  //   call 1 = cacheToday, call 2 = cache7d.
  //   After Promise.all resolves, call 3 = routingRows.

  it('returns array of insight objects with required fields when cache has decayed', async () => {
    // cacheDecay condition: weekHit > 0 && todayHit < weekHit * 0.6
    // todayHit=40, weekHit=90 => 40 < 90*0.6 (54) => cacheDecay=true
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ hit_ratio: 40 }])  // cacheToday (call 1)
      .mockResolvedValueOnce([{ hit_ratio: 90 }])  // cache7d    (call 2)
      .mockResolvedValueOnce([]);                   // routingRows (call 3)

    const result = await caller.whyInsights();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const insight = result[0];
    expect(insight).toHaveProperty('id');
    expect(insight).toHaveProperty('severity');
    expect(insight).toHaveProperty('title');
    expect(insight).toHaveProperty('detail');
    expect(insight).toHaveProperty('recommendation');
    // Verify the cache-decay insight specifically
    expect(insight.id).toBe('cache-decay');
    expect(insight.severity).toBe('warn');
  });

  it('returns empty array when cache is stable (today ratio >= 60% of 7d avg)', async () => {
    // todayHit=85, weekHit=90 => 85 >= 90*0.6 (54) => no cacheDecay
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ hit_ratio: 85 }])  // cacheToday (call 1)
      .mockResolvedValueOnce([{ hit_ratio: 90 }])  // cache7d    (call 2)
      .mockResolvedValueOnce([]);                   // routingRows (call 3)

    const result = await caller.whyInsights();

    expect(Array.isArray(result)).toBe(true);
    // No cache-decay insight expected
    const cacheInsight = result.find(r => r.id === 'cache-decay');
    expect(cacheInsight).toBeUndefined();
  });

  it('includes routing insight for opus project with avg quality < 92', async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ hit_ratio: 85 }])   // cacheToday (call 1)
      .mockResolvedValueOnce([{ hit_ratio: 90 }])   // cache7d    (call 2)
      .mockResolvedValueOnce([                       // routingRows (call 3)
        { project: 'alpha', avg_quality: 88, cost: 5.0 },
      ]);

    const result = await caller.whyInsights();

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('routing-alpha');
    expect(result[0].severity).toBe('info');
    expect(result[0].title).toContain('alpha');
    expect(result[0].recommendation).toContain('Sonnet');
  });
});

describe('insightsRouter.zombieSessions', () => {
  it('converts bigint steps to number', async () => {
    mockDb.$queryRaw.mockResolvedValue([ZOMBIE_ROW]);
    const result = await caller.zombieSessions();

    expect(result.length).toBeGreaterThan(0);
    expect(typeof result[0].steps).toBe('number');
    expect(result[0].steps).toBe(80);
    expect(result[0].type).toBe('loop');
  });

  it('maps session_id to sessionId', async () => {
    mockDb.$queryRaw.mockResolvedValue([ZOMBIE_ROW]);
    const result = await caller.zombieSessions();

    expect(result[0].sessionId).toBe('sess-zombie');
  });

  it('formats lastTs as ISO string', async () => {
    mockDb.$queryRaw.mockResolvedValue([ZOMBIE_ROW]);
    const result = await caller.zombieSessions();

    expect(result[0].lastTs).toBe('2020-01-01T10:00:00.000Z');
  });

  it('computes numeric costUsd', async () => {
    mockDb.$queryRaw.mockResolvedValue([ZOMBIE_ROW]);
    const result = await caller.zombieSessions();

    expect(typeof result[0].costUsd).toBe('number');
    expect(result[0].costUsd).toBeCloseTo(0.45);
  });

  it('returns empty array for no zombies', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.zombieSessions();

    expect(result).toEqual([]);
  });

  it('filters out active sessions (type=active is excluded)', async () => {
    // steps <= 10, bloatRatio <= 1.5, ageMs <= 30min => type='active' => filtered
    const now = new Date();
    const activeRow = {
      session_id: 'sess-active',
      project: 'proj',
      surface: 'api',
      steps: 3n,
      cost: 0.01,
      first_ts: now,
      last_ts: now, // recent => ageMs ~ 0
      first_input: 1000n,
      last_input: 1100n,   // bloatRatio = 1.1
    };
    mockDb.$queryRaw.mockResolvedValue([activeRow]);
    const result = await caller.zombieSessions();

    expect(result).toEqual([]);
  });

  it('computes bloatRatio from first_input and last_input', async () => {
    mockDb.$queryRaw.mockResolvedValue([ZOMBIE_ROW]);
    const result = await caller.zombieSessions();
    expect(result[0].bloatRatio).toBe(50);
  });

  it('defaults bloatRatio to 1 when first_input is zero', async () => {
    mockDb.$queryRaw.mockResolvedValue([{ ...ZOMBIE_ROW, first_input: 0n }]);
    const result = await caller.zombieSessions();
    expect(result[0].bloatRatio).toBe(1);
  });

  it('computes positive ageMs from last_ts', async () => {
    mockDb.$queryRaw.mockResolvedValue([ZOMBIE_ROW]);
    const result = await caller.zombieSessions();
    expect(typeof result[0].ageMs).toBe('number');
    expect(result[0].ageMs).toBeGreaterThan(0);
  });
});

// Prisma event row shape returned by llmEvent.findMany
// costUsd uses a plain number here; Number(n) === n works for primitives
const EVENT_ROW = {
  id: 'evt-1',
  ts: new Date('2025-01-01T10:00:00Z'),
  model: 'claude-opus-4-5',
  project: 'myproject',
  sessionId: 'sess-1',
  costUsd: 0.05 as unknown as number,
  inputTokens: 1000,
  outputTokens: 500,
  cachedTokens: 0,
  status: 'ok',
};

// bucketRows: $queryRaw returns BigInt for sum columns
const BUCKET_ROWS: Array<{ bucket: unknown; total_tokens: unknown }> = [];

describe('insightsRouter.sessionAnomalies', () => {
  it('returns correct top-level shape', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('riskScore');
    expect(result).toHaveProperty('tokenBuckets');
    expect(result).toHaveProperty('counts');
  });

  it('tokenBuckets always has exactly 60 elements', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.tokenBuckets).toHaveLength(60);
  });

  it('riskScore is 0 when there are no events', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.riskScore).toBe(0);
  });

  it('status=error produces lvl=bad and tag=STATUS.ERROR', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([{ ...EVENT_ROW, status: 'error' }]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.events[0].lvl).toBe('bad');
    expect(result.events[0].tag).toBe('STATUS.ERROR');
  });

  it('costUsd > 0.10 produces lvl=warn and tag=COST.SPIKE', async () => {
    const highCostRow = { ...EVENT_ROW, costUsd: 0.50 as unknown as number, status: 'ok' };
    mockDb.llmEvent.findMany.mockResolvedValue([highCostRow]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.events[0].lvl).toBe('warn');
    expect(result.events[0].tag).toBe('COST.SPIKE');
  });

  it('outputTokens > 8000 produces tag=OUTPUT.SPIKE', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([{ ...EVENT_ROW, outputTokens: 10000 }]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.events[0].tag).toBe('OUTPUT.SPIKE');
  });

  it('cachedTokens > 0 produces tag=CACHE.HIT', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([{ ...EVENT_ROW, cachedTokens: 200 }]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.events[0].tag).toBe('CACHE.HIT');
    expect(result.events[0].lvl).toBe('ok');
  });

  it('normal event produces tag=INFERENCE.OK and lvl=ok', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([EVENT_ROW]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.events[0].tag).toBe('INFERENCE.OK');
    expect(result.events[0].lvl).toBe('ok');
  });

  it('counts.errors reflects STATUS.ERROR events', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([
      { ...EVENT_ROW, status: 'error' },
      { ...EVENT_ROW, id: 'evt-2', status: 'ok' },
    ]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.counts.errors).toBe(1);
  });

  it('riskScore increases when there are errors', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([
      { ...EVENT_ROW, status: 'error' },
      { ...EVENT_ROW, id: 'evt-2', status: 'error' },
    ]);
    mockDb.$queryRaw.mockResolvedValue(BUCKET_ROWS);
    const result = await caller.sessionAnomalies();
    expect(result.riskScore).toBeGreaterThan(0);
  });
});

describe('insightsRouter.whyInsights — provider filter', () => {
  it('accepts optional provider without throwing', async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ hit_ratio: 85 }])
      .mockResolvedValueOnce([{ hit_ratio: 90 }])
      .mockResolvedValueOnce([]);

    await expect(caller.whyInsights({ provider: 'anthropic' })).resolves.not.toThrow();
  });
});

describe('insightsRouter.zombieSessions — provider filter', () => {
  it('accepts optional provider without throwing', async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await expect(caller.zombieSessions({ provider: 'anthropic' })).resolves.not.toThrow();
  });
});
