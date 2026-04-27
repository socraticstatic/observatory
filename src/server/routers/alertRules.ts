import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema } from '@/lib/lookback';

const RuleInput = z.object({
  name:      z.string().min(1).max(80),
  metric:    z.string().min(1),
  lookback:  LookbackSchema,
  operator:  z.enum(['gt', 'lt', 'gte', 'lte']).default('gt'),
  threshold: z.number().finite(),
  enabled:   z.boolean().default(true),
});

export const alertRulesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.alertRule.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(r => ({
      id:        r.id,
      name:      r.name,
      metric:    r.metric,
      lookback:  r.lookback,
      operator:  r.operator,
      threshold: Number(r.threshold),
      enabled:   r.enabled,
      createdAt: r.createdAt.toISOString(),
    }));
  }),

  create: publicProcedure
    .input(RuleInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.alertRule.create({
        data: {
          id:        crypto.randomUUID(),
          name:      input.name,
          metric:    input.metric,
          lookback:  input.lookback,
          operator:  input.operator,
          threshold: input.threshold,
          enabled:   input.enabled,
        },
      });
    }),

  update: publicProcedure
    .input(RuleInput.partial().extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.alertRule.update({ where: { id }, data });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.alertRule.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  toggleEnabled: publicProcedure
    .input(z.object({ id: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.alertRule.update({ where: { id: input.id }, data: { enabled: input.enabled } });
    }),
});
