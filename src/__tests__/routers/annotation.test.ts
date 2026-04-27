import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { annotationRouter } from '@/server/routers/annotation';

const mockCreate    = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdate    = vi.fn();

const mockDb = {
  annotation: { create: mockCreate, findFirst: mockFindFirst, update: mockUpdate },
};
const caller = createCallerFactory(annotationRouter)({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

describe('annotationRouter.rate', () => {
  it('creates an annotation with score and traceId when none exists', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: 'ann-1', ts: new Date(), type: 'rating',
      title: 'Quality rating', severity: 'info',
      score: 4, traceId: 'event-abc',
      detail: null, impact: null,
    });

    const result = await caller.rate({ traceId: 'event-abc', score: 4 });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ score: 4, traceId: 'event-abc', type: 'rating' }),
      })
    );
    expect(result.score).toBe(4);
    expect(result.traceId).toBe('event-abc');
  });

  it('updates an existing annotation when one exists', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'ann-existing', ts: new Date(), type: 'rating',
      title: 'Quality rating', severity: 'info',
      score: 2, traceId: 'event-abc', detail: null, impact: null,
    });
    mockUpdate.mockResolvedValue({
      id: 'ann-existing', ts: new Date(), type: 'rating',
      title: 'Quality rating', severity: 'info',
      score: 5, traceId: 'event-abc', detail: null, impact: null,
    });

    const result = await caller.rate({ traceId: 'event-abc', score: 5 });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ann-existing' },
        data:  expect.objectContaining({ score: 5 }),
      })
    );
    expect(result.score).toBe(5);
  });

  it('rejects scores outside 1-5 range', async () => {
    await expect(caller.rate({ traceId: 'e1', score: 0 })).rejects.toThrow();
    await expect(caller.rate({ traceId: 'e1', score: 6 })).rejects.toThrow();
  });
});

describe('annotationRouter.get', () => {
  it('returns annotation for a traceId', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'ann-1', ts: new Date(), type: 'rating',
      title: 'Quality rating', severity: 'info',
      score: 3, traceId: 'event-abc',
      detail: 'Good but verbose', impact: null,
    });

    const result = await caller.get({ traceId: 'event-abc' });
    expect(result?.score).toBe(3);
    expect(result?.note).toBe('Good but verbose');
  });

  it('returns null when no annotation exists', async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await caller.get({ traceId: 'missing' });
    expect(result).toBeNull();
  });
});
