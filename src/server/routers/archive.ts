import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';

export const archiveRouter = router({
  summary: publicProcedure
    .input(z.object({
      from:     z.string(),
      to:       z.string(),
      provider: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const from = new Date(input.from);
      const to   = new Date(input.to);
      to.setHours(23, 59, 59, 999);
      const pf    = input.provider ? { provider: input.provider } : {};
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const [agg, errors, byModel, byProvider, daily] = await Promise.all([
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: from, lte: to }, ...pf },
          _sum:   { costUsd: true, inputTokens: true, cachedTokens: true },
          _count: { id: true },
          _avg:   { latencyMs: true },
        }),
        ctx.db.llmEvent.count({ where: { ts: { gte: from, lte: to }, status: 'error', ...pf } }),
        ctx.db.$queryRaw<Array<{ model: string; cost: unknown; calls: unknown }>>`
          SELECT model,
                 SUM("costUsd")::float  AS cost,
                 COUNT(*)::int          AS calls
          FROM   llm_events
          WHERE  ts >= ${from} AND ts <= ${to} ${pfSql}
          GROUP  BY model
          ORDER  BY cost DESC
          LIMIT  8
        `,
        ctx.db.$queryRaw<Array<{ provider: string; cost: unknown; calls: unknown }>>`
          SELECT provider,
                 SUM("costUsd")::float  AS cost,
                 COUNT(*)::int          AS calls
          FROM   llm_events
          WHERE  ts >= ${from} AND ts <= ${to} ${pfSql}
          GROUP  BY provider
          ORDER  BY cost DESC
        `,
        ctx.db.$queryRaw<Array<{ day: Date; cost: unknown; calls: unknown }>>`
          SELECT DATE_TRUNC('day', ts)::timestamptz AS day,
                 SUM("costUsd")::float               AS cost,
                 COUNT(*)::int                       AS calls
          FROM   llm_events
          WHERE  ts >= ${from} AND ts <= ${to} ${pfSql}
          GROUP  BY DATE_TRUNC('day', ts)
          ORDER  BY day ASC
        `,
      ]);

      const total        = Number(agg._count.id ?? 0);
      const totalCostUsd = Number(agg._sum.costUsd ?? 0);
      const totalInput   = Number(agg._sum.inputTokens ?? 0);
      const totalCached  = Number(agg._sum.cachedTokens ?? 0);

      return {
        totalCalls:   total,
        totalCostUsd,
        errorCount:   errors,
        avgLatencyMs: Number(agg._avg.latencyMs ?? 0),
        cacheHitPct:  (totalInput + totalCached) > 0
          ? (totalCached / (totalInput + totalCached)) * 100
          : 0,
        byModel: byModel.map(r => ({
          model: String(r.model),
          cost:  Number(r.cost),
          calls: Number(r.calls),
        })),
        byProvider: byProvider.map(r => ({
          provider: String(r.provider),
          cost:     Number(r.cost),
          calls:    Number(r.calls),
        })),
        daily: daily.map(r => ({
          day: r.day instanceof Date
            ? r.day.toISOString().split('T')[0]
            : String(r.day).split('T')[0],
          cost:  Number(r.cost),
          calls: Number(r.calls),
        })),
      };
    }),

  assess: publicProcedure
    .query(async ({ ctx }) => {
      const [buckets, rollupStats] = await Promise.all([
        ctx.db.$queryRaw<Array<{
          hot: unknown; warm: unknown; cold: unknown; archivable: unknown;
          oldest: Date | null; newest: Date | null; total: unknown;
        }>>`
          SELECT
            COUNT(*) FILTER (WHERE ts >= NOW() - INTERVAL '7 days')                      AS hot,
            COUNT(*) FILTER (WHERE ts >= NOW() - INTERVAL '30 days'
                               AND ts <  NOW() - INTERVAL '7 days')                      AS warm,
            COUNT(*) FILTER (WHERE ts >= NOW() - INTERVAL '90 days'
                               AND ts <  NOW() - INTERVAL '30 days')                     AS cold,
            COUNT(*) FILTER (WHERE ts <  NOW() - INTERVAL '90 days')                     AS archivable,
            MIN(ts)                                                                        AS oldest,
            MAX(ts)                                                                        AS newest,
            COUNT(*)                                                                       AS total
          FROM llm_events
        `,
        ctx.db.$queryRaw<Array<{ rollup_days: unknown; rollup_calls: unknown; rollup_cost: unknown }>>`
          SELECT
            COUNT(DISTINCT day)    AS rollup_days,
            SUM(calls)             AS rollup_calls,
            SUM(cost_usd)::float   AS rollup_cost
          FROM llm_daily_rollups
        `,
      ]);

      const b = buckets[0];
      const r = rollupStats[0];
      return {
        raw: {
          hot:        Number(b?.hot ?? 0),
          warm:       Number(b?.warm ?? 0),
          cold:       Number(b?.cold ?? 0),
          archivable: Number(b?.archivable ?? 0),
          total:      Number(b?.total ?? 0),
          oldest:     b?.oldest?.toISOString() ?? null,
          newest:     b?.newest?.toISOString() ?? null,
        },
        rollups: {
          days:      Number(r?.rollup_days ?? 0),
          calls:     Number(r?.rollup_calls ?? 0),
          costUsd:   Number(r?.rollup_cost ?? 0),
        },
      };
    }),

  runs: publicProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.$queryRaw<Array<{
        id: string; started_at: Date; finished_at: Date | null;
        status: string; cutoff_days: number;
        rows_rolled_up: number; rows_deleted: number;
        rollup_days_span: number; export_path: string | null;
        error_message: string | null;
      }>>`
        SELECT id, started_at, finished_at, status, cutoff_days,
               rows_rolled_up, rows_deleted, rollup_days_span,
               export_path, error_message
        FROM archive_runs
        ORDER BY started_at DESC
        LIMIT 20
      `;
      return rows.map(r => ({
        id:             r.id,
        startedAt:      r.started_at.toISOString(),
        finishedAt:     r.finished_at?.toISOString() ?? null,
        status:         r.status,
        cutoffDays:     r.cutoff_days,
        rowsRolledUp:   r.rows_rolled_up,
        rowsDeleted:    r.rows_deleted,
        rollupDaysSpan: r.rollup_days_span,
        exportPath:     r.export_path,
        errorMessage:   r.error_message,
      }));
    }),
});
