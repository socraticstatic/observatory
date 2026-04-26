// src/app/api/proxy/anthropic/[...path]/route.ts
//
// Transparent HTTP proxy to https://api.anthropic.com
// Point ANTHROPIC_BASE_URL=http://localhost:3099/api/proxy/anthropic in any app
// to have all Anthropic SDK calls flow through here and be captured in the DB.

import { NextRequest } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

const ANTHROPIC_UPSTREAM = 'https://api.anthropic.com';

// Headers injected by the observatory client — strip before forwarding
const OBSERVATORY_HEADERS = [
  'x-observatory-project',
  'x-observatory-session',
  'x-observatory-surface',
];

// Rate table (USD per token) — mirrors src/lib/ingest.ts
const INPUT_RATE: Record<string, number> = {
  'claude-opus':   0.000015,
  'claude-sonnet': 0.000003,
  'claude-haiku':  0.0000008,
  default:         0.000003,
};
const OUTPUT_RATE: Record<string, number> = {
  'claude-opus':   0.000075,
  'claude-sonnet': 0.000015,
  'claude-haiku':  0.000004,
  default:         0.000015,
};
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT  = 0.10;

function getRate(model: string, table: Record<string, number>): number {
  for (const key of Object.keys(table)) {
    if (key !== 'default' && model.includes(key)) return table[key]!;
  }
  return table.default!;
}

function calcCost(
  model: string,
  input: number,
  output: number,
  cacheWrite = 0,
  cacheRead  = 0,
): string {
  const ir = getRate(model, INPUT_RATE);
  const or = getRate(model, OUTPUT_RATE);
  return (
    input      * ir +
    cacheWrite * ir * CACHE_WRITE_MULT +
    cacheRead  * ir * CACHE_READ_MULT  +
    output     * or
  ).toFixed(6);
}

interface UsageAccum {
  model:               string;
  inputTokens:         number;
  outputTokens:        number;
  cacheReadTokens:     number;
  cacheCreationTokens: number;
  project?:            string;
  sessionId?:          string;
  surface?:            string;
}

