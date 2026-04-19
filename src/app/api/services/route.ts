import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PROVIDER_KEY_MAP: Record<string, string> = {
  google: 'GEMINI_API_KEY',
  xai:    'XAI_API_KEY',
};

export async function POST(req: NextRequest) {
  const { provider, key } = await req.json();

  const keychainName = PROVIDER_KEY_MAP[provider];
  if (!keychainName || !key) {
    return NextResponse.json({ ok: false, error: 'invalid provider or key' }, { status: 400 });
  }

  try {
    // Save to Keychain (helen-kestra service)
    await execAsync(
      `security add-generic-password -U -s "helen-kestra" -a "${keychainName}" -w "${key.replace(/"/g, '\\"')}"`
    );

    // Kick the launchd proxy so it picks up the new key
    const uid = process.getuid?.() ?? 501;
    await execAsync(
      `launchctl kickstart -k gui/${uid}/com.micahbos.litellm-observatory`
    );

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
