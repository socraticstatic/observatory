import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { datasetsRouter } from '@/server/routers/datasets';

const mockDatasetCreate     = vi.fn();
const mockDatasetFindMany   = vi.fn();
const mockDatasetFindUnique = vi.fn();
const mockItemCreate        = vi.fn();
const mockItemFindMany      = vi.fn();
const mockItemDelete        = vi.fn();

const mockDb = {
  evalDataset: {
    create:     mockDatasetCreate,
    findMany:   mockDatasetFindMany,
    findUnique: mockDatasetFindUnique,
  },
  evalDatasetItem: {
    create:   mockItemCreate,
    findMany: mockItemFindMany,
    delete:   mockItemDelete,
  },
};
const caller = createCallerFactory(datasetsRouter)({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const BASE_DATASET = {
  id: 'ds-1', name: 'Error cases',
  createdAt: new Date('2026-04-27T00:00:00Z'),
  items: [],
};

describe('datasetsRouter.list', () => {
  it('returns all datasets with itemCount and ISO createdAt', async () => {
    mockDatasetFindMany.mockResolvedValue([{ ...BASE_DATASET, items: [{ id: 'i1' }] }]);
    const result = await caller.list();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Error cases');
    expect(result[0].itemCount).toBe(1);
    expect(result[0].createdAt).toBe('2026-04-27T00:00:00.000Z');
  });

  it('returns empty array when no datasets exist', async () => {
    mockDatasetFindMany.mockResolvedValue([]);
    expect(await caller.list()).toEqual([]);
  });
});

describe('datasetsRouter.create', () => {
  it('creates a dataset and returns normalized shape', async () => {
    mockDatasetCreate.mockResolvedValue({ ...BASE_DATASET, id: 'ds-new', name: 'New set' });
    const result = await caller.create({ name: 'New set' });
    expect(result.id).toBe('ds-new');
    expect(result.name).toBe('New set');
    expect(result.itemCount).toBe(0);
    expect(mockDatasetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'New set' }) })
    );
  });

  it('rejects empty name', async () => {
    await expect(caller.create({ name: '' })).rejects.toThrow();
  });
});

describe('datasetsRouter.addItem', () => {
  it('adds an event to a dataset', async () => {
    const item = {
      id: 'item-1', datasetId: 'ds-1', eventId: 'event-x',
      note: null, addedAt: new Date('2026-04-27T00:00:00Z'),
    };
    mockItemCreate.mockResolvedValue(item);
    const result = await caller.addItem({ datasetId: 'ds-1', eventId: 'event-x' });
    expect(result.datasetId).toBe('ds-1');
    expect(result.eventId).toBe('event-x');
    expect(result.addedAt).toBe('2026-04-27T00:00:00.000Z');
  });
});

describe('datasetsRouter.removeItem', () => {
  it('removes an item by id', async () => {
    mockItemDelete.mockResolvedValue({ id: 'item-1' });
    const result = await caller.removeItem({ id: 'item-1' });
    expect(result.ok).toBe(true);
    expect(mockItemDelete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });
});

describe('datasetsRouter.items', () => {
  it('returns items for a dataset', async () => {
    mockDatasetFindUnique.mockResolvedValue({
      ...BASE_DATASET,
      items: [{
        id: 'item-1', eventId: 'event-x',
        note: 'bad output', addedAt: new Date('2026-04-27T00:00:00Z'),
      }],
    });
    const result = await caller.items({ datasetId: 'ds-1' });
    expect(result).toHaveLength(1);
    expect(result[0].eventId).toBe('event-x');
    expect(result[0].note).toBe('bad output');
  });

  it('returns empty array when dataset not found', async () => {
    mockDatasetFindUnique.mockResolvedValue(null);
    const result = await caller.items({ datasetId: 'missing' });
    expect(result).toEqual([]);
  });
});
