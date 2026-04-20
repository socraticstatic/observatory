import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { eventsRouter } from '@/server/routers/events';

const createCaller = createCallerFactory(eventsRouter);
const mockDb = {
  annotation: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const MOCK_ANNOTATION = {
  id: 'ann-001',
  ts: new Date('2026-01-01T09:00:00Z'),
  type: 'deploy',
  title: 'New deployment',
  detail: 'v1.2.3 deployed',
  impact: 'medium',
  severity: 'info',
};

const MOCK_DAILY = [
  { d: new Date('2026-01-01T00:00:00Z'), cost: 0.45 },
];

describe('eventsRouter.timeline', () => {
  it('returns annotations with ISO ts', async () => {
    mockDb.annotation.findMany.mockResolvedValue([MOCK_ANNOTATION]);
    mockDb.$queryRaw.mockResolvedValue(MOCK_DAILY);
    const result = await caller.timeline({ lookback: '30D' });
    expect(result.annotations[0].ts).toBe('2026-01-01T09:00:00.000Z');
    expect(result.annotations[0].title).toBe('New deployment');
  });

  it('returns daily costs as numeric costUsd', async () => {
    mockDb.annotation.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue(MOCK_DAILY);
    const result = await caller.timeline({ lookback: '30D' });
    expect(typeof result.daily[0].costUsd).toBe('number');
    expect(result.daily[0].costUsd).toBeCloseTo(0.45);
  });

  it('returns daily d as ISO string', async () => {
    mockDb.annotation.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue(MOCK_DAILY);
    const result = await caller.timeline({ lookback: '30D' });
    expect(result.daily[0].d).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns empty arrays when no data', async () => {
    mockDb.annotation.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.timeline({ lookback: '1H' });
    expect(result.annotations).toEqual([]);
    expect(result.daily).toEqual([]);
  });

  it('returns all annotation fields mapped correctly', async () => {
    mockDb.annotation.findMany.mockResolvedValue([MOCK_ANNOTATION]);
    mockDb.$queryRaw.mockResolvedValue([]);
    const result = await caller.timeline({ lookback: '30D' });
    const ann = result.annotations[0];
    expect(ann.id).toBe('ann-001');
    expect(ann.type).toBe('deploy');
    expect(ann.detail).toBe('v1.2.3 deployed');
    expect(ann.impact).toBe('medium');
    expect(ann.severity).toBe('info');
  });

  it('handles multiple annotations and daily entries', async () => {
    mockDb.annotation.findMany.mockResolvedValue([
      MOCK_ANNOTATION,
      { ...MOCK_ANNOTATION, id: 'ann-002', ts: new Date('2026-01-02T09:00:00Z') },
    ]);
    mockDb.$queryRaw.mockResolvedValue([
      { d: new Date('2026-01-01T00:00:00Z'), cost: 0.45 },
      { d: new Date('2026-01-02T00:00:00Z'), cost: 0.52 },
    ]);
    const result = await caller.timeline({ lookback: '30D' });
    expect(result.annotations).toHaveLength(2);
    expect(result.daily).toHaveLength(2);
    expect(result.daily[1].costUsd).toBeCloseTo(0.52);
  });

  it('uses default lookback of 30D if not provided', async () => {
    mockDb.annotation.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue([]);
    await caller.timeline();
    const since = mockDb.annotation.findMany.mock.calls[0][0].where.ts.gte as Date;
    const thirtyDaysMs = 30 * 86_400_000;
    expect(Date.now() - since.getTime()).toBeCloseTo(thirtyDaysMs, -4);
  });

  it('calls annotation.findMany with ts gte filter', async () => {
    mockDb.annotation.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue([]);
    await caller.timeline({ lookback: '30D' });
    expect(mockDb.annotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ts: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it('orders annotations by ts ascending', async () => {
    mockDb.annotation.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue([]);
    await caller.timeline({ lookback: '30D' });
    expect(mockDb.annotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { ts: 'asc' },
      })
    );
  });
});
