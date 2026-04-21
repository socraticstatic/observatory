import { config } from 'dotenv';
// Load .env.local first (Next.js convention), then fall back to .env
config({ path: '.env.local' });
config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env['DATABASE_URL']!;
const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

const PROVIDERS = ['anthropic', 'google', 'xai', 'local'] as const;
const MODELS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-5-20251014', 'claude-sonnet-4-5-20251014', 'claude-haiku-4-5-20251001'],
  google:    ['gemini-2.5-pro-preview-05-06', 'gemini-2.5-flash'],
  xai:       ['grok-3'],
  local:     ['llama-3.1-70b'],
};
const SURFACES = ['desktop', 'api', 'vscode', 'cli', 'automation', 'mobile'];
const REGIONS  = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'sa-east-1', 'ca-central-1', 'me-south-1', 'af-south-1',
];
const PROJECTS = ['research_agent', 'inbox_triage', 'code_review', 'automation'];
const CONTENT_TYPES = ['code', 'prose', 'tool_output', 'context', 'media'];

function rng(seed: number) {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
}

async function main() {
  console.log('Seeding 30 days of synthetic LLM events...');
  await db.llmEvent.deleteMany();
  await db.annotation.deleteMany();

  const r = rng(42);
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = [];

  for (let d = 29; d >= 0; d--) {
    for (let h = 0; h < 24; h++) {
      const hourWeight = 0.2 + 0.8 * Math.max(0, Math.sin((h - 6) / 24 * Math.PI));
      const count = Math.round(5 + hourWeight * 35 * (0.5 + r() * 0.5));

      for (let e = 0; e < count; e++) {
        const provider = PROVIDERS[Math.floor(r() * PROVIDERS.length)];
        const models = MODELS[provider];
        const model = models[Math.floor(r() * models.length)];
        const surface = SURFACES[Math.floor(r() * SURFACES.length)];
        const project = PROJECTS[Math.floor(r() * PROJECTS.length)];
        const region = REGIONS[Math.floor(r() * REGIONS.length)];
        const contentType = CONTENT_TYPES[Math.floor(r() * CONTENT_TYPES.length)];

        const inputTokens = Math.round(500 + r() * 3500);
        const outputTokens = Math.round(100 + r() * 900);
        const reasoningTokens = model.includes('opus') ? Math.round(r() * 800) : 0;
        const cachedTokens = Math.round(inputTokens * r() * 0.6);
        const costUsd = (inputTokens * 0.000015 + outputTokens * 0.000075 + reasoningTokens * 0.000075).toFixed(6);
        const latencyMs = Math.round(200 + r() * 1800);
        const qualityScore = Math.min(99.99, 70 + r() * 29.99).toFixed(2);
        const ts = new Date(now.getTime() - d * 86400000 - h * 3600000 - Math.round(r() * 3600000));

        events.push({
          ts,
          provider,
          model,
          surface,
          sessionId: `${project}.session_${Math.floor(r() * 10)}`,
          project,
          inputTokens,
          outputTokens,
          reasoningTokens,
          cachedTokens,
          cacheCreationTokens: Math.round(r() * 200),
          costUsd,
          latencyMs,
          region,
          status: r() > 0.98 ? 'error' : 'ok',
          contentType,
          qualityScore,
          rawPayload: { model, usage: { input_tokens: inputTokens, output_tokens: outputTokens }, meta: { surface, latency_ms: latencyMs } },
        });
      }
    }
  }

  for (let i = 0; i < events.length; i += 500) {
    await db.llmEvent.createMany({ data: events.slice(i, i + 500) });
    process.stdout.write(`\r  ${Math.min(i + 500, events.length)}/${events.length}`);
  }
  console.log(`\nInserted ${events.length} events.`);

  await db.annotation.createMany({
    data: [
      { ts: new Date(now.getTime() - 27 * 86400000), type: 'cache',  title: 'Cache rules updated',    detail: '-$8.40/day',       impact: '-8.40', severity: 'good' },
      { ts: new Date(now.getTime() - 22 * 86400000), type: 'model',  title: 'Switched to Sonnet',     detail: '-31% cost',        impact: '-12.20', severity: 'good' },
      { ts: new Date(now.getTime() - 16 * 86400000), type: 'zombie', title: 'Loop detected',          detail: '+$12 wasted',      impact: '12.00', severity: 'bad' },
      { ts: new Date(now.getTime() - 12 * 86400000), type: 'budget', title: 'Budget alert fired',     detail: '80% threshold',    impact: null, severity: 'warn' },
      { ts: new Date(now.getTime() -  8 * 86400000), type: 'edit',   title: 'System prompt refactor', detail: '-18% input',       impact: '-4.10', severity: 'info' },
      { ts: new Date(now.getTime() -  3 * 86400000), type: 'rule',   title: 'Routing rule added',     detail: 'Haiku for short',  impact: '-2.80', severity: 'good' },
    ],
  });

  console.log('Seed complete.');
}

main().catch(console.error).finally(() => db.$disconnect());
