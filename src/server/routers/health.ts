import { router, publicProcedure } from '../trpc';

export const healthRouter = router({
  status: publicProcedure.query(async ({ ctx }) => {
    const [lastEvent, count60s, bucketRows, dataRange] = await Promise.all([
      ctx.db.llmEvent.findFirst({ orderBy: { ts: 'desc' }, select: { ts: true } }),
      ctx.db.llmEvent.count({ where: { ts: { gte: new Date(Date.now() - 60_000) } } }),
      ctx.db.$queryRaw<Array<{ bucket: unknown; n: unknown }>>`
        SELECT
          FLOOR(EXTRACT(EPOCH FROM (NOW() - ts)) / 60)::int AS bucket,
          COUNT(*)::int AS n
        FROM llm_events
        WHERE ts >= NOW() - INTERVAL '14 minutes'
        GROUP BY 1
      `,
      ctx.db.$queryRaw<Array<{ oldest: Date | null; newest: Date | null }>>`
        SELECT MIN(ts) AS oldest, MAX(ts) AS newest FROM llm_events
      `,
    ]);

    const lastIngestAt = lastEvent?.ts ?? null;
    const secondsAgo = lastIngestAt
      ? Math.floor((Date.now() - lastIngestAt.getTime()) / 1000)
      : null;
    const status: 'ok' | 'idle' | 'error' =
      !lastIngestAt ? 'error' : secondsAgo! > 300 ? 'idle' : 'ok';
    const range = dataRange[0];

    const bucketMap = new Map<number, number>();
    for (const b of bucketRows) {
      bucketMap.set(Number(b.bucket), Number(b.n));
    }
    // Index 0 = oldest (13 min ago), index 13 = most recent minute
    const liveBuckets = Array.from({ length: 14 }, (_, i) => bucketMap.get(13 - i) ?? 0);

    return {
      lastIngestAt: lastIngestAt?.toISOString() ?? null,
      secondsAgo,
      eventsLast60s: count60s,
      liveBuckets,
      dataRange: {
        oldest: range?.oldest?.toISOString() ?? null,
        newest: range?.newest?.toISOString() ?? null,
      },
      status,
    };
  }),
});
