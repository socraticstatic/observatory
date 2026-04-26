import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

function lookbackToBucket(interval: string): string {
  if (interval === '1 hour') return 'minute';
  if (interval === '24 hours') return 'hour';
  return 'day';
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
          AND ("contentType" NOT IN ('tts', 'video', 'image') OR "contentType" IS NULL)
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
        avgLatMs: r.avg_lat != null ? Math.round(Number(r.avg_lat)) : null,
        p95LatMs: r.p95_lat != null ? Math.round(Number(r.p95_lat)) : null,
        errorRatePct: Number(r.error_rate ?? 0),
      }));
    }),

  trendByModel: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const since = new Date(Date.now() - msSince(interval));
      const bucket = lookbackToBucket(interval);
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const rows = await ctx.db.$queryRaw<Array<{ model: string; bkt: Date; cost: unknown }>>`
        SELECT
          model,
          DATE_TRUNC(${bucket}, ts) AS bkt,
          SUM("costUsd")::float AS cost
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
          AND ("contentType" NOT IN ('tts', 'video', 'image') OR "contentType" IS NULL)
        GROUP BY model, DATE_TRUNC(${bucket}, ts)
        ORDER BY model, bkt ASC
      `;

      const byModel = new Map<string, number[]>();
      for (const row of rows) {
        if (!byModel.has(row.model)) byModel.set(row.model, []);
        byModel.get(row.model)!.push(Number(row.cost));
      }

      return Object.fromEntries(byModel) as Record<string, number[]>;
    }),
});
