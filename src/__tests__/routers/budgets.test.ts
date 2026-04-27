import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { budgetsRouter } from '@/server/routers/budgets';

const mockFindMany  = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate    = vi.fn();
const mockUpdate    = vi.fn();
const mockDelete    = vi.fn();
const mockQueryRaw  = vi.fn();

const mockDb = {
  budget: { findMany: mockFindMany, findUnique: mockFindUnique, create: mockCreate, update: mockUpdate, delete: mockDelete },
  $queryRaw: mockQueryRaw,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCallerFactory(budgetsRouter)({ db: mockDb as any });

const BUDGET = {
  id: 'b1',
  project: 'myproject',
  provider: null,
  limitUsd: '100.0000',
  period: '30D',
  alertPct: 80,
  enabled: true,
  createdAt: new Date('2026-04-27T00:00:00Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('budgetsRouter.list', () => {
  it('returns normalized budgets with numeric limitUsd', async () => {
    mockFindMany.mockResolvedValue([BUDGET]);
    const result = await caller.list();
    expect(result).toHaveLength(1);
    expect(typeof result[0].limitUsd).toBe('number');
    expect(result[0].limitUsd).toBeCloseTo(100);
    expect(result[0].createdAt).toBe('2026-04-27T00:00:00.000Z');
  });

  it('returns empty array when no budgets', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await caller.list();
    expect(result).toEqual([]);
  });
});

describe('budgetsRouter.upsert', () => {
  it('creates a new budget when no id provided', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...BUDGET, id: 'b-new' });
    const result = await caller.upsert({
      project: 'myproject', provider: undefined,
      limitUsd: 100, period: '30D', alertPct: 80, enabled: true,
    });
    expect(result.id).toBe('b-new');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates an existing budget when id provided', async () => {
    mockFindUnique.mockResolvedValue(BUDGET);
    mockUpdate.mockResolvedValue({ ...BUDGET, limitUsd: '200.0000' });
    const result = await caller.upsert({
      id: 'b1', project: 'myproject', provider: undefined,
      limitUsd: 200, period: '30D', alertPct: 80, enabled: true,
    });
    expect(result.id).toBe('b1');
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns numeric limitUsd after upsert', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...BUDGET, limitUsd: '50.0000' });
    const result = await caller.upsert({
      project: 'x', limitUsd: 50, period: '24H', alertPct: 90, enabled: true,
    });
    expect(typeof result.limitUsd).toBe('number');
    expect(result.limitUsd).toBeCloseTo(50);
  });
});

describe('budgetsRouter.remove', () => {
  it('calls delete with the given id', async () => {
    mockDelete.mockResolvedValue(BUDGET);
    await caller.remove({ id: 'b1' });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });
});

describe('budgetsRouter.status', () => {
  it('returns pct and status for each budget', async () => {
    mockFindMany.mockResolvedValue([{ ...BUDGET, limitUsd: '100.0000', alertPct: 80 }]);
    mockQueryRaw.mockResolvedValue([{ spend: 50 }]);
    const result = await caller.status();
    expect(result).toHaveLength(1);
    expect(result[0].pct).toBeCloseTo(50);
    expect(result[0].status).toBe('ok');
    expect(result[0].spendUsd).toBeCloseTo(50);
  });

  it('returns status=alert when spend >= alertPct of limit', async () => {
    mockFindMany.mockResolvedValue([{ ...BUDGET, limitUsd: '100.0000', alertPct: 80 }]);
    mockQueryRaw.mockResolvedValue([{ spend: 85 }]);
    const result = await caller.status();
    expect(result[0].status).toBe('alert');
  });

  it('returns status=exceeded when spend >= 100% of limit', async () => {
    mockFindMany.mockResolvedValue([{ ...BUDGET, limitUsd: '100.0000', alertPct: 80 }]);
    mockQueryRaw.mockResolvedValue([{ spend: 110 }]);
    const result = await caller.status();
    expect(result[0].status).toBe('exceeded');
  });

  it('returns empty array when no budgets', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await caller.status();
    expect(result).toEqual([]);
  });
});
