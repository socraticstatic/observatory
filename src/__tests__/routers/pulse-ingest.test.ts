import { describe, it, expect, vi } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { pulseRouter } from '@/server/routers/pulse';

const mockDb = {
  $queryRaw: vi.fn().mockResolvedValue([{ last_ts: new Date('2026-04-21T12:00:00Z') }]),
  llmEvent: {
    aggregate: vi.fn().mockResolvedValue({ _sum: {}, _count: { id: 0 }, _avg: {} }),
    findMany:  vi.fn().mockResolvedValue([]),
    count:     vi.fn().mockResolvedValue(0),
  },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCallerFactory(pulseRouter)({ db: mockDb as any });

describe('pulseRouter.lastIngest', () => {
  it('returns lastTs as ISO string when events exist', async () => {
    const result = await caller.lastIngest();
    expect(result.lastTs).toBe('2026-04-21T12:00:00.000Z');
  });

  it('returns null lastTs when table is empty', async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([{ last_ts: null }]);
    const result = await caller.lastIngest();
    expect(result.lastTs).toBeNull();
  });
});
