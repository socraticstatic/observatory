import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  if (interval === '90 days')  return 90 * 86_400_000;
  if (interval === '365 days') return 365 * 86_400_000;
  return 30 * 86_400_000;
}

export const eventsRouter = router({
  timeline: publicProcedure
    .input(z.object({
      lookback: LookbackSchema.optional(),
      provider: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const lb = input?.lookback ?? '30D';
      const interval = lookbackToInterval(lb);
      const since = new Date(Date.now() - msSince(interval));
      const trunc = lb === '1H' ? 'minute' : lb === '24H' ? 'hour' : 'day';
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const [annotations, daily] = await Promise.all([
        ctx.db.annotation.findMany({
          where: { ts: { gte: since } },
          orderBy: { ts: 'asc' },
        }),
        ctx.db.$queryRaw<Array<{ d: Date; cost: unknown }>>`
          SELECT date_trunc(${trunc}, ts) AS d, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${since} ${pfSql}
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