async function logEvent(usage: UsageAccum, startMs: number): Promise<void> {
  const costUsd = calcCost(
    usage.model,
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheCreationTokens,
    usage.cacheReadTokens,
  );
  await db.llmEvent.create({
    data: {
      provider:            'anthropic',
      model:               usage.model,
      surface:             usage.surface,
      sessionId:           usage.sessionId,
      project:             usage.project,
      inputTokens:         usage.inputTokens,
      outputTokens:        usage.outputTokens,
      reasoningTokens:     0,
      cachedTokens:        usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      costUsd,
      latencyMs:           Date.now() - startMs,
      status:              'ok',
      rawPayload:          usage as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  });
}

async function handleRequest(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const startMs = Date.now();

  // Security: only allow localhost
  const host = req.headers.get('host') ?? '';
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { path } = await context.params;
  const upstreamPath = '/' + (path ?? []).join('/');
  const upstreamUrl = ANTHROPIC_UPSTREAM + upstreamPath + (req.nextUrl.search ?? '');

  // Extract observatory metadata from custom headers
  const project   = req.headers.get('x-observatory-project') ?? undefined;
  const sessionId = req.headers.get('x-observatory-session') ?? undefined;
  const surface   = req.headers.get('x-observatory-surface') ?? undefined;

  // Build forwarded headers — strip observatory-specific ones
  const forwardHeaders = new Headers(req.headers);
  for (const h of OBSERVATORY_HEADERS) forwardHeaders.delete(h);
  // Remove host header — let fetch set it to upstream
  forwardHeaders.delete('host');

  // Clone body for potential metadata extraction (non-streaming only)
  let bodyBuffer: ArrayBuffer | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    bodyBuffer = await req.arrayBuffer();
  }

  // Extract metadata from request body if observatory headers absent
  let bodyProject   = project;
  let bodySessionId = sessionId;
  let bodySurface   = surface;
  let parsedBody: Record<string, unknown> | null = null;

  if (bodyBuffer && bodyBuffer.byteLength > 0) {
    try {
      const text = new TextDecoder().decode(bodyBuffer);
      parsedBody = JSON.parse(text) as Record<string, unknown>;
      const meta = parsedBody?.metadata as Record<string, string> | undefined;
      if (!bodyProject   && meta?.project)    bodyProject   = meta.project;
      if (!bodySessionId && meta?.session_id) bodySessionId = meta.session_id;
      if (!bodySurface   && meta?.surface)    bodySurface   = meta.surface;
    } catch {
      // not JSON — that's fine
    }
  }

  const isStreaming =
    parsedBody?.stream === true ||
    req.headers.get('accept') === 'text/event-stream';

  // Make the upstream request
  const upstreamRes = await fetch(upstreamUrl, {
    method:  req.method,
    headers: forwardHeaders,
    body:    bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
    // @ts-expect-error Node fetch supports duplex
    duplex:  'half',
  });

  // Copy response headers to client
  const resHeaders = new Headers(upstreamRes.headers);
  // Strip transfer-encoding that conflicts with streaming
  resHeaders.delete('transfer-encoding');

  if (!isStreaming) {
    // Non-streaming: read full body, extract usage, log, return
    const responseBuffer = await upstreamRes.arrayBuffer();
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let model = '';

    try {
      const text = new TextDecoder().decode(responseBuffer);
      const json = JSON.parse(text) as Record<string, unknown>;
      const usage = json?.usage as Record<string, number> | undefined;
      model               = (json?.model as string) ?? '';
      inputTokens         = usage?.input_tokens ?? 0;
      outputTokens        = usage?.output_tokens ?? 0;
      cacheReadTokens     = usage?.cache_read_input_tokens ?? 0;
      cacheCreationTokens = usage?.cache_creation_input_tokens ?? 0;
    } catch {
      // parse error — log zeros
    }

    // Fire-and-forget DB log
    logEvent({
      model, inputTokens, outputTokens,
      cacheReadTokens, cacheCreationTokens,
      project: bodyProject, sessionId: bodySessionId, surface: bodySurface,
    }, startMs).catch(() => {/* silent */});

    return new Response(responseBuffer, {
      status:  upstreamRes.status,
      headers: resHeaders,
    });
  }

  // Streaming: pipe through while parsing SSE in parallel
  const upstreamBody = upstreamRes.body;
  if (!upstreamBody) {
    return new Response(null, { status: upstreamRes.status, headers: resHeaders });
  }

  const accum: UsageAccum = {
    model:               '',
    inputTokens:         0,
    outputTokens:        0,
    cacheReadTokens:     0,
    cacheCreationTokens: 0,
    project:             bodyProject,
    sessionId:           bodySessionId,
    surface:             bodySurface,
  };

  // We tee the stream: one branch goes to client, other is parsed for usage
  const [clientStream, parseStream] = upstreamBody.tee();

  // Parse usage in background — don't block client stream
  (async () => {
    const decoder = new TextDecoder();
    const reader  = parseStream.getReader();
    let buffer    = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const evt = JSON.parse(raw) as Record<string, unknown>;
            const type = evt.type as string | undefined;

            if (type === 'message_start') {
              const msg   = evt.message as Record<string, unknown> | undefined;
              const usage = msg?.usage as Record<string, number> | undefined;
              accum.model               = (msg?.model as string) ?? accum.model;
              accum.inputTokens         += usage?.input_tokens ?? 0;
              accum.cacheReadTokens     += usage?.cache_read_input_tokens ?? 0;
              accum.cacheCreationTokens += usage?.cache_creation_input_tokens ?? 0;
            } else if (type === 'message_delta') {
              const usage = evt.usage as Record<string, number> | undefined;
              accum.outputTokens += usage?.output_tokens ?? 0;
            }
          } catch {
            // malformed SSE data — skip
          }
        }
      }
    } catch {
      // stream error — still attempt log with what we have
    } finally {
      reader.releaseLock();
      logEvent(accum, startMs).catch(() => {/* silent */});
    }
  })();

  return new Response(clientStream, {
    status:  upstreamRes.status,
    headers: resHeaders,
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(req, context);
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(req, context);
}
