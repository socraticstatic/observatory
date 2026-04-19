import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const tracesRouter = router({
  list: publicProcedure
    .input(z.object({
      lookback: LookbackSchema,
      provider: z.string().optional(),
      status: z.enum(['ok', 'error']).optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const whereObj = {
        ts: {
          gte: since,
          ...(input.cursor ? { lt: new Date(input.cursor) } : {}),
        },
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.status   ? { status: input.status }     : {}),
      };
      const items = await ctx.db.llmEvent.findMany({
        where: whereObj,
        orderBy: { ts: 'desc' },
        take: input.limit + 1,
        select: {
          id: true, ts: true, provider: true, model: true,
          inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true,
          costUsd: true, latencyMs: true, status: true,
          sessionId: true, project: true, surface: true, contentType: true,
          rawPayload: true,
        },
      });
      const hasMore = items.length > input.limit;
      const page    = hasMore ? items.slice(0, -1) : items;
      return {
        items: page.map(e => ({
          id:              e.id,
          ts:              e.ts.toISOString(),
          provider:        e.provider,
          model:           e.model,
          inputTokens:     e.inputTokens,
          outputTokens:    e.outputTokens,
          cachedTokens:    e.cachedTokens,
          reasoningTokens: e.reasoningTokens,
          costUsd:         Number(e.costUsd),
          latencyMs:       e.latencyMs ?? 0,
          status:          e.status,
          sessionId:       e.sessionId  ?? null,
          project:         e.project    ?? null,
          surface:         e.surface    ?? null,
          contentType:     e.contentType ?? null,
          rawPayload:      e.rawPayload,
        })),
        nextCursor: hasMore ? page[page.length - 1].ts.toISOString() : null,
      };
    }),
});
