// src/__tests__/routers/rules.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { rulesRouter } from '@/server/routers/rules';

const mockFindMany = vi.fn();
const mockCreate   = vi.fn();
const mockUpdate   = vi.fn();
const mockDelete   = vi.fn();
const mockFindUnique = vi.fn();

const mockDb = {
  alertRule: { findMany: mockFindMany, create: mockCreate, update: mockUpdate, delete: mockDelete, findUnique: mockFindUnique },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCallerFactory(rulesRouter)({ db: mockDb as any });

const RULE = {
  id: 'r1',
  name: 'Cost spike',
  metric: 'cost',
  lookback: '24H',
  operator: 'gt',
  threshold: '5.00',
  enabled: true,
  createdAt: new Date('2026-04-21T00:00:00Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('rulesRouter.list', () => {
  it('returns rules ordered by createdAt desc', async () => {
    mockFindMany.mockResolvedValue([RULE]);
    const result = await caller.list();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
    expect(typeof result[0].threshold).toBe('number');
    expect(result[0].createdAt).toBe('2026-04-21T00:00:00.000Z');
  });
});

describe('rulesRouter.upsert', () => {
  it('creates a new rule and returns it', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...RULE, id: 'r-new', threshold: '10.00' });
    const result = await caller.upsert({
      id: undefined, name: 'New rule', metric: 'cost',
      lookback: '24H', operator: 'gt', threshold: 10, enabled: true,
    });
    expect(result.id).toBe('r-new');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates an existing rule when id is provided', async () => {
    mockFindUnique.mockResolvedValue(RULE);
    mockUpdate.mockResolvedValue({ ...RULE, name: 'Updated' });
    const result = await caller.upsert({
      id: 'r1', name: 'Updated', metric: 'cost',
      lookback: '24H', operator: 'gt', threshold: 5, enabled: true,
    });
    expect(result.id).toBe('r1');
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('rulesRouter.remove', () => {
  it('calls db.alertRule.delete with the given id', async () => {
    mockDelete.mockResolvedValue(RULE);
    await caller.remove({ id: 'r1' });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});
