import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';

const providerInput = z.object({ provider: z.string().optional() }).optional();

export const insightsRouter = router({
  whyInsights: publicProcedure
    .input(providerInput)
    .query(async ({ ctx, input }) => {
      const since7d = new Date(Date.now() - 7 * 86_400_000);
      const since1d = new Date(Date.now() - 86_400_000);
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const [cacheToday, cache7d] = await Promise.all([
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT AVG("cachedTokens"::float / NULLIF("inputTokens" + "cachedTokens", 0)) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since1d} ${pfSql}
        `,
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT AVG("cachedTokens"::float / NULLIF("inputTokens" + "cachedTokens", 0)) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since7d} AND ts < ${since1d} ${pfSql}
        `,
      ]);

      const todayHit = Number(cacheToday[0]?.hit_ratio ?? 0);
      const weekHit  = Number(cache7d[0]?.hit_ratio ?? 0);
      const cacheDecay = weekHit > 0 && todayHit < weekHit * 0.6;

      const routingRows = await ctx.db.$queryRaw<Array<{ project: string; avg_quality: unknown; cost: unknown }>>`
        SELECT project, AVG("qualityScore")::float AS avg_quality, SUM("costUsd")::float AS cost
        FROM llm_events
        WHERE ts >= ${since7d} AND model LIKE '%opus%' ${pfSql}
        GROUP BY project
        HAVING AVG("qualityScore") < 92
        ORDER BY cost DESC
        LIMIT 3
      `;

      const insights = [];
      if (cacheDecay) {
        insights.push({
          id: 'cache-decay',
          severity: 'warn',
          title: 'Cache hit rate dropped',
          detail: `Today ${todayHit.toFixed(1)}% vs 7d avg ${weekHit.toFixed(1)}%`,
          recommendation: 'Review cache-busting changes or session reset patterns.',
        });
      }
      for (const row of routingRows) {
        insights.push({
          id: `routing-${row.project}`,
          severity: 'info',
          title: `Routing opportunity: ${row.project}`,
          detail: `Opus avg quality ${Number(row.avg_quality).toFixed(1)} - Sonnet may suffice`,
          recommendation: `Switch ${row.project} to Sonnet. Est. saving: ~60%.`,
        });
      }
      return insights;
    }),

  zombieSessions: publicProcedure
    .input(providerInput)
    .query(async ({ ctx, input }) => {
      const since24h = new Date(Date.now() - 24 * 3_600_000);
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const rows = await ctx.db.$queryRaw<Array<{
        session_id: string; project: string; surface: string;
        steps: bigint; cost: unknown; last_ts: Date;
        first_input: bigint; last_input: bigint;
      }>>`
        SELECT
          "sessionId" AS session_id,
          project,
          surface,
          COUNT(*) AS steps,
          SUM("costUsd")::float AS cost,
          MAX(ts) AS last_ts,
          (ARRAY_AGG("inputTokens" ORDER BY ts ASC))[1] AS first_input,
          (ARRAY_AGG("inputTokens" ORDER BY ts DESC))[1] AS last_input
        FROM llm_events
        WHERE ts >= ${since24h} AND "sessionId" IS NOT NULL ${pfSql}
        GROUP BY "sessionId", project, surface
        HAVING COUNT(*) >= 2
        ORDER BY cost DESC
        LIMIT 20
      `;
      const now = Date.now();
      return rows.map(r => {
        const ageMs = now - r.last_ts.getTime();
        const steps = Number(r.steps);
        const bloatRatio = Number(r.first_input) > 0 ? Number(r.last_input) / Number(r.first_input) : 1;
        let type = 'active';
        if (steps > 8 && ageMs > 3 * 60_000) type = 'loop';
        else if (bloatRatio > 1.5) type = 'bloat';
        else if (ageMs > 5 * 60_000) type = 'abandoned';
        else if (Number(r.cost) > 5 && r.surface === 'automation') type = 'runaway';
        return {
          sessionId: r.session_id,
          project: r.project,
          surface: r.surface,
          steps,
          costUsd: Number(r.cost),
          lastTs: r.last_ts.toISOString(),
          ageMs,
          type,
          bloatRatio: Math.round(bloatRatio * 100) / 100,
        };
      }).filter(r => r.type !== 'active');
    }),
});
