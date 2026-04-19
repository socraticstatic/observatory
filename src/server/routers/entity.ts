import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const entityRouter = router({
  projects: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{ project: string; calls: bigint; cost: unknown; sessions: bigint }>>`
        SELECT
          COALESCE(project, 'untagged') AS project,
          COUNT(*) AS calls,
          SUM(cost_usd)::float AS cost,
          COUNT(DISTINCT session_id) AS sessions
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY project
        ORDER BY cost DESC
      `;
      return rows.map(r => ({ project: r.project, calls: Number(r.calls), costUsd: Number(r.cost), sessions: Number(r.sessions) }));
    }),

  sessions: publicProcedure
    .input(z.object({ project: z.string(), lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{ session_id: string; calls: bigint; cost: unknown; first_ts: Date; last_ts: Date }>>`
        SELECT
          session_id,
          COUNT(*) AS calls,
          SUM(cost_usd)::float AS cost,
          MIN(ts) AS first_ts,
          MAX(ts) AS last_ts
        FROM llm_events
        WHERE ts >= ${since} AND project = ${input.project}
        GROUP BY session_id
        ORDER BY last_ts DESC
      `;
      return rows.map(r => ({
        sessionId: r.session_id,
        calls: Number(r.calls),
        costUsd: Number(r.cost),
        firstTs: r.first_ts.toISOString(),
        lastTs: r.last_ts.toISOString(),
      }));
    }),

  turns: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const events = await ctx.db.llmEvent.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { ts: 'asc' },
        select: { id: true, ts: true, model: true, inputTokens: true, outputTokens: true, costUsd: true, latencyMs: true, status: true },
      });
      return events.map((e, i) => ({
        turn: i + 1,
        id: e.id,
        ts: e.ts.toISOString(),
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        costUsd: Number(e.costUsd),
        latencyMs: e.latencyMs ?? 0,
        status: e.status,
      }));
    }),
});
