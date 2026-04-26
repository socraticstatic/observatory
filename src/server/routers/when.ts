import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema } from '@/lib/lookback';

// Caps at 90 rows for readability — 1Y shows last 90 days
function heatmapDays(lookback: string): number {
  if (lookback === '1H' || lookback === '24H') return 1;
  if (lookback === '90D' || lookback === '1Y') return 90;
  return 30;
}

export const whenRouter = router({
  heatmap: publicProcedure
    .input(z.object({
      lookback: LookbackSchema.optional(),
      provider: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const lookback = input?.lookback ?? '30D';
      const days = heatmapDays(lookback);
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{ days_ago: number; h: number; value: unknown }>>`
        SELECT
          (CURRENT_DATE - DATE_TRUNC('day', ts)::date)::int AS days_ago,
          EXTRACT(HOUR FROM ts)::int AS h,
          COUNT(*)::float AS value
        FROM llm_events
        WHERE ts >= NOW() - (${days} || ' days')::interval ${pfSql}
        GROUP BY days_ago, h
        ORDER BY days_ago, h
      `;
      return {
        days,
        rows: rows.map(r => ({
          days_ago: Number(r.days_ago),
          h: r.h,
          value: Number(r.value),
        })),
      };
    }),
});
