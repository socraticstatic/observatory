import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const howRouter = router({
  agentTrace: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const events = await ctx.db.llmEvent.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { ts: 'asc' },
        select: {
          id: true, ts: true, model: true, provider: true,
          inputTokens: true, outputTokens: true, reasoningTokens: true,
          costUsd: true, latencyMs: true, status: true, contentType: true,
        },
      });
      return events.map((e, i) => ({
        step: i + 1,
        id: e.id,
        ts: e.ts.toISOString(),
        model: e.model,
        provider: e.provider,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        reasoningTokens: e.reasoningTokens,
        costUsd: Number(e.costUsd),
        latencyMs: e.latencyMs ?? 0,
        status: e.status,
        contentType: e.contentType ?? 'unknown',
      }));
    }),
});
