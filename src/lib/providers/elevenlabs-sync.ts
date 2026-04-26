// Pulls ElevenLabs history from their API and upserts into llm_events.
// Dedup key: sessionId = ElevenLabs history_item_id.
// Rate: ~$0.00033 / 1000 chars (standard API, conservative estimate).

import { db } from '@/server/db';
import { getPricing } from '@/lib/pricing';

const BASE = 'https://api.elevenlabs.io/v1';

interface HistoryItem {
  history_item_id: string;
  model_id: string | null;
  date_unix: number;
  character_count_change_from: number;
  character_count_change_to: number;
  content_type: string;
  state: string;
  source: string | null;
  dialogue?: Array<{ voice_name?: string | null }>;
}

async function fetchPage(apiKey: string, startAfter?: string): Promise<{ items: HistoryItem[]; hasMore: boolean }> {
  const params = new URLSearchParams({ page_size: '100' });
  if (startAfter) params.set('start_after_history_item_id', startAfter);

  const res = await fetch(`${BASE}/history?${params}`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs API ${res.status}`);
  const data = await res.json() as { history: HistoryItem[]; has_more?: boolean };
  return { items: data.history ?? [], hasMore: data.has_more ?? false };
}

export async function syncElevenLabs(): Promise<{ inserted: number; skipped: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { inserted: 0, skipped: 0 };

  let inserted = 0;
  let skipped = 0;
  let cursor: string | undefined;

  for (;;) {
    const { items, hasMore } = await fetchPage(apiKey, cursor);
    if (items.length === 0) break;

    for (const item of items) {
      const ts = new Date(item.date_unix * 1000);
      const chars = Math.max(0, item.character_count_change_to - item.character_count_change_from);
      const model = item.model_id ?? 'elevenlabs';
      const charRate = getPricing(model).inputPerToken;
      const costUsd = (chars * charRate).toFixed(8);

      // Dedup: skip if we already have this history_item_id
      const existing = await db.llmEvent.findFirst({
        where: { provider: 'elevenlabs', sessionId: item.history_item_id },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      await db.llmEvent.create({
        data: {
          provider:            'elevenlabs',
          model:               model,
          surface:             item.source ?? 'api',
          sessionId:           item.history_item_id,
          inputTokens:         chars,
          outputTokens:        0,
          reasoningTokens:     0,
          cachedTokens:        0,
          cacheCreationTokens: 0,
          costUsd,
          status:              item.state === 'created' ? 'ok' : item.state,
          contentType:         'tts',
          rawPayload:          item as unknown as import('@prisma/client').Prisma.InputJsonValue,
          ts,
        },
      });
      inserted++;
    }

    if (!hasMore) break;
    cursor = items[items.length - 1]!.history_item_id;
  }

  return { inserted, skipped };
}
