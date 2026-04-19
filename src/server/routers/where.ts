import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const whereRouter = router({
  regional: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{ region: string; calls: bigint; cost: unknown; avg_lat: unknown }>>`
        SELECT
          COALESCE(region, 'unknown') AS region,
          COUNT(*) AS calls,
          SUM(cost_usd)::float AS cost,
          AVG(latency_ms)::float AS avg_lat
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY region
        ORDER BY cost DESC
      `;
      return rows.map(r => ({
        region: r.region,
        calls: Number(r.calls),
        cost: Number(r.cost),
        avgLatMs: Math.round(Number(r.avg_lat) ?? 0),
      }));
    }),
});
