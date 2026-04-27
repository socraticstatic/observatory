import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const servicesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.registeredService.findMany({ orderBy: { addedAt: 'asc' } });
  }),

  register: publicProcedure
    .input(z.object({
      provider:        z.string().min(1),
      label:           z.string().min(1),
      category:        z.enum(['llm', 'creative']).default('llm'),
      billingPlan:     z.enum(['api', 'subscription']).default('api'),
      monthlyBudgetUsd: z.number().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.registeredService.upsert({
        where:  { provider: input.provider },
        create: input,
        update: {
          label:           input.label,
          category:        input.category,
          billingPlan:     input.billingPlan,
          monthlyBudgetUsd: input.monthlyBudgetUsd,
        },
      });
    }),

  delete: publicProcedure
    .input(z.object({ provider: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.registeredService.delete({ where: { provider: input.provider } });
      return { ok: true };
    }),

  deleteMany: publicProcedure
    .input(z.object({ providers: z.array(z.string().min(1)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.registeredService.deleteMany({
        where: { provider: { in: input.providers } },
      });
      return { count };
    }),
});
