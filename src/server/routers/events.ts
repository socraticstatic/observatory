import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const eventsRouter = router({
  timeline: publicProcedure
    .input(z.object({ lookback: LookbackSchema }).optional())
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input?.lookback ?? '30D');
      const since = new Date(Date.now() - msSince(interval));
      const trunc = (input?.lookback ?? '30D') === '1H' ? 'minute' : (input?.lookback ?? '30D') === '24H' ? 'hour' : 'day';
      const [annotations, daily] = await Promise.all([
        ctx.db.annotation.findMany({
          where: { ts: { gte: since } },
          orderBy: { ts: 'asc' },
        }),
        ctx.db.$queryRaw<Array<{ d: Date; cost: unknown }>>`
          SELECT date_trunc(${trunc}, ts) AS d, SUM("costUsd")::float AS cost
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
