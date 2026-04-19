import { router, publicProcedure } from '../trpc';

export const insightsRouter = router({
  whyInsights: publicProcedure
    .query(async ({ ctx }) => {
      const since7d = new Date(Date.now() - 7 * 86_400_000);
      const since1d = new Date(Date.now() - 86_400_000);

      // Cache decay detector
      const [cacheToday, cache7d] = await Promise.all([
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT AVG(cached_tokens::float / NULLIF(input_tokens + cached_tokens, 0)) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since1d}
        `,
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT AVG(cached_tokens::float / NULLIF(input_tokens + cached_tokens, 0)) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since7d} AND ts < ${since1d}
        `,
      ]);

      const todayHit = Number(cacheToday[0]?.hit_ratio ?? 0);
      const weekHit  = Number(cache7d[0]?.hit_ratio ?? 0);
      const cacheDecay = weekHit > 0 && todayHit < weekHit * 0.6;

      // Routing opportunity: opus sessions with avg quality < 92
      const routingRows = await ctx.db.$queryRaw<Array<{ project: string; avg_quality: unknown; cost: unknown }>>`
        SELECT project, AVG(quality_score)::float AS avg_quality, SUM(cost_usd)::float AS cost
        FROM llm_events
        WHERE ts >= ${since7d} AND model LIKE '%opus%'
        GROUP BY project
        HAVING AVG(quality_score) < 92
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
    .query(async ({ ctx }) => {
      const since24h = new Date(Date.now() - 24 * 3_600_000);
      const rows = await ctx.db.$queryRaw<Array<{
        session_id: string; project: string; surface: string;
        steps: bigint; cost: unknown; last_ts: Date;
        first_input: bigint; last_input: bigint;
      }>>`
        SELECT
          session_id,
          project,
          surface,
          COUNT(*) AS steps,
          SUM(cost_usd)::float AS cost,
          MAX(ts) AS last_ts,
          (ARRAY_AGG(input_tokens ORDER BY ts ASC))[1] AS first_input,
          (ARRAY_AGG(input_tokens ORDER BY ts DESC))[1] AS last_input
        FROM llm_events
        WHERE ts >= ${since24h} AND session_id IS NOT NULL
        GROUP BY session_id, project, surface
        HAVING COUNT(*) > 5
        ORDER BY cost DESC
        LIMIT 20
      `;
      const now = Date.now();
      return rows.map(r => {
        const ageMs = now - r.last_ts.getTime();
        const steps = Number(r.steps);
        const bloatRatio = Number(r.first_input) > 0 ? Number(r.last_input) / Number(r.first_input) : 1;
        let type = 'active';
        if (steps > 12 && ageMs > 5 * 60_000) type = 'loop';
        else if (bloatRatio > 1.8) type = 'bloat';
        else if (ageMs > 30 * 60_000) type = 'abandoned';
        else if (Number(r.cost) > 10 && r.surface === 'automation') type = 'runaway';
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
