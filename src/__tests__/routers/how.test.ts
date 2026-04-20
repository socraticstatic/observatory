import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { howRouter } from '@/server/routers/how';

const createCaller = createCallerFactory(howRouter);
const mockDb = { llmEvent: { findMany: vi.fn() } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCaller({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const MOCK_EVENT = {
  id: 'evt-001',
  ts: new Date('2026-01-01T10:00:00Z'),
  model: 'claude-3-5-sonnet-20241022',
  provider: 'anthropic',
  inputTokens: 1000,
  outputTokens: 500,
  reasoningTokens: 100,
  costUsd: 0.0015,
  latencyMs: 1200,
  status: 'ok',
  contentType: 'text',
};

describe('howRouter.agentTrace', () => {
  it('assigns step=1 to first event', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([MOCK_EVENT]);
    const result = await caller.agentTrace({ sessionId: 'sess-abc' });
    expect(result[0].step).toBe(1);
  });

  it('assigns sequential steps for multiple events', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([
      MOCK_EVENT,
      { ...MOCK_EVENT, id: 'evt-002', ts: new Date('2026-01-01T10:01:00Z') },
      { ...MOCK_EVENT, id: 'evt-003', ts: new Date('2026-01-01T10:02:00Z') },
    ]);
    const result = await caller.agentTrace({ sessionId: 'sess-abc' });
    expect(result.map(r => r.step)).toEqual([1, 2, 3]);
  });

  it('returns ts as ISO string', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([MOCK_EVENT]);
    const result = await caller.agentTrace({ sessionId: 'sess-abc' });
    expect(result[0].ts).toBe('2026-01-01T10:00:00.000Z');
  });

  it('returns numeric costUsd', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([MOCK_EVENT]);
    const result = await caller.agentTrace({ sessionId: 'sess-abc' });
    expect(typeof result[0].costUsd).toBe('number');
    expect(result[0].costUsd).toBe(0.0015);
  });

  it('returns latencyMs with default of 0 if missing', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([
      { ...MOCK_EVENT, latencyMs: undefined },
    ]);
    const result = await caller.agentTrace({ sessionId: 'sess-abc' });
    expect(result[0].latencyMs).toBe(0);
  });

  it('returns contentType with default of "unknown" if missing', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([
      { ...MOCK_EVENT, contentType: undefined },
    ]);
    const result = await caller.agentTrace({ sessionId: 'sess-abc' });
    expect(result[0].contentType).toBe('unknown');
  });

  it('returns empty array for unknown session', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([]);
    const result = await caller.agentTrace({ sessionId: 'nonexistent' });
    expect(result).toEqual([]);
  });

  it('filters by sessionId in query', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([]);
    await caller.agentTrace({ sessionId: 'sess-xyz' });
    expect(mockDb.llmEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-xyz' },
      })
    );
  });

  it('orders events by ts ascending', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([]);
    await caller.agentTrace({ sessionId: 'sess-abc' });
    expect(mockDb.llmEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { ts: 'asc' },
      })
    );
  });

  it('passes through reasoningTokens correctly', async () => {
    mockDb.llmEvent.findMany.mockResolvedValue([MOCK_EVENT]);
    const result = await caller.agentTrace({ sessionId: 'sess-abc' });
    expect(result[0].reasoningTokens).toBe(100);
  });
});
