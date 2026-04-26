// Canonical registry of all AI service providers Observatory can track.
// Single source of truth for billing model, display labels, and sync strategy.
// To onboard a new service: add an entry here — the rest of the stack reads from this.

export type BillingUnit = 'tokens' | 'credits' | 'characters' | 'seconds' | 'frames' | 'requests';
export type SyncStrategy = 'proxy' | 'api_pull' | 'webhook' | 'manual';

export interface ServiceConfig {
  id:              string;
  label:           string;
  category:        'llm' | 'image' | 'audio' | 'video' | 'embedding' | 'other';
  billingUnit:     BillingUnit;
  unitSingular:    string;
  unitPlural:      string;
  syncStrategy:    SyncStrategy;
  color:           string;
}

export const SERVICE_REGISTRY: Record<string, ServiceConfig> = {
  // ── LLM providers (proxy / LiteLLM callback) ──────────────────────────────
  anthropic: {
    id: 'anthropic', label: 'Anthropic', category: 'llm',
    billingUnit: 'tokens', unitSingular: 'token', unitPlural: 'tokens',
    syncStrategy: 'proxy', color: '#6FA8B3',
  },
  openai: {
    id: 'openai', label: 'OpenAI', category: 'llm',
    billingUnit: 'tokens', unitSingular: 'token', unitPlural: 'tokens',
    syncStrategy: 'proxy', color: '#74AA9C',
  },
  google: {
    id: 'google', label: 'Google', category: 'llm',
    billingUnit: 'tokens', unitSingular: 'token', unitPlural: 'tokens',
    syncStrategy: 'proxy', color: '#A8A074',
  },
  xai: {
    id: 'xai', label: 'xAI (Grok)', category: 'llm',
    billingUnit: 'tokens', unitSingular: 'token', unitPlural: 'tokens',
    syncStrategy: 'proxy', color: '#8A8A8A',
  },
  local: {
    id: 'local', label: 'Local (Ollama)', category: 'llm',
    billingUnit: 'tokens', unitSingular: 'token', unitPlural: 'tokens',
    syncStrategy: 'proxy', color: '#7A9B7A',
  },

  // ── Creative services (API pull sync) ─────────────────────────────────────
  elevenlabs: {
    id: 'elevenlabs', label: 'ElevenLabs', category: 'audio',
    billingUnit: 'characters', unitSingular: 'character', unitPlural: 'characters',
    syncStrategy: 'api_pull', color: '#7A8FA8',
  },
  heygen: {
    id: 'heygen', label: 'HeyGen', category: 'video',
    billingUnit: 'seconds', unitSingular: 'second', unitPlural: 'seconds',
    syncStrategy: 'api_pull', color: '#8A7AA8',
  },
  leonardo: {
    id: 'leonardo', label: 'Leonardo.ai', category: 'image',
    billingUnit: 'credits', unitSingular: 'credit', unitPlural: 'credits',
    syncStrategy: 'api_pull', color: '#9B7CA8',
  },
  stability: {
    id: 'stability', label: 'Stability AI', category: 'image',
    billingUnit: 'credits', unitSingular: 'credit', unitPlural: 'credits',
    syncStrategy: 'api_pull', color: '#A87CA8',
  },
  fal: {
    id: 'fal', label: 'fal.ai', category: 'image',
    billingUnit: 'credits', unitSingular: 'credit', unitPlural: 'credits',
    syncStrategy: 'api_pull', color: '#A88C6A',
  },
};

// Helpers ────────────────────────────────────────────────────────────────────

export function getServiceConfig(provider: string): ServiceConfig {
  return SERVICE_REGISTRY[provider.toLowerCase()] ?? {
    id: provider, label: provider, category: 'other',
    billingUnit: 'tokens', unitSingular: 'token', unitPlural: 'tokens',
    syncStrategy: 'manual', color: 'var(--steel)',
  };
}

export function getBillingUnit(provider: string): BillingUnit {
  return getServiceConfig(provider).billingUnit;
}

export function fmtUnits(count: number, provider: string): string {
  const cfg = getServiceConfig(provider);
  const n = count >= 1_000_000
    ? `${(count / 1_000_000).toFixed(1)}M`
    : count >= 1_000
      ? `${(count / 1_000).toFixed(1)}K`
      : count.toLocaleString();
  return `${n} ${count === 1 ? cfg.unitSingular : cfg.unitPlural}`;
}

// API-pull providers — used by the sync route
export const API_PULL_PROVIDERS = Object.values(SERVICE_REGISTRY)
  .filter(s => s.syncStrategy === 'api_pull')
  .map(s => s.id);
