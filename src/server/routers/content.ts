import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const contentRouter = router({
  contentTypes: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{ ct: string; calls: bigint; input: bigint; output: bigint; cost: unknown; avg_quality: unknown }>>`
        SELECT
          COALESCE("contentType", 'unknown') AS ct,
          COUNT(*) AS calls,
          SUM("inputTokens") AS input,
          SUM("outputTokens") AS output,
          SUM("costUsd")::float AS cost,
          AVG("qualityScore")::float AS avg_quality
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
          AND ("contentType" NOT IN ('tts', 'video', 'image') OR "contentType" IS NULL)
        GROUP BY "contentType"
        ORDER BY cost DESC
      `;
      return rows.map(r => ({
        id: r.ct,
        label: r.ct,
        calls: Number(r.calls),
        inputTokens: Number(r.input),
        outputTokens: Number(r.output),
        costUsd: Number(r.cost),
        avgQuality: r.avg_quality != null ? Number(r.avg_quality) : null,
      }));
    }),
});
