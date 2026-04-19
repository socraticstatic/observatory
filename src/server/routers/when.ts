import { router, publicProcedure } from '../trpc';

export const whenRouter = router({
  heatmap: publicProcedure
    .query(async ({ ctx }) => {
      const since = new Date(Date.now() - 30 * 86_400_000);
      const rows = await ctx.db.$queryRaw<Array<{ d: number; h: number; value: unknown }>>`
        SELECT
          EXTRACT(DOY FROM ts)::int AS d,
          EXTRACT(HOUR FROM ts)::int AS h,
          SUM(cost_usd)::float AS value
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY d, h
        ORDER BY d, h
      `;
      return rows.map(r => ({
        d: r.d,
        h: r.h,
        value: Number(r.value),
      }));
    }),
});
