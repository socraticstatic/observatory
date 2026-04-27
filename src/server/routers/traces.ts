import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';
import { getBillingUnit } from '@/lib/service-registry';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  if (interval === '90 days')  return 90 * 86_400_000;
  if (interval === '365 days') return 365 * 86_400_000;
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

      // Composite cursor: { ts, id } prevents skipping events with duplicate timestamps
      let cursorTs: Date | undefined;
      let cursorId: string | undefined;
      if (input.cursor) {
        try {
          const parsed = JSON.parse(input.cursor) as { ts: string; id: string };
          cursorTs = new Date(parsed.ts);
          cursorId = parsed.id;
        } catch {
          cursorTs = new Date(input.cursor); // backward compat with old ts-only cursors
        }
      }

      const items = await ctx.db.llmEvent.findMany({
        where: {
          ts: { gte: since },
          ...(cursorTs && cursorId
            ? { OR: [{ ts: { lt: cursorTs } }, { ts: cursorTs, id: { lt: cursorId } }] }
            : cursorTs
              ? { ts: { lt: cursorTs } }
              : {}),
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.status   ? { status: input.status }     : {}),
        },
        orderBy: [{ ts: 'desc' }, { id: 'desc' }],
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
      const last    = page[page.length - 1];
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
          latencyMs:       e.latencyMs ?? null,
          status:          e.status,
          sessionId:       e.sessionId  ?? null,
          project:         e.project    ?? null,
          surface:         e.surface    ?? null,
          contentType:     e.contentType ?? null,
          billingUnit:     getBillingUnit(e.provider),
          rawPayload:      e.rawPayload,
        })),
        nextCursor: hasMore && last ? JSON.stringify({ ts: last.ts.toISOString(), id: last.id }) : null,
      };
    }),
});
