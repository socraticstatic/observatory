import { NextRequest } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider') ?? undefined;
  const limit = 20;

  const encoder = new TextEncoder();
  let lastTs: Date | null = null;
  let lastId: string | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial batch of recent events (oldest first in the response)
      try {
        const initial = await db.llmEvent.findMany({
          where: provider ? { provider } : undefined,
          orderBy: { ts: 'desc' },
          take: limit,
          select: {
            id: true,
            ts: true,
            provider: true,
            model: true,
            inputTokens: true,
            outputTokens: true,
            reasoningTokens: true,
            cachedTokens: true,
            cacheCreationTokens: true,
            costUsd: true,
            latencyMs: true,
            status: true,
            surface: true,
            rawPayload: true,
          },
        });

        for (const event of initial.reverse()) {
          if (closed) return;
          const data = JSON.stringify({
            ...event,
            ts: event.ts.toISOString(),
            costUsd: Number(event.costUsd),
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          if (!lastTs || event.ts > lastTs) {
            lastTs = event.ts;
            lastId = event.id;
          }
        }

        // Poll every 2 seconds for new events
        const poll = async () => {
          if (closed) return;
          try {
            const where = {
              ...(provider ? { provider } : {}),
              ...(lastTs
                ? {
                    OR: [
                      { ts: { gt: lastTs } },
                      // Same millisecond timestamp but different id (rare but possible)
                      { ts: lastTs, id: { not: lastId ?? '' } },
                    ],
                  }
                : {}),
            };

            const newEvents = await db.llmEvent.findMany({
              where,
              orderBy: { ts: 'asc' },
              take: 10,
              select: {
                id: true,
                ts: true,
                provider: true,
                model: true,
                inputTokens: true,
                outputTokens: true,
                reasoningTokens: true,
                cachedTokens: true,
                cacheCreationTokens: true,
                costUsd: true,
                latencyMs: true,
                status: true,
                surface: true,
                rawPayload: true,
              },
            });

            for (const event of newEvents) {
              if (closed) return;
              const data = JSON.stringify({
                ...event,
                ts: event.ts.toISOString(),
                costUsd: Number(event.costUsd),
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              if (!lastTs || event.ts >= lastTs) {
                lastTs = event.ts;
                lastId = event.id;
              }
            }
          } catch {
            // DB error - stop polling silently
            closed = true;
            controller.close();
            return;
          }

          if (!closed) setTimeout(poll, 2000);
        };

        setTimeout(poll, 2000);
      } catch {
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
