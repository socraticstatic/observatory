import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const sessionsRouter = router({
  list: publicProcedure
    .input(z.object({
      lookback: LookbackSchema,
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{
        session_id:   string;
        project:      string | null;
        surface:      string | null;
        started_at:   Date;
        ended_at:     Date;
        call_count:   bigint;
        total_cost:   unknown;
        total_tokens: unknown;
        avg_lat:      unknown;
        error_count:  bigint;
        models:       string[];
      }>>`
        SELECT
          COALESCE("sessionId", '(no session)')             AS session_id,
          project,
          surface,
          MIN(ts)                                            AS started_at,
          MAX(ts)                                            AS ended_at,
          COUNT(*)                                           AS call_count,
          SUM("costUsd")::float                             AS total_cost,
          SUM("inputTokens" + "outputTokens")::float        AS total_tokens,
          AVG("latencyMs")::float                           AS avg_lat,
          COUNT(*) FILTER (WHERE status = 'error')          AS error_count,
          array_agg(DISTINCT model)                         AS models
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY COALESCE("sessionId", '(no session)'), project, surface
        ORDER BY started_at DESC
        LIMIT 200
      `;
      return rows.map(r => ({
        sessionId:    r.session_id,
        project:      r.project,
        surface:      r.surface,
        startedAt:    r.started_at.toISOString(),
        endedAt:      r.ended_at.toISOString(),
        durationMs:   r.ended_at.getTime() - r.started_at.getTime(),
        callCount:    Number(r.call_count),
        totalCost:    Number(r.total_cost),
        totalTokens:  Number(r.total_tokens),
        avgLatMs:     Math.round(Number(r.avg_lat ?? 0)),
        errorCount:   Number(r.error_count),
        models:       r.models,
      }));
    }),

  events: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      lookback:  LookbackSchema,
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const items = await ctx.db.llmEvent.findMany({
        where: {
          ts:        { gte: since },
          sessionId: input.sessionId === '(no session)' ? null : input.sessionId,
        },
        orderBy: { ts: 'asc' },
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
        latencyMs:    e.latencyMs ?? 0,
        status:       e.status,
        contentType:  e.contentType ?? null,
      }));
    }),
});
