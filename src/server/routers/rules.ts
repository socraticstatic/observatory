import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

const ruleShape = z.object({
  id:        z.string().optional(),
  name:      z.string().min(1),
  metric:    z.enum(['cost', 'latency', 'error_rate', 'calls']),
  lookback:  z.enum(['1H', '24H', '30D']),
  operator:  z.enum(['gt', 'lt']),
  threshold: z.number(),
  enabled:   z.boolean(),
});

function normalize(r: {
  id: string; name: string; metric: string; lookback: string;
  operator: string; threshold: unknown; enabled: boolean; createdAt: Date;
}) {
  return {
    id:        r.id,
    name:      r.name,
    metric:    r.metric,
    lookback:  r.lookback,
    operator:  r.operator,
    threshold: Number(r.threshold),
    enabled:   r.enabled,
    createdAt: r.createdAt.toISOString(),
  };
}

export const rulesRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.alertRule.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(normalize);
    }),

  upsert: publicProcedure
    .input(ruleShape)
    .mutation(async ({ ctx, input }) => {
      const existing = input.id
        ? await ctx.db.alertRule.findUnique({ where: { id: input.id } })
        : null;

      const data = {
        name:      input.name,
        metric:    input.metric,
        lookback:  input.lookback,
        operator:  input.operator,
        threshold: input.threshold,
        enabled:   input.enabled,
      };

      const row = existing && input.id
        ? await ctx.db.alertRule.update({ where: { id: input.id }, data })
        : await ctx.db.alertRule.create({ data: { ...data, id: crypto.randomUUID() } });

      return normalize(row);
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.alertRule.delete({ where: { id: input.id } });
    }),
});
