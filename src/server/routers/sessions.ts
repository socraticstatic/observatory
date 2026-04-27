import { z } from 'zod';
import { Prisma } from '@prisma/client';
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

export const sessionsRouter = router({
  list: publicProcedure
    .input(z.object({
      lookback: LookbackSchema,
      provider: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{
        session_id:    string;
        project:       string | null;
        surface:       string | null;
        started_at:    Date;
        ended_at:      Date;
        call_count:    bigint;
        total_cost:    unknown;
        total_tokens:  unknown;
        avg_lat:       unknown;
        error_count:   bigint;
        models:        string[];
        cached_tokens: unknown;
        input_tokens:  unknown;
        first_input:   bigint | null;
        last_input:    bigint | null;
      }>>`
        SELECT
          COALESCE("sessionId", '(no session)')                                          AS session_id,
          MODE() WITHIN GROUP (ORDER BY project)                                         AS project,
          MODE() WITHIN GROUP (ORDER BY surface)                                         AS surface,
          MIN(ts)                                                                         AS started_at,
          MAX(ts)                                                                         AS ended_at,
          COUNT(*)                                                                        AS call_count,
          COALESCE(SUM("costUsd"),                         0)::float                     AS total_cost,
          COALESCE(SUM("inputTokens" + "outputTokens"),    0)::float                     AS total_tokens,
          AVG("latencyMs")::float                                                         AS avg_lat,
          COUNT(*) FILTER (WHERE status = 'error')                                       AS error_count,
          array_agg(DISTINCT model)                                                       AS models,
          COALESCE(SUM("cachedTokens"),                    0)::float                     AS cached_tokens,
          COALESCE(SUM("inputTokens"),                     0)::float                     AS input_tokens,
          (ARRAY_AGG("inputTokens" + "cachedTokens" ORDER BY ts ASC))[1]::bigint        AS first_input,
          (ARRAY_AGG("inputTokens" + "cachedTokens" ORDER BY ts DESC))[1]::bigint       AS last_input
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
        GROUP BY COALESCE("sessionId", '(no session)')
        ORDER BY started_at DESC
        LIMIT 501
      `;
      const truncated = rows.length > 500;
      const slice = truncated ? rows.slice(0, 500) : rows;
      return { truncated, items: slice.map(r => {
        const cached     = Number(r.cached_tokens);
        const inputTok   = Number(r.input_tokens);
        const firstInput = Number(r.first_input ?? 0);
        const lastInput  = Number(r.last_input  ?? 0);
        return {
          sessionId:        r.session_id,
          project:          r.project,
          surface:          r.surface,
          startedAt:        r.started_at.toISOString(),
          endedAt:          r.ended_at.toISOString(),
          durationMs:       r.ended_at.getTime() - r.started_at.getTime(),
          callCount:        Number(r.call_count),
          totalCost:        Number(r.total_cost),
          totalTokens:      Number(r.total_tokens),
          avgLatMs:         Math.round(Number(r.avg_lat ?? 0)),
          errorCount:       Number(r.error_count),
          models:           r.models,
          cacheHitPct:      (cached + inputTok) > 0 ? cached / (cached + inputTok) * 100 : 0,
          tokenGrowthRatio: firstInput > 0 ? lastInput / firstInput : 1,
        };
      }) };
    }),

  events: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      lookback:  LookbackSchema,
      provider:  z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pf = input.provider ? { provider: input.provider } : {};
      const items = await ctx.db.llmEvent.findMany({
        where: {
          ts:        { gte: since },
          sessionId: input.sessionId === '(no session)' ? null : input.sessionId,
          ...pf,
        },
        orderBy: { ts: 'asc' },
        take: 200,
        select: {
          id: true, ts: true, model: true, provider: true,
          inputTokens: true, outputTokens: true, cachedTokens: true,
          costUsd: true, latencyMs: true, status: true, contentType: true,
        },
      });
      return items.map(e => ({
        id:           e.id,
        ts:           e.ts.toISOString(),
        model:        e.model,
        provider:     e.provider,
        inputTokens:  e.inputTokens,
        outputTokens: e.outputTokens,
        cachedTokens: e.cachedTokens,
        costUsd:      Number(e.costUsd),
        latencyMs:    e.latencyMs ?? null,
        status:       e.status,
        contentType:  e.contentType ?? null,
        billingUnit:  getBillingUnit(e.provider),
      }));
    }),
});
