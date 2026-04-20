import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const archiveRouter = router({
  summary: publicProcedure
    .input(z.object({
      from: z.string(),
      to:   z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const from = new Date(input.from);
      const to   = new Date(input.to);
      to.setHours(23, 59, 59, 999);

      const [agg, errors, byModel, byProvider, daily] = await Promise.all([
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: from, lte: to } },
          _sum:   { costUsd: true, inputTokens: true, cachedTokens: true },
          _count: { id: true },
          _avg:   { latencyMs: true },
        }),
        ctx.db.llmEvent.count({ where: { ts: { gte: from, lte: to }, status: 'error' } }),
        ctx.db.$queryRaw<Array<{ model: string; cost: unknown; calls: unknown }>>`
          SELECT model,
                 SUM("costUsd")::float  AS cost,
                 COUNT(*)::int          AS calls
          FROM   llm_events
          WHERE  ts >= ${from} AND ts <= ${to}
          GROUP  BY model
          ORDER  BY cost DESC
          LIMIT  8
        `,
        ctx.db.$queryRaw<Array<{ provider: string; cost: unknown; calls: unknown }>>`
          SELECT provider,
                 SUM("costUsd")::float  AS cost,
                 COUNT(*)::int          AS calls
          FROM   llm_events
          WHERE  ts >= ${from} AND ts <= ${to}
          GROUP  BY provider
          ORDER  BY cost DESC
        `,
        ctx.db.$queryRaw<Array<{ day: Date; cost: unknown; calls: unknown }>>`
          SELECT DATE_TRUNC('day', ts)::timestamptz AS day,
                 SUM("costUsd")::float               AS cost,
                 COUNT(*)::int                       AS calls
          FROM   llm_events
          WHERE  ts >= ${from} AND ts <= ${to}
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
});
