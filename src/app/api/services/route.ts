import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '@/server/db';

const execAsync = promisify(exec);

const PROVIDER_META: Record<string, { keychainName: string; label: string; category: 'llm' | 'creative' }> = {
  anthropic:  { keychainName: 'ANTHROPIC_API_KEY',  label: 'Anthropic Claude', category: 'llm' },
  google:     { keychainName: 'GEMINI_API_KEY',      label: 'Google Gemini',   category: 'llm' },
  xai:        { keychainName: 'XAI_API_KEY',         label: 'xAI Grok',        category: 'llm' },
  openai:     { keychainName: 'OPENAI_API_KEY',      label: 'OpenAI',          category: 'llm' },
  mistral:    { keychainName: 'MISTRAL_API_KEY',     label: 'Mistral',         category: 'llm' },
  leonardo:   { keychainName: 'LEONARDO_API_KEY',    label: 'Leonardo.ai',     category: 'creative' },
  heygen:     { keychainName: 'HEYGEN_API_KEY',      label: 'HeyGen',          category: 'creative' },
  elevenlabs: { keychainName: 'ELEVENLABS_API_KEY',  label: 'ElevenLabs',      category: 'creative' },
  stability:  { keychainName: 'STABILITY_API_KEY',   label: 'Stability AI',    category: 'creative' },
};

export async function GET() {
  const rows = await db.registeredService.findMany({ orderBy: { addedAt: 'asc' } });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { provider, key } = await req.json();

  const meta = PROVIDER_META[provider];
  if (!meta || !key) {
    return NextResponse.json({ ok: false, error: 'invalid provider or key' }, { status: 400 });
  }

  try {
    await execAsync(
      `security add-generic-password -U -s "helen-kestra" -a "${meta.keychainName}" -w "${key.replace(/"/g, '\\"')}"`
    );

    if (meta.category === 'llm') {
      const uid = process.getuid?.() ?? 501;
      await execAsync(`launchctl kickstart -k gui/${uid}/com.micahbos.litellm-observatory`).catch(() => {});
    }

    await db.registeredService.upsert({
      where:  { provider },
      create: { provider, label: meta.label, category: meta.category },
      update: { label: meta.label, category: meta.category },
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
