// Pulls HeyGen video history and upserts into llm_events.
// Dedup key: sessionId = HeyGen video_id.
// Cost: HeyGen doesn't expose billing via API — stores duration_seconds as
// inputTokens and costUsd=0 so data is honest, not estimated.

import { db } from '@/server/db';

const LIST_URL  = 'https://api.heygen.com/v1/video.list';
const DETAIL_URL = 'https://api.heygen.com/v1/video_status.get';

interface VideoListItem {
  video_id: string;
  status:   string;
  created_at: number;
  type:     string;
}

interface VideoDetail {
  id:         string;
  status:     string;
  created_at: number;
  duration?:  number;
  error?:     string | null;
}

async function listAll(apiKey: string): Promise<VideoListItem[]> {
  const all: VideoListItem[] = [];
  let token: string | undefined;

  for (;;) {
    const params = new URLSearchParams({ limit: '100' });
    if (token) params.set('token', token);
    const res = await fetch(`${LIST_URL}?${params}`, { headers: { 'X-Api-Key': apiKey } });
    if (!res.ok) throw new Error(`HeyGen list API ${res.status}`);
    const body = await res.json() as { code: number; data?: { videos?: VideoListItem[]; token?: string } };
    const videos = body.data?.videos ?? [];
    all.push(...videos);
    token = body.data?.token;
    if (!token || videos.length === 0) break;
  }

  return all;
}

async function fetchDetail(apiKey: string, videoId: string): Promise<VideoDetail | null> {
  const res = await fetch(`${DETAIL_URL}?video_id=${videoId}`, { headers: { 'X-Api-Key': apiKey } });
  if (!res.ok) return null;
  const body = await res.json() as { code: number; data?: VideoDetail };
  return body.data ?? null;
}

export async function syncHeyGen(): Promise<{ inserted: number; skipped: number }> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return { inserted: 0, skipped: 0 };

  let inserted = 0;
  let skipped  = 0;

  const videos = await listAll(apiKey);

  for (const v of videos) {
    if (v.status !== 'completed' && v.status !== 'failed') { skipped++; continue; }

    const existing = await db.llmEvent.findFirst({
      where: { provider: 'heygen', sessionId: v.video_id },
      select: { id: true },
    });
    if (existing) { skipped++; continue; }

    const detail = await fetchDetail(apiKey, v.video_id);
    const durationSec = Math.round(detail?.duration ?? 0);
    const ts = new Date((detail?.created_at ?? v.created_at) * 1000);

    await db.llmEvent.create({
      data: {
        provider:            'heygen',
        model:               'avatar',
        surface:             'video_production',
        sessionId:           v.video_id,
        inputTokens:         durationSec,
        outputTokens:        0,
        reasoningTokens:     0,
        cachedTokens:        0,
        cacheCreationTokens: 0,
        costUsd:             '0.000000',
        status:              v.status === 'completed' ? 'ok' : 'error',
        contentType:         'video',
        rawPayload:          (detail ?? v) as unknown as import('@prisma/client').Prisma.InputJsonValue,
        ts,
      },
    });
    inserted++;
  }

  return { inserted, skipped };
}
