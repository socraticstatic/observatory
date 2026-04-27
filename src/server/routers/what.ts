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

export const whatRouter = router({
  tokenLifecycle: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const trunc = input.lookback === '1H' ? 'minute' : input.lookback === '24H' ? 'hour' : 'day';
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{ bucket: Date; input: bigint; output: bigint; reasoning: bigint; cached: bigint; cache_creation: bigint }>>`
        SELECT
          date_trunc(${trunc}, ts) AS bucket,
          SUM("inputTokens") AS input,
          SUM("outputTokens") AS output,
          SUM("reasoningTokens") AS reasoning,
          SUM("cachedTokens") AS cached,
          SUM("cacheCreationTokens") AS cache_creation
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
      return rows.map(r => ({
        label:         r.bucket.toISOString(),
        input:         Number(r.input),
        output:        Number(r.output),
        reasoning:     Number(r.reasoning),
        cached:        Number(r.cached),
        cacheCreation: Number(r.cache_creation),
      }));
    }),
});
