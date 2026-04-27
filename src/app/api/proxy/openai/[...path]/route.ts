// src/app/api/proxy/openai/[...path]/route.ts
//
// Transparent HTTP proxy for OpenAI-compatible APIs.
// Works for OpenAI, xAI/Grok, local Ollama, and any OpenAI-compatible endpoint.
//
// Set OPENAI_BASE_URL=http://localhost:3099/api/proxy/openai in any app to
// route calls through here and capture usage in the DB.
//
// Override upstream per-request with header: x-observatory-upstream: https://...

import { NextRequest } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

const DEFAULT_UPSTREAM = 'https://api.openai.com';

// Observatory headers — strip before forwarding
const OBSERVATORY_HEADERS = [
  'x-observatory-project',
  'x-observatory-session',
  'x-observatory-surface',
  'x-observatory-upstream',
];

// Rate table (USD per token) — mirrors src/lib/ingest.ts
const INPUT_RATE: Record<string, number> = {
  'grok-3':        0.000003,
  'gpt-4o':        0.0000025,
  'gpt-4-turbo':   0.000010,
  'gpt-3.5-turbo': 0.0000005,
  default:         0.000003,
};
const OUTPUT_RATE: Record<string, number> = {
  'grok-3':        0.000015,
  'gpt-4o':        0.000010,
  'gpt-4-turbo':   0.000030,
  'gpt-3.5-turbo': 0.0000015,
  default:         0.000015,
};

function getRate(model: string, table: Record<string, number>): number {
  for (const key of Object.keys(table)) {
    if (key !== 'default' && model.includes(key)) return table[key]!;
  }
  return table.default!;
}

function calcCost(model: string, input: number, output: number): string {
  return (
    input  * getRate(model, INPUT_RATE) +
    output * getRate(model, OUTPUT_RATE)
  ).toFixed(6);
}

function inferProvider(upstream: string, model: string): string {
  if (upstream.includes('api.openai.com')) return 'openai';
  if (upstream.includes('x.ai') || upstream.includes('xai') || model.includes('grok')) return 'xai';
  if (upstream.includes('localhost') || upstream.includes('127.0.0.1')) return 'local';
  return 'openai';
}

interface UsageAccum {
  model:      string;
  input:      number;
  output:     number;
  project?:   string;
  sessionId?: string;
  surface?:   string;
  upstream:   string;
}

