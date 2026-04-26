// Pulls Leonardo.ai generation history and upserts into llm_events.
// Dedup key: sessionId = Leonardo generation ID.
// Billing model: API tokens (credits). 1 credit ≈ $0.00576 (3500 credits = $20.16 standard).
// inputTokens stores the credit count; costUsd is estimated from the rate.
// billingUnit = 'credits' so the UI labels it correctly.

import { db } from '@/server/db';
import { createHash } from 'crypto';

const BASE = 'https://cloud.leonardo.ai/api/rest/v1';

// Estimated USD per credit from Leonardo's standard plan (3500 credits = $20.16)
const USD_PER_CREDIT = 20.16 / 3500;

interface LeonardoGeneration {
  id: string;
  createdAt: string;
  status: string;
  modelId: string | null;
  prompt: string | null;
  imageCount: number;
  inferenceSteps: number | null;
  // Leonardo reports credits consumed per generation
  generationTokenCost?: number | null;
}

interface UserInfo {
  user: { id: string };
}

async function fetchUserId(apiKey: string): Promise<string> {
  const res = await fetch(`${BASE}/me`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Leonardo /me ${res.status}`);
  const data = await res.json() as { user_details: Array<UserInfo> };
  const userId = data.user_details?.[0]?.user?.id;
  if (!userId) throw new Error('Leonardo: could not read user.id from /me');
  return userId;
}

async function fetchPage(
  apiKey: string,
  userId: string,
  offset: number,
): Promise<LeonardoGeneration[]> {
  const res = await fetch(`${BASE}/generations/user/${userId}?offset=${offset}&limit=50`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Leonardo /generations ${res.status}`);
  const data = await res.json() as { generations: LeonardoGeneration[] };
  return data.generations ?? [];
}

export async function syncLeonardo(): Promise<{ inserted: number; skipped: number; error?: string }> {
  const apiKey = process.env.LEONARDO_API_KEY;
  if (!apiKey) return { inserted: 0, skipped: 0 };

  let inserted = 0;
  let skipped = 0;

  try {
    const userId = await fetchUserId(apiKey);

    let offset = 0;
    for (;;) {
      const generations = await fetchPage(apiKey, userId, offset);
      if (generations.length === 0) break;

      for (const gen of generations) {
        const existing = await db.llmEvent.findFirst({
          where: { provider: 'leonardo', sessionId: gen.id },
          select: { id: true },
        });
        if (existing) { skipped++; continue; }

        const ts      = new Date(gen.createdAt);
        const credits = gen.generationTokenCost ?? gen.imageCount ?? 1;
        const model   = gen.modelId ?? 'leonardo';
        const costUsd = (credits * USD_PER_CREDIT).toFixed(8);

        const eventHash = createHash('sha256')
          .update(`leonardo:${gen.id}`)
          .digest('hex');

        await db.llmEvent.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: {
            provider:            'leonardo',
            model,
            surface:             'api',
            sessionId:           gen.id,
            inputTokens:         credits,
            outputTokens:        0,
            reasoningTokens:     0,
            cachedTokens:        0,
            cacheCreationTokens: 0,
            costUsd,
            status:              gen.status === 'COMPLETE' ? 'ok' : gen.status?.toLowerCase() ?? 'ok',
            contentType:         'image',
            billingUnit:         'credits',
            eventHash,
            ts,
            rawPayload:          gen as unknown as import('@prisma/client').Prisma.InputJsonValue,
          } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        inserted++;
      }

      if (generations.length < 50) break;
      offset += 50;
    }
  } catch (e) {
    return { inserted, skipped, error: String(e) };
  }

  return { inserted, skipped };
}
