import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';

export const whenRouter = router({
  heatmap: publicProcedure
    .input(z.object({ provider: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{ days_ago: number; h: number; value: unknown }>>`
        SELECT
          (CURRENT_DATE - DATE_TRUNC('day', ts)::date)::int AS days_ago,
          EXTRACT(HOUR FROM ts)::int AS h,
          COUNT(*)::float AS value
        FROM llm_events
        WHERE ts >= NOW() - INTERVAL '30 days' ${pfSql}
        GROUP BY days_ago, h
        ORDER BY days_ago, h
      `;
      return rows.map(r => ({
        days_ago: Number(r.days_ago),
        h: r.h,
        value: Number(r.value),
      }));
    }),
});