async function logEvent(usage: UsageAccum, startMs: number): Promise<void> {
  const costUsd = calcCost(usage.model, usage.input, usage.output);
  const provider = inferProvider(usage.upstream, usage.model);
  await db.llmEvent.create({
    data: {
      provider,
      model:               usage.model,
      surface:             usage.surface,
      sessionId:           usage.sessionId,
      project:             usage.project,
      inputTokens:         usage.input,
      outputTokens:        usage.output,
      reasoningTokens:     0,
      cachedTokens:        0,
      cacheCreationTokens: 0,
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

  // Configurable upstream — default OpenAI, override via header
  const upstreamBase = req.headers.get('x-observatory-upstream') ?? DEFAULT_UPSTREAM;
  const upstreamUrl  = upstreamBase.replace(/\/$/, '') + upstreamPath + (req.nextUrl.search ?? '');

  // Extract observatory metadata
  const project   = req.headers.get('x-observatory-project') ?? undefined;
  const sessionId = req.headers.get('x-observatory-session') ?? undefined;
  const surface   = req.headers.get('x-observatory-surface') ?? undefined;

  // Forward headers, stripping observatory ones
  const forwardHeaders = new Headers(req.headers);
  for (const h of OBSERVATORY_HEADERS) forwardHeaders.delete(h);
  forwardHeaders.delete('host');

  // Buffer body for metadata extraction
  let bodyBuffer: ArrayBuffer | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    bodyBuffer = await req.arrayBuffer();
  }

  let bodyProject   = project;
  let bodySessionId = sessionId;
  let bodySurface   = surface;
  let parsedBody: Record<string, unknown> | null = null;

  if (bodyBuffer && bodyBuffer.byteLength > 0) {
    try {
      const text = new TextDecoder().decode(bodyBuffer);
      parsedBody = JSON.parse(text) as Record<string, unknown>;
      // Some OpenAI-compatible SDKs support metadata in user field or custom fields
      const meta = parsedBody?.metadata as Record<string, string> | undefined;
      if (!bodyProject   && meta?.project)    bodyProject   = meta.project;
      if (!bodySessionId && meta?.session_id) bodySessionId = meta.session_id;
      if (!bodySurface   && meta?.surface)    bodySurface   = meta.surface;
    } catch {
      // not JSON
    }
  }

  const isStreaming = parsedBody?.stream === true;

  const upstreamRes = await fetch(upstreamUrl, {
    method:  req.method,
    headers: forwardHeaders,
    body:    bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
    // @ts-expect-error Node fetch supports duplex
    duplex:  'half',
  });

  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete('transfer-encoding');

  if (!isStreaming) {
    const responseBuffer = await upstreamRes.arrayBuffer();
    let inputTokens  = 0;
    let outputTokens = 0;
    let model        = '';

    try {
      const text = new TextDecoder().decode(responseBuffer);
      const json = JSON.parse(text) as Record<string, unknown>;
      const usage = json?.usage as Record<string, number> | undefined;
      model        = (json?.model as string) ?? '';
      inputTokens  = usage?.prompt_tokens     ?? usage?.input_tokens     ?? 0;
      outputTokens = usage?.completion_tokens ?? usage?.output_tokens    ?? 0;
    } catch {
      // not JSON or unexpected shape
    }

    logEvent({
      model, input: inputTokens, output: outputTokens,
      project: bodyProject, sessionId: bodySessionId, surface: bodySurface,
      upstream: upstreamBase,
    }, startMs).catch(() => {/* silent */});

    return new Response(responseBuffer, {
      status:  upstreamRes.status,
      headers: resHeaders,
    });
  }

  // Streaming: tee the stream
  const upstreamBody = upstreamRes.body;
  if (!upstreamBody) {
    return new Response(null, { status: upstreamRes.status, headers: resHeaders });
  }

  const accum = {
    model:      '',
    input:      0,
    output:     0,
    project:    bodyProject,
    sessionId:  bodySessionId,
    surface:    bodySurface,
    upstream:   upstreamBase,
  };

  const [clientStream, parseStream] = upstreamBody.tee();

  (async () => {
    const decoder = new TextDecoder();
    const reader  = parseStream.getReader();
    let buffer    = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const chunk = JSON.parse(raw) as Record<string, unknown>;

            // Capture model from first chunk that has it
            if (!accum.model && chunk.model) {
              accum.model = chunk.model as string;
            }

            // OpenAI streams usage in the final chunk (when stream_options.include_usage=true)
            const usage = chunk?.usage as Record<string, number> | undefined;
            if (usage) {
              accum.input  += usage.prompt_tokens     ?? usage.input_tokens     ?? 0;
              accum.output += usage.completion_tokens ?? usage.output_tokens    ?? 0;
            }

            // Count output tokens from delta if usage not present
            const choices = chunk?.choices as Array<{ delta?: { content?: string } }> | undefined;
            if (!usage && choices?.length) {
              for (const choice of choices) {
                const content = choice.delta?.content;
                if (content) {
                  // rough approximation when no usage block
                  accum.output += Math.ceil(content.length / 4);
                }
              }
            }
          } catch {
            // malformed SSE chunk — skip
          }
        }
      }
    } catch {
      // stream error
    } finally {
      reader.releaseLock();
      // Only log if we got something meaningful
      if (accum.model || accum.input > 0 || accum.output > 0) {
        logEvent(accum, startMs).catch(() => {/* silent */});
      }
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
