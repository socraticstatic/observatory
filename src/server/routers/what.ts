import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const whatRouter = router({
  tokenLifecycle: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const trunc = input.lookback === '1H' ? 'minute' : input.lookback === '24H' ? 'hour' : 'day';
      const rows = await ctx.db.$queryRaw<Array<{ bucket: Date; input: bigint; output: bigint; reasoning: bigint; cached: bigint }>>`
        SELECT
          date_trunc(${trunc}, ts) AS bucket,
          SUM(input_tokens) AS input,
          SUM(output_tokens) AS output,
          SUM(reasoning_tokens) AS reasoning,
          SUM(cached_tokens) AS cached
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
      return rows.map(r => ({
        label: r.bucket.toISOString(),
        input: Number(r.input),
        output: Number(r.output),
        reasoning: Number(r.reasoning),
        cached: Number(r.cached),
      }));
    }),
});
