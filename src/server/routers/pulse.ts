import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

const lookbackInput = z.object({ lookback: LookbackSchema, provider: z.string().optional() });

function msSince(interval: string): number {
  if (interval === '1 hour')   return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  if (interval === '90 days')  return 90 * 86_400_000;
  if (interval === '365 days') return 365 * 86_400_000;
  return 30 * 86_400_000;
}

// Cache-read cost per provider tier, aligned with src/lib/pricing.ts
// Anthropic: cacheReadMult=0.10; OpenAI gpt-4o/o*: mult=0.50; Gemini: mult=0.25
function cacheReadCostSql(since: Date, until: Date | null, pfSql: Prisma.Sql) {
  const untilClause = until ? Prisma.sql`AND ts < ${until}` : Prisma.empty;
  return Prisma.sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN model ILIKE '%claude-opus%'           THEN "cachedTokens"::numeric * 0.0000015
        WHEN model ILIKE '%claude-sonnet%'         THEN "cachedTokens"::numeric * 0.0000003
        WHEN model ILIKE '%claude-haiku%'          THEN "cachedTokens"::numeric * 0.00000008
        WHEN model ILIKE '%gpt-4o-mini%'           THEN "cachedTokens"::numeric * 0.000000075
        WHEN model ILIKE '%gpt-4o%'                THEN "cachedTokens"::numeric * 0.00000125
        WHEN model ILIKE '%o3-mini%' OR model ILIKE '%o1-mini%' THEN "cachedTokens"::numeric * 0.00000055
        WHEN model ILIKE '%o3%' OR model ILIKE '%o1%' THEN "cachedTokens"::numeric * 0.0000075
        WHEN model ILIKE '%gemini-2.5-flash%'      THEN "cachedTokens"::numeric * 0.0000000375
        WHEN model ILIKE '%gemini-2.0-flash%'      THEN "cachedTokens"::numeric * 0.000000025
        WHEN model ILIKE '%gemini%'                THEN "cachedTokens"::numeric * 0.0000003125
        ELSE                                            "cachedTokens"::numeric * 0.0000003
      END
    ), 0)::float AS cache_read_cost
    FROM llm_events
    WHERE ts >= ${since} ${untilClause} ${pfSql}
  `;
}

// Apply billing plan corrections: subscription providers use prorated monthly budget
// instead of per-token calculated cost. API providers keep their costUsd as-is.
async function applyBillingPlans(
  db: { registeredService: { findMany: (args: { select: { provider: boolean; billingPlan: boolean; monthlyBudgetUsd: boolean } }) => Promise<Array<{ provider: string; billingPlan: string; monthlyBudgetUsd: number }>> } },
  providerCostMap: Map<string, number>,  // provider → computed API costUsd
  periodMs: number,
): Promise<{ adjusted: number; isAllSubscription: boolean }> {
  const services = await db.registeredService.findMany({
    select: { provider: true, billingPlan: true, monthlyBudgetUsd: true },
  });
  const planMap = new Map(services.map(s => [s.provider, s]));
  const monthMs = 30 * 86_400_000;

  let adjusted = 0;
  for (const [provider, apiCost] of providerCostMap) {
    const svc = planMap.get(provider);
    if (svc?.billingPlan === 'subscription' && svc.monthlyBudgetUsd > 0) {
      adjusted += svc.monthlyBudgetUsd * (periodMs / monthMs);
    } else {
      adjusted += apiCost;
    }
  }

  // Also add subscription cost for providers with no events in period
  for (const svc of services) {
    if (svc.billingPlan === 'subscription' && svc.monthlyBudgetUsd > 0 && !providerCostMap.has(svc.provider)) {
      adjusted += svc.monthlyBudgetUsd * (periodMs / monthMs);
    }
  }

  const subCount = services.filter(s => s.billingPlan === 'subscription').length;
  const isAllSubscription = subCount > 0 && subCount === services.length;

  return { adjusted, isAllSubscription };
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
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const [agg, prevAgg, cacheRows, prevCacheRows, providerCosts, prevProviderCosts] = await Promise.all([
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since }, status: 'ok', ...pf },
          _sum: { costUsd: true, inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true },
          _count: { id: true },
        }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: prevSince, lt: since }, status: 'ok', ...pf },
          _sum: { costUsd: true },
        }),
        ctx.db.$queryRaw<[{ cache_read_cost: number }]>(cacheReadCostSql(since, null, pfSql)),
        ctx.db.$queryRaw<[{ cache_read_cost: number }]>(cacheReadCostSql(prevSince, since, pfSql)),
        ctx.db.$queryRaw<Array<{ provider: string; cost: number }>>`
          SELECT provider, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${since} AND status = 'ok' ${pfSql}
          GROUP BY provider
        `,
        ctx.db.$queryRaw<Array<{ provider: string; cost: number }>>`
          SELECT provider, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${prevSince} AND ts < ${since} AND status = 'ok' ${pfSql}
          GROUP BY provider
        `,
      ]);

      const rawCostMap     = new Map(providerCosts.map(r => [r.provider, Number(r.cost)]));
      const prevRawCostMap = new Map(prevProviderCosts.map(r => [r.provider, Number(r.cost)]));

      const [billing, prevBilling] = await Promise.all([
        applyBillingPlans(ctx.db, rawCostMap, ms),
        applyBillingPlans(ctx.db, prevRawCostMap, ms),
      ]);

      const rawCostUsd       = Number(agg._sum.costUsd ?? 0);
      const cacheReadCostUsd = Number(cacheRows[0]?.cache_read_cost ?? 0);
      const rawPriorCost     = Number(prevAgg._sum.costUsd ?? 0);
      const prevCacheRead    = Number(prevCacheRows[0]?.cache_read_cost ?? 0);

      // Effective cost uses billing-plan-adjusted value; cache split applies only to API-billed portion
      const effectiveCacheRead = billing.isAllSubscription ? 0 : cacheReadCostUsd;

      return {
        totalCostUsd:          billing.adjusted,
        inferenceCostUsd:      billing.adjusted - effectiveCacheRead,
        cacheReadCostUsd:      effectiveCacheRead,
        priorCostUsd:          prevBilling.adjusted,
        priorInferenceCostUsd: prevBilling.adjusted - (billing.isAllSubscription ? 0 : prevCacheRead),
        isSubscriptionBilling: billing.isAllSubscription,
        totalInputTokens:      Number(agg._sum.inputTokens ?? 0),
        totalOutputTokens:     Number(agg._sum.outputTokens ?? 0),
        totalCachedTokens:     Number(agg._sum.cachedTokens ?? 0),
        totalReasoningTokens:  Number(agg._sum.reasoningTokens ?? 0),
        totalCalls:            Number(agg._count.id ?? 0),
      };
    }),

  burnRate: publicProcedure
    .input(z.object({ provider: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const pf = input?.provider ? { provider: input.provider } : {};
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const ystdStart = new Date(todayStart.getTime() - 86_400_000);
      const [today, yesterday, todayCacheRows, ystdCacheRows] = await Promise.all([
        ctx.db.llmEvent.aggregate({ where: { ts: { gte: todayStart }, ...pf }, _sum: { costUsd: true } }),
        ctx.db.llmEvent.aggregate({ where: { ts: { gte: ystdStart, lt: todayStart }, ...pf }, _sum: { costUsd: true } }),
        ctx.db.$queryRaw<[{ cache_read_cost: number }]>(cacheReadCostSql(todayStart, null, pfSql)),
        ctx.db.$queryRaw<[{ cache_read_cost: number }]>(cacheReadCostSql(ystdStart, todayStart, pfSql)),
      ]);
      const rawTodayCost  = Number(today._sum.costUsd ?? 0);
      const rawYstdCost   = Number(yesterday._sum.costUsd ?? 0);
      const todayCacheRead = Number(todayCacheRows[0]?.cache_read_cost ?? 0);
      const ystdCacheRead  = Number(ystdCacheRows[0]?.cache_read_cost ?? 0);

      // Resolve per-provider billing plans for today
      const [todayProviders, ystdProviders] = await Promise.all([
        ctx.db.$queryRaw<Array<{ provider: string; cost: number }>>`
          SELECT provider, SUM("costUsd")::float AS cost FROM llm_events
          WHERE ts >= ${todayStart} ${pfSql} GROUP BY provider
        `,
        ctx.db.$queryRaw<Array<{ provider: string; cost: number }>>`
          SELECT provider, SUM("costUsd")::float AS cost FROM llm_events
          WHERE ts >= ${ystdStart} AND ts < ${todayStart} ${pfSql} GROUP BY provider
        `,
      ]);
      const dayMs = 86_400_000;
      const [todayBilling, ystdBilling] = await Promise.all([
        applyBillingPlans(ctx.db, new Map(todayProviders.map(r => [r.provider, Number(r.cost)])), dayMs),
        applyBillingPlans(ctx.db, new Map(ystdProviders.map(r => [r.provider, Number(r.cost)])), dayMs),
      ]);

      const todayEffective   = todayBilling.adjusted;
      const ystdEffective    = ystdBilling.adjusted;
      const todayCacheEff    = todayBilling.isAllSubscription ? 0 : todayCacheRead;
      const todayInference   = todayEffective - todayCacheEff;
      const ystdCacheEff     = ystdBilling.isAllSubscription ? 0 : ystdCacheRead;
      const ystdInference    = ystdEffective - ystdCacheEff;
      const hourOfDay        = new Date().getHours() + new Date().getMinutes() / 60;
      // Subscription billing is flat per day — don't extrapolate from current hour.
      // Before 2 hours of data, today's spend is too volatile; fall back to yesterday's rate.
      const projectedInference = todayBilling.isAllSubscription
        ? todayInference
        : hourOfDay >= 2
          ? (todayInference / hourOfDay) * 24
          : ystdInference > 0 ? ystdInference : (hourOfDay > 0 ? (todayInference / hourOfDay) * 24 : 0);
      const budget           = Number(process.env.MONTHLY_BUDGET_USD ?? 200);
      return {
        todayCost:           rawTodayCost,
        todayInferenceCost:  todayInference,
        todayCacheReadCost:  todayCacheEff,
        projected:           projectedInference,
        ystdCost:            rawYstdCost,
        ystdInferenceCost:   ystdInference,
        isSubscriptionBilling: todayBilling.isAllSubscription,
        deltaVsYesterday: ystdInference > 0 ? (todayInference / ystdInference - 1) * 100 : 0,
        budget,
        runway: projectedInference > 0 ? Math.min(budget / projectedInference, 999) : 999,
        utilPct: (todayInference / budget) * 100,
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
        ctx.db.llmEvent.findMany({ where: { ts: { gte: since }, sessionId: { not: null }, ...pf }, distinct: ['sessionId'], select: { sessionId: true } }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: prevSince, lt: since }, ...pf },
          _count: { id: true },
          _sum: { cachedTokens: true, inputTokens: true },
          _avg: { latencyMs: true },
        }),
        ctx.db.$queryRaw<Array<{ p50: unknown; p95: unknown; p99: unknown; avg_lat: unknown; prev_avg_lat: unknown; llm_input: unknown; llm_output: unknown }>>`
          SELECT
            PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ts >= ${since}) AS p50,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ts >= ${since}) AS p95,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ts >= ${since}) AS p99,
            AVG("latencyMs") FILTER (WHERE ts >= ${since}) AS avg_lat,
            AVG("latencyMs") FILTER (WHERE ts >= ${prevSince} AND ts < ${since}) AS prev_avg_lat,
            COALESCE(SUM("inputTokens") FILTER (WHERE ts >= ${since}), 0)  AS llm_input,
            COALESCE(SUM("outputTokens") FILTER (WHERE ts >= ${since}), 0) AS llm_output
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
        p95LatMs:         latPct[0]?.p95 != null ? Math.round(Number(latPct[0].p95)) : 0,
        p99LatMs:         latPct[0]?.p99 != null ? Math.round(Number(latPct[0].p99)) : 0,
        avgQuality:       Number(agg._avg.qualityScore ?? 0),
        errorRatePct:     total > 0 ? (errors / total) * 100 : 0,
        activeSessions:   sessions.length,
        efficiency:       Number(latPct[0]?.llm_input ?? 0) > 0 ? Number(latPct[0]?.llm_output ?? 0) / Number(latPct[0]?.llm_input ?? 1) : 0,
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalCachedTokens: totalCached,
      };
    }),

  // Daily cache hit % trend for sparkline
  cacheHitTrend: publicProcedure
    .input(lookbackInput.optional())
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input?.lookback ?? '30D');
      const since = new Date(Date.now() - msSince(interval));
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{
        day: Date; cached: bigint; input: bigint;
      }>>`
        SELECT
          date_trunc('day', ts) AS day,
          SUM("cachedTokens") AS cached,
          SUM("inputTokens")  AS input
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
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
          SUM(CASE WHEN "contentType" NOT IN ('tts', 'video', 'image') OR "contentType" IS NULL
                   THEN "inputTokens" + "outputTokens" + "reasoningTokens" ELSE 0 END) AS tokens,
          SUM("costUsd")::float AS cost,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")
            FILTER (WHERE "contentType" NOT IN ('tts', 'video', 'image') OR "contentType" IS NULL) AS lat_p95
        FROM llm_events
        WHERE ts >= ${since} AND status = 'ok' ${pfSql}
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

  lastIngest: publicProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.$queryRaw<Array<{ last_ts: Date | null }>>`
        SELECT MAX(ts) AS last_ts FROM llm_events
      `;
      const raw = rows[0]?.last_ts ?? null;
      return { lastTs: raw ? raw.toISOString() : null };
    }),
});
