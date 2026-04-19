import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const contentRouter = router({
  contentTypes: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{ ct: string; calls: bigint; input: bigint; output: bigint; cost: unknown; avg_quality: unknown }>>`
        SELECT
          COALESCE(content_type, 'unknown') AS ct,
          COUNT(*) AS calls,
          SUM(input_tokens) AS input,
          SUM(output_tokens) AS output,
          SUM(cost_usd)::float AS cost,
          AVG(quality_score)::float AS avg_quality
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY content_type
        ORDER BY cost DESC
      `;
      return rows.map(r => ({
        id: r.ct,
        label: r.ct,
        calls: Number(r.calls),
        inputTokens: Number(r.input),
        outputTokens: Number(r.output),
        costUsd: Number(r.cost),
        avgQuality: Number(r.avg_quality ?? 0),
      }));
    }),
});
