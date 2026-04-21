import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const whoRouter = router({
  providerBreakdown: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{
        provider: string; calls: bigint; cost: unknown; tokens: unknown;
      }>>`
        SELECT
          provider,
          COUNT(*) AS calls,
          SUM("costUsd")::float AS cost,
          SUM("inputTokens" + "outputTokens")::float AS tokens
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY provider
        ORDER BY cost DESC
      `;
      const totalCost = rows.reduce((s, r) => s + Number(r.cost), 0);
      return rows.map(r => ({
        provider: r.provider,
        calls: Number(r.calls),
        costUsd: Number(r.cost),
        tokens: Number(r.tokens),
        sharePct: totalCost > 0 ? (Number(r.cost) / totalCost) * 100 : 0,
      }));
    }),

  modelAttribution: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{
        model: string; provider: string; calls: bigint; cost: unknown;
        avg_lat: unknown; p95_lat: unknown; error_rate: unknown;
      }>>`
        SELECT
          model,
          provider,
          COUNT(*) AS calls,
          SUM("costUsd")::float AS cost,
          AVG("latencyMs")::float AS avg_lat,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95_lat,
          (COUNT(*) FILTER (WHERE status = 'error'))::float / COUNT(*) * 100 AS error_rate
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
        GROUP BY model, provider
        ORDER BY cost DESC
      `;
      const totalCost = rows.reduce((s, r) => s + Number(r.cost), 0);
      return rows.map(r => ({
        model: r.model,
        provider: r.provider,
        calls: Number(r.calls),
        cost: Number(r.cost),
        share: totalCost > 0 ? (Number(r.cost) / totalCost) * 100 : 0,
        avgLatMs: Math.round(Number(r.avg_lat) ?? 0),
        p95LatMs: Math.round(Number(r.p95_lat) ?? 0),
        errorRatePct: Number(r.error_rate ?? 0),
      }));
    }),
});
