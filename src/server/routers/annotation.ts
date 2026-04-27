import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const annotationRouter = router({
  rate: publicProcedure
    .input(z.object({
      traceId: z.string().min(1),
      score:   z.number().int().min(1).max(5),
      note:    z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.annotation.findFirst({
        where: { traceId: input.traceId, type: 'rating' },
      });

      const result = existing
        ? await ctx.db.annotation.update({
            where: { id: existing.id },
            data:  { score: input.score, detail: input.note ?? null, ts: new Date() },
          })
        : await ctx.db.annotation.create({
            data: {
              ts:       new Date(),
              type:     'rating',
              title:    'Quality rating',
              severity: 'info',
              score:    input.score,
              traceId:  input.traceId,
              detail:   input.note ?? null,
            },
          });

      return {
        id:      result.id,
        score:   result.score,
        traceId: result.traceId,
        note:    result.detail,
      };
    }),

  get: publicProcedure
    .input(z.object({ traceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.annotation.findFirst({
        where: { traceId: input.traceId, type: 'rating' },
      });
      if (!result) return null;
      return {
        id:      result.id,
        score:   result.score,
        traceId: result.traceId,
        note:    result.detail,
      };
    }),
});
