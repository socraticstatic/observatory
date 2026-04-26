import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const whereRouter = router({
  regional: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{ region: string; calls: bigint; cost: unknown; avg_lat: unknown }>>`
        SELECT
          region,
          COUNT(*) AS calls,
          SUM("costUsd")::float AS cost,
          AVG("latencyMs")::float AS avg_lat
        FROM llm_events
        WHERE ts >= ${since}
          AND region IS NOT NULL
          AND region <> ''
          ${pfSql}
        GROUP BY region
        ORDER BY cost DESC
      `;
      return rows.map(r => ({
        region: r.region,
        calls: Number(r.calls),
        cost: Number(r.cost),
        avgLatMs: r.avg_lat != null ? Math.round(Number(r.avg_lat)) : null,
      }));
    }),
});
