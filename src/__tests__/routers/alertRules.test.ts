import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { alertRulesRouter } from '@/server/routers/alertRules';

const mockFindMany = vi.fn();
const mockCreate   = vi.fn();
const mockUpdate   = vi.fn();
const mockDelete   = vi.fn();

const mockDb = {
  alertRule: { findMany: mockFindMany, create: mockCreate, update: mockUpdate, delete: mockDelete },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCallerFactory(alertRulesRouter)({ db: mockDb as any });

const BASE_RULE = {
  id: 'r1', name: 'Error spike', metric: 'error_rate', lookback: '24H',
  operator: 'gt', threshold: '5.0000', enabled: true, webhookUrl: null,
  createdAt: new Date('2026-04-27T00:00:00Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('alertRulesRouter.list', () => {
  it('returns rules with webhookUrl field', async () => {
    mockFindMany.mockResolvedValue([BASE_RULE]);
    const result = await caller.list();
    expect(result[0]).toHaveProperty('webhookUrl');
    expect(result[0].webhookUrl).toBeNull();
  });

  it('returns webhookUrl when set', async () => {
    mockFindMany.mockResolvedValue([{ ...BASE_RULE, webhookUrl: 'https://ntfy.sh/my-topic' }]);
    const result = await caller.list();
    expect(result[0].webhookUrl).toBe('https://ntfy.sh/my-topic');
  });
});

describe('alertRulesRouter.create', () => {
  it('passes webhookUrl to db.create when provided', async () => {
    mockCreate.mockResolvedValue({ ...BASE_RULE, webhookUrl: 'https://ntfy.sh/my-topic' });
    await caller.create({
      name: 'Error spike', metric: 'error_rate', lookback: '24H',
      operator: 'gt', threshold: 5, enabled: true,
      webhookUrl: 'https://ntfy.sh/my-topic',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ webhookUrl: 'https://ntfy.sh/my-topic' }),
      })
    );
  });

  it('stores null webhookUrl when not provided', async () => {
    mockCreate.mockResolvedValue(BASE_RULE);
    await caller.create({
      name: 'Error spike', metric: 'error_rate', lookback: '24H',
      operator: 'gt', threshold: 5, enabled: true,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ webhookUrl: null }),
      })
    );
  });
});
