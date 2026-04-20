// src/__tests__/routers/insights.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { insightsRouter } from '@/server/routers/insights';

const createCaller = createCallerFactory(insightsRouter);
const mockDb = { $queryRaw: vi.fn() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

// ZOMBIE_ROW produces type='loop' because steps > 12 and last_ts is old enough
// (ageMs > 5 * 60_000). We use a date far in the past so ageMs is large.
const ZOMBIE_ROW = {
  session_id: 'sess-zombie',
  project: 'myproject',
  surface: 'api',
  steps: 80n,
  cost: 0.45,
  last_ts: new Date('2020-01-01T10:00:00Z'), // very old => ageMs >> 5min
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
    // steps <= 12, bloatRatio <= 1.8, ageMs <= 30min => type='active' => filtered
    const activeRow = {
      session_id: 'sess-active',
      project: 'proj',
      surface: 'api',
      steps: 3n,
      cost: 0.01,
      last_ts: new Date(), // recent => ageMs ~ 0
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
