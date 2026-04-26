import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const sessionLabelsRouter = router({
  get: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.sessionLabel.findUnique({ where: { sessionId: input.sessionId } });
      return row?.label ?? null;
    }),

  getMany: publicProcedure
    .input(z.object({ sessionIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.sessionLabel.findMany({
        where: { sessionId: { in: input.sessionIds } },
      });
      return Object.fromEntries(rows.map(r => [r.sessionId, r.label]));
    }),

  set: publicProcedure
    .input(z.object({ sessionId: z.string().min(1), label: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.sessionLabel.upsert({
        where:  { sessionId: input.sessionId },
        create: { sessionId: input.sessionId, label: input.label },
        update: { label: input.label },
      });
    }),

  delete: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.sessionLabel.delete({ where: { sessionId: input.sessionId } }).catch(() => null);
      return { ok: true };
    }),
});
