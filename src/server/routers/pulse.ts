import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

const lookbackInput = z.object({ lookback: LookbackSchema, provider: z.string().optional() });

function msSince(interval: string): number {
  if (interval === '1 hour')   return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const pulseRouter = router({
  overallCost: publicProcedure
    .input(lookbackInput)
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const ms = msSince(interval);
      const since     = new Date(Date.now() - ms);
      const prevSince = new Date(Date.now() - 2 * ms);
      const pf = input.provider ? { provider: input.provider } : {};
      const [agg, prevAgg] = await Promise.all([
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since }, status: 'ok', ...pf },
          _sum: { costUsd: true, inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true },
          _count: { id: true },
        }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: prevSince, lt: since }, status: 'ok', ...pf },
          _sum: { costUsd: true },
        }),
      ]);
      return {
        totalCostUsd:         Number(agg._sum.costUsd ?? 0),
        priorCostUsd:         Number(prevAgg._sum.costUsd ?? 0),
        totalInputTokens:     Number(agg._sum.inputTokens ?? 0),
        totalOutputTokens:    Number(agg._sum.outputTokens ?? 0),
        totalCachedTokens:    Number(agg._sum.cachedTokens ?? 0),
        totalReasoningTokens: Number(agg._sum.reasoningTokens ?? 0),
        totalCalls:           Number(agg._count.id ?? 0),
      };
    }),

  burnRate: publicProcedure
    .query(async ({ ctx }) => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const ystdStart = new Date(todayStart.getTime() - 86_400_000);
      const [today, yesterday] = await Promise.all([
        ctx.db.llmEvent.aggregate({ where: { ts: { gte: todayStart } }, _sum: { costUsd: true } }),
        ctx.db.llmEvent.aggregate({ where: { ts: { gte: ystdStart, lt: todayStart } }, _sum: { costUsd: true } }),
      ]);
      const todayCost = Number(today._sum.costUsd ?? 0);
      const ystdCost  = Number(yesterday._sum.costUsd ?? 0);
      const hourOfDay = new Date().getHours() + new Date().getMinutes() / 60;
      const projected = hourOfDay > 0 ? (todayCost / hourOfDay) * 24 : 0;
      const budget    = Number(process.env.MONTHLY_BUDGET_USD ?? 200);
      return {
        todayCost,
        projected,
        ystdCost,
        deltaVsYesterday: ystdCost > 0 ? (todayCost / ystdCost - 1) * 100 : 0,
        budget,
        runway: projected > 0 ? Math.min(budget / projected, 999) : 999,
        utilPct: (todayCost / budget) * 100,
      };
    }),

  statStrip: publicProcedure
    .input(lookbackInput)
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const since = new Date(Date.now() - msSince(interval));
      // Also query the prior period for delta
      const ms = msSince(interval);
      const prevSince = new Date(Date.now() - 2 * ms);
      const pf = input.provider ? { provider: input.provider } : {};
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const [agg, errors, sessions, prevAgg, latPct] = await Promise.all([
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since }, ...pf },
          _count: { id: true },
          _sum: { cachedTokens: true, inputTokens: true, outputTokens: true },
          _avg: { latencyMs: true, qualityScore: true },
        }),
        ctx.db.llmEvent.count({ where: { ts: { gte: since }, status: 'error', ...pf } }),
        ctx.db.llmEvent.findMany({ where: { ts: { gte: since }, ...pf }, distinct: ['sessionId'], select: { sessionId: true } }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: prevSince, lt: since }, ...pf },
          _count: { id: true },
          _sum: { cachedTokens: true, inputTokens: true },
          _avg: { latencyMs: true },
        }),
        ctx.db.$queryRaw<Array<{ p50: unknown; p99: unknown; avg_lat: unknown; prev_avg_lat: unknown }>>`
          SELECT
            PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ts >= ${since}) AS p50,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ts >= ${since}) AS p99,
            AVG("latencyMs") FILTER (WHERE ts >= ${since}) AS avg_lat,
            AVG("latencyMs") FILTER (WHERE ts >= ${prevSince} AND ts < ${since}) AS prev_avg_lat
          FROM llm_events
          WHERE ts >= ${prevSince} AND status = 'ok' ${pfSql}
            AND ("contentType" NOT IN ('tts', 'video', 'image') OR "contentType" IS NULL)
        `,
      ]);
      const total = Number(agg._count.id ?? 0);
      const prevTotal = Number(prevAgg._count.id ?? 0);
      const totalCached = Number(agg._sum.cachedTokens ?? 0);
      const totalInput  = Number(agg._sum.inputTokens ?? 0);
      const totalOutput = Number(agg._sum.outputTokens ?? 0);
      const prevCached  = Number(prevAgg._sum.cachedTokens ?? 0);
      const prevInput   = Number(prevAgg._sum.inputTokens ?? 0);
      const avgLat      = latPct[0]?.avg_lat != null ? Math.round(Number(latPct[0].avg_lat)) : 0;
      const prevAvgLat  = latPct[0]?.prev_avg_lat != null ? Math.round(Number(latPct[0].prev_avg_lat)) : 0;
      return {
        totalCalls:       total,
        prevTotalCalls:   prevTotal,
        cacheHitPct:      totalInput > 0 ? (totalCached / (totalInput + totalCached)) * 100 : 0,
        prevCacheHitPct:  prevInput > 0 ? (prevCached / (prevInput + prevCached)) * 100 : 0,
        avgLatencyMs:     avgLat,
        prevAvgLatencyMs: prevAvgLat,
        p50LatMs:         latPct[0]?.p50 != null ? Math.round(Number(latPct[0].p50)) : 0,
        p99LatMs:         latPct[0]?.p99 != null ? Math.round(Number(latPct[0].p99)) : 0,
        avgQuality:       Number(agg._avg.qualityScore ?? 0),
        errorRatePct:     total > 0 ? (errors / total) * 100 : 0,
        activeSessions:   sessions.length,
        efficiency:       totalInput > 0 ? totalOutput / totalInput : 0,
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalCachedTokens: totalCached,
      };
    }),

  // 7-day daily cache hit % trend for sparkline
  cacheHitTrend: publicProcedure
    .query(async ({ ctx }) => {
      const since7d = new Date(Date.now() - 7 * 86_400_000);
      const rows = await ctx.db.$queryRaw<Array<{
        day: Date; cached: bigint; input: bigint;
      }>>`
        SELECT
          date_trunc('day', ts) AS day,
          SUM("cachedTokens") AS cached,
          SUM("inputTokens")  AS input
        FROM llm_events
        WHERE ts >= ${since7d}
        GROUP BY day
        ORDER BY day ASC
      `;
      return rows.map(r => ({
        day:    r.day.toISOString().slice(0, 10),
        hitPct: (Number(r.input) + Number(r.cached)) > 0
          ? (Number(r.cached) / (Number(r.input) + Number(r.cached))) * 100
          : 0,
      }));
    }),

  pulseChart: publicProcedure
    .input(lookbackInput)
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const since = new Date(Date.now() - msSince(interval));
      const trunc = input.lookback === '1H' ? 'minute' : input.lookback === '24H' ? 'hour' : 'day';
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{ bucket: Date; tokens: bigint; cost: unknown; lat_p95: unknown }>>`
        SELECT
          date_trunc(${trunc}, ts) AS bucket,
          SUM("inputTokens" + "outputTokens" + "reasoningTokens") AS tokens,
          SUM("costUsd")::float AS cost,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS lat_p95
        FROM llm_events
        WHERE ts >= ${since} AND status = 'ok' ${pfSql}
          AND ("contentType" NOT IN ('tts', 'video', 'image') OR "contentType" IS NULL)
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
      return rows.map(r => ({
        bucket: r.bucket.toISOString(),
        tokens: Number(r.tokens),
        cost:   Number(r.cost),
        latP95: Math.round(Number(r.lat_p95) ?? 0),
      }));
    }),
});
