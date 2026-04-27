import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour')   return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  if (interval === '90 days')  return 90 * 86_400_000;
  if (interval === '365 days') return 365 * 86_400_000;
  return 30 * 86_400_000;
}

function mapEvents(events: Array<{
  id: string; ts: Date; model: string | null; provider: string | null;
  inputTokens: number; outputTokens: number; reasoningTokens: number;
  costUsd: unknown; latencyMs: number | null; status: string | null; contentType: string | null;
}>) {
  const base = events[0]?.ts.getTime() ?? 0;
  return events.map((e, i) => ({
    step: i + 1,
    id: e.id,
    ts: e.ts.toISOString(),
    model: e.model ?? 'unknown',
    provider: e.provider ?? 'unknown',
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    reasoningTokens: e.reasoningTokens,
    costUsd: Number(e.costUsd),
    latencyMs: e.latencyMs ?? 0,
    msOffset: e.ts.getTime() - base,
    status: e.status ?? 'ok',
    contentType: e.contentType ?? 'unknown',
  }));
}

const SELECT_FIELDS = {
  id: true, ts: true, model: true, provider: true,
  inputTokens: true, outputTokens: true, reasoningTokens: true,
  costUsd: true, latencyMs: true, status: true, contentType: true,
} as const;

export const howRouter = router({
  agentTrace: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const events = await ctx.db.llmEvent.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { ts: 'asc' },
        take: 200,
        select: SELECT_FIELDS,
      });
      return mapEvents(events);
    }),

  latestTrace: publicProcedure
    .input(z.object({ lookback: LookbackSchema.optional(), provider: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input?.lookback ?? '24H')));
      const pf = input?.provider ? { provider: input.provider } : {};
      const recent = await ctx.db.llmEvent.findFirst({
        where: { ts: { gte: since }, sessionId: { not: null }, ...pf },
        orderBy: { ts: 'desc' },
        select: { sessionId: true },
      });
      if (!recent?.sessionId) return { sessionId: null, events: [] };
      const events = await ctx.db.llmEvent.findMany({
        where: { sessionId: recent.sessionId, ts: { gte: since } },
        orderBy: { ts: 'asc' },
        take: 200,
        select: SELECT_FIELDS,
      });
      return { sessionId: recent.sessionId, events: mapEvents(events) };
    }),
});
