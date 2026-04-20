import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const servicesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.registeredService.findMany({ orderBy: { addedAt: 'asc' } });
  }),

  register: publicProcedure
    .input(z.object({
      provider: z.string().min(1),
      label:    z.string().min(1),
      category: z.enum(['llm', 'creative']).default('llm'),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.registeredService.upsert({
        where:  { provider: input.provider },
        create: input,
        update: { label: input.label, category: input.category },
      });
    }),
});
