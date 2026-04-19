import { router, publicProcedure } from '../trpc';

export const eventsRouter = router({
  timeline: publicProcedure
    .query(async ({ ctx }) => {
      const since = new Date(Date.now() - 30 * 86_400_000);
      const [annotations, daily] = await Promise.all([
        ctx.db.annotation.findMany({
          where: { ts: { gte: since } },
          orderBy: { ts: 'asc' },
        }),
        ctx.db.$queryRaw<Array<{ d: Date; cost: unknown }>>`
          SELECT date_trunc('day', ts) AS d, SUM(cost_usd)::float AS cost
          FROM llm_events WHERE ts >= ${since}
          GROUP BY d ORDER BY d ASC
        `,
      ]);
      return {
        annotations: annotations.map(a => ({
          id: a.id,
          ts: a.ts.toISOString(),
          type: a.type,
          title: a.title,
          detail: a.detail,
          impact: a.impact,
          severity: a.severity,
        })),
        daily: daily.map(r => ({
          d: r.d.toISOString(),
          costUsd: Number(r.cost),
        })),
      };
    }),
});
