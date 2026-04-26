import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const insightsRouter = router({
  whyInsights: publicProcedure
    .query(async ({ ctx }) => {
      const since7d = new Date(Date.now() - 7 * 86_400_000);
      const since1d = new Date(Date.now() - 86_400_000);

      // Cache decay detector
      const [cacheToday, cache7d] = await Promise.all([
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT AVG("cachedTokens"::float / NULLIF("inputTokens" + "cachedTokens", 0)) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since1d}
        `,
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT AVG("cachedTokens"::float / NULLIF("inputTokens" + "cachedTokens", 0)) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since7d} AND ts < ${since1d}
        `,
      ]);

      const todayHit = Number(cacheToday[0]?.hit_ratio ?? 0);
      const weekHit  = Number(cache7d[0]?.hit_ratio ?? 0);
      const cacheDecay = weekHit > 0 && todayHit < weekHit * 0.6;

      // Routing opportunity: opus projects spending > $2 in last 7d (Sonnet likely sufficient)
      const routingRows = await ctx.db.$queryRaw<Array<{ project: string; cost: unknown }>>`
        SELECT project, SUM("costUsd")::float AS cost
        FROM llm_events
        WHERE ts >= ${since7d} AND model LIKE '%opus%'
        GROUP BY project
        HAVING SUM("costUsd") > 2.00
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
          detail: `$${Number(row.cost).toFixed(2)} Opus spend in 7d — Sonnet may suffice`,
          recommendation: `Switch ${row.project} to Sonnet. Est. saving: ~60%.`,
        });
      }
      return insights;
    }),

  sessionAnomalies: publicProcedure
    .query(async ({ ctx }) => {
      const since1h = new Date(Date.now() - 3_600_000);

      const [events, bucketRows] = await Promise.all([
        ctx.db.llmEvent.findMany({
          where: { ts: { gte: since1h } },
          orderBy: { ts: 'desc' },
          take: 100,
          select: {
            id: true, ts: true, model: true, project: true,
            sessionId: true, costUsd: true, inputTokens: true,
            outputTokens: true, cachedTokens: true, status: true,
          },
        }),
        ctx.db.$queryRaw<Array<{ bucket: unknown; total_tokens: unknown }>>`
          SELECT
            FLOOR(EXTRACT(EPOCH FROM (NOW() - ts)) / 60)::int AS bucket,
            SUM("inputTokens" + "outputTokens") AS total_tokens
          FROM llm_events
          WHERE ts >= ${since1h}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
      ]);

      const bucketMap = new Map<number, number>();
      for (const b of bucketRows) {
        bucketMap.set(Number(b.bucket), Number(b.total_tokens));
      }

      const maxTokens = Math.max(1, ...bucketMap.values());

      const mapped = events.map(e => {
        const cost = Number(e.costUsd);
        const isError   = e.status === 'error';
        const isCostHigh = cost > 0.10;
        const isSpike    = e.outputTokens > 8000;
        const isCached   = e.cachedTokens > 0;
        const tag = isError ? 'STATUS.ERROR' : isCostHigh ? 'COST.SPIKE' : isSpike ? 'OUTPUT.SPIKE' : isCached ? 'CACHE.HIT' : 'INFERENCE.OK';
        const lvl: 'ok' | 'warn' | 'bad' = isError ? 'bad' : (isCostHigh || isSpike) ? 'warn' : 'ok';
        const t = new Date(e.ts);
        const ts = t.toTimeString().slice(0, 8);
        const msg = isError
          ? `error · ${e.model ?? 'unknown'}`
          : isCostHigh
            ? `$${cost.toFixed(4)} · ${e.model ?? 'unknown'} · ${e.project ?? 'unknown'}`
            : isSpike
              ? `${e.outputTokens.toLocaleString()} out tokens · ${e.model ?? 'unknown'}`
              : isCached
                ? `${e.cachedTokens.toLocaleString()} cached · ${e.model ?? 'unknown'}`
                : `${(e.inputTokens + e.outputTokens).toLocaleString()} tokens · ${e.model ?? 'unknown'}`;
        return { id: e.id, t: ts, lvl, tag, msg, src: e.project ?? 'unknown', span: e.sessionId ? '#' + e.sessionId.slice(0, 6) : '' };
      });

      const errorCount   = mapped.filter(e => e.lvl === 'bad').length;
      const warnCount    = mapped.filter(e => e.lvl === 'warn').length;
      const riskScore    = Math.min(100, Math.round((errorCount * 10 + warnCount * 3) / Math.max(1, mapped.length) * 100));

      const tokenBuckets = Array.from({ length: 60 }, (_, i) => ({
        sev: Math.min(1, (bucketMap.get(i) ?? 0) / maxTokens),
      }));

      return {
        events: mapped,
        riskScore,
        tokenBuckets,
        counts: {
          errors:  mapped.filter(e => e.tag === 'STATUS.ERROR').length,
          costHigh: mapped.filter(e => e.tag === 'COST.SPIKE').length,
          spikes:  mapped.filter(e => e.tag === 'OUTPUT.SPIKE').length,
          cacheHits: mapped.filter(e => e.tag === 'CACHE.HIT').length,
        },
      };
    }),

  killSession: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.annotation.create({
        data: {
          ts:       new Date(),
          type:     'kill_order',
          title:    input.sessionId,
          detail:   'Killed via Observatory UI',
          severity: 'info',
        },
      });
      return { ok: true };
    }),

  zombieSessions: publicProcedure
    .query(async ({ ctx }) => {
      const since24h = new Date(Date.now() - 24 * 3_600_000);

      const killed = await ctx.db.annotation.findMany({
        where:  { type: 'kill_order' },
        select: { title: true },
      });
      const killedSet = new Set(killed.map(k => k.title));

      const rows = await ctx.db.$queryRaw<Array<{
        session_id: string; project: string; surface: string;
        steps: bigint; cost: unknown; last_ts: Date;
        first_input: bigint; last_input: bigint;
      }>>`
        SELECT
          "sessionId" AS session_id,
          project,
          MODE() WITHIN GROUP (ORDER BY surface) AS surface,
          COUNT(*) AS steps,
          SUM("costUsd")::float AS cost,
          MAX(ts) AS last_ts,
          (ARRAY_AGG("inputTokens" ORDER BY ts ASC))[1] AS first_input,
          (ARRAY_AGG("inputTokens" ORDER BY ts DESC))[1] AS last_input
        FROM llm_events
        WHERE ts >= ${since24h} AND "sessionId" IS NOT NULL
        GROUP BY "sessionId", project
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
      }).filter(r => r.type !== 'active' && !killedSet.has(r.sessionId));
    }),
});
