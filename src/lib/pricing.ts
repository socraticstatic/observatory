// Canonical pricing engine for all AI services.
// Single source of truth — used by ingest, sync, and recalculation.
// Add new models here when services are onboarded.

export interface ModelPricing {
  inputPerToken:      number; // USD per token
  outputPerToken:     number;
  cacheReadMult:      number; // multiplier on inputPerToken (e.g. 0.10)
  cacheWriteMult:     number; // multiplier on inputPerToken (e.g. 1.25)
  reasoningPerToken?: number; // if different from outputPerToken
}

// Exact model-id → pricing. Keys are substrings matched against model name.
// More specific keys take priority (checked first).
const MODEL_PRICING: Array<{ match: string; pricing: ModelPricing }> = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  // claude-opus-4-7 / claude-opus-4 (latest)
  { match: 'claude-opus-4-7',        pricing: { inputPerToken: 0.000015,   outputPerToken: 0.000075,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-opus-4-6',        pricing: { inputPerToken: 0.000015,   outputPerToken: 0.000075,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-opus-4',          pricing: { inputPerToken: 0.000015,   outputPerToken: 0.000075,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-opus-3-5',        pricing: { inputPerToken: 0.000015,   outputPerToken: 0.000075,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-opus',            pricing: { inputPerToken: 0.000015,   outputPerToken: 0.000075,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  // claude-sonnet
  { match: 'claude-sonnet-4-6',      pricing: { inputPerToken: 0.000003,   outputPerToken: 0.000015,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-sonnet-4',        pricing: { inputPerToken: 0.000003,   outputPerToken: 0.000015,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-sonnet-3-7',      pricing: { inputPerToken: 0.000003,   outputPerToken: 0.000015,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-sonnet-3-5',      pricing: { inputPerToken: 0.000003,   outputPerToken: 0.000015,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-sonnet',          pricing: { inputPerToken: 0.000003,   outputPerToken: 0.000015,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  // claude-haiku
  { match: 'claude-haiku-4-5',       pricing: { inputPerToken: 0.0000008,  outputPerToken: 0.000004,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-haiku-4',         pricing: { inputPerToken: 0.0000008,  outputPerToken: 0.000004,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-haiku-3-5',       pricing: { inputPerToken: 0.0000008,  outputPerToken: 0.000004,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },
  { match: 'claude-haiku',           pricing: { inputPerToken: 0.0000008,  outputPerToken: 0.000004,   cacheReadMult: 0.10, cacheWriteMult: 1.25 } },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  { match: 'gpt-4o-mini',            pricing: { inputPerToken: 0.00000015, outputPerToken: 0.0000006,  cacheReadMult: 0.50, cacheWriteMult: 1.00 } },
  { match: 'gpt-4o',                 pricing: { inputPerToken: 0.0000025,  outputPerToken: 0.00001,    cacheReadMult: 0.50, cacheWriteMult: 1.00 } },
  { match: 'gpt-4-turbo',            pricing: { inputPerToken: 0.00001,    outputPerToken: 0.00003,    cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'gpt-4',                  pricing: { inputPerToken: 0.00003,    outputPerToken: 0.00006,    cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'gpt-3.5-turbo',          pricing: { inputPerToken: 0.0000005,  outputPerToken: 0.0000015,  cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'o3-mini',                pricing: { inputPerToken: 0.0000011,  outputPerToken: 0.0000044,  cacheReadMult: 0.50, cacheWriteMult: 1.00 } },
  { match: 'o3',                     pricing: { inputPerToken: 0.00001,    outputPerToken: 0.00004,    cacheReadMult: 0.50, cacheWriteMult: 1.00 } },
  { match: 'o1-mini',                pricing: { inputPerToken: 0.0000011,  outputPerToken: 0.0000044,  cacheReadMult: 0.50, cacheWriteMult: 1.00 } },
  { match: 'o1',                     pricing: { inputPerToken: 0.000015,   outputPerToken: 0.00006,    cacheReadMult: 0.50, cacheWriteMult: 1.00 } },

  // ── Google Gemini ──────────────────────────────────────────────────────────
  { match: 'gemini-2.5-pro',         pricing: { inputPerToken: 0.00000125, outputPerToken: 0.00001,    cacheReadMult: 0.25, cacheWriteMult: 1.00 } },
  { match: 'gemini-2.5-flash',       pricing: { inputPerToken: 0.00000015, outputPerToken: 0.0000006,  cacheReadMult: 0.25, cacheWriteMult: 1.00 } },
  { match: 'gemini-2.0-flash',       pricing: { inputPerToken: 0.0000001,  outputPerToken: 0.0000004,  cacheReadMult: 0.25, cacheWriteMult: 1.00 } },
  { match: 'gemini-1.5-pro',         pricing: { inputPerToken: 0.00000125, outputPerToken: 0.000005,   cacheReadMult: 0.25, cacheWriteMult: 1.00 } },
  { match: 'gemini-1.5-flash',       pricing: { inputPerToken: 0.000000075,outputPerToken: 0.0000003,  cacheReadMult: 0.25, cacheWriteMult: 1.00 } },
  { match: 'gemini',                 pricing: { inputPerToken: 0.00000125, outputPerToken: 0.000005,   cacheReadMult: 0.25, cacheWriteMult: 1.00 } },

  // ── xAI / Grok ─────────────────────────────────────────────────────────────
  { match: 'grok-3-mini',            pricing: { inputPerToken: 0.0000003,  outputPerToken: 0.0000005,  cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'grok-3',                 pricing: { inputPerToken: 0.000003,   outputPerToken: 0.000015,   cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'grok-2',                 pricing: { inputPerToken: 0.000002,   outputPerToken: 0.00001,    cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'grok',                   pricing: { inputPerToken: 0.000003,   outputPerToken: 0.000015,   cacheReadMult: 1.00, cacheWriteMult: 1.00 } },

  // ── Meta / Llama (via Groq, Together, etc.) ────────────────────────────────
  { match: 'llama-3.1-405b',         pricing: { inputPerToken: 0.000003,   outputPerToken: 0.000003,   cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'llama-3.1-70b',          pricing: { inputPerToken: 0.00000059, outputPerToken: 0.00000079, cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'llama-3.1-8b',           pricing: { inputPerToken: 0.00000005, outputPerToken: 0.00000008, cacheReadMult: 1.00, cacheWriteMult: 1.00 } },
  { match: 'llama',                  pricing: { inputPerToken: 0.00000059, outputPerToken: 0.00000079, cacheReadMult: 1.00, cacheWriteMult: 1.00 } },

  // ── ElevenLabs (characters, not tokens — store chars as inputTokens) ────────
  // Creator plan $0.33/1000 chars; Pro $0.165/1000 chars — using Creator as default
  { match: 'eleven_v3',              pricing: { inputPerToken: 0.00000033, outputPerToken: 0, cacheReadMult: 0, cacheWriteMult: 0 } },
  { match: 'eleven_v2',             pricing: { inputPerToken: 0.00000033, outputPerToken: 0, cacheReadMult: 0, cacheWriteMult: 0 } },
  { match: 'eleven_turbo',          pricing: { inputPerToken: 0.00000033, outputPerToken: 0, cacheReadMult: 0, cacheWriteMult: 0 } },
  { match: 'eleven_multilingual',   pricing: { inputPerToken: 0.00000033, outputPerToken: 0, cacheReadMult: 0, cacheWriteMult: 0 } },
  { match: 'elevenlabs',            pricing: { inputPerToken: 0.00000033, outputPerToken: 0, cacheReadMult: 0, cacheWriteMult: 0 } },

  // ── HeyGen (duration-seconds as inputTokens; ~$4.00/min = $0.0667/sec for Pro) ─
  { match: 'avatar',                pricing: { inputPerToken: 0.0000667,  outputPerToken: 0, cacheReadMult: 0, cacheWriteMult: 0 } },
  { match: 'heygen',                pricing: { inputPerToken: 0.0000667,  outputPerToken: 0, cacheReadMult: 0, cacheWriteMult: 0 } },
];

// Fallback when no model matches
const DEFAULT_PRICING: ModelPricing = {
  inputPerToken: 0.000003, outputPerToken: 0.000015, cacheReadMult: 0.10, cacheWriteMult: 1.25,
};

export function getPricing(model: string | undefined | null): ModelPricing {
  const lower = (model ?? '').toLowerCase();
  for (const entry of MODEL_PRICING) {
    if (lower.includes(entry.match.toLowerCase())) return entry.pricing;
  }
  return DEFAULT_PRICING;
}

export function calcCost(params: {
  model:              string | undefined | null;
  inputTokens:        number;
  outputTokens:       number;
  reasoningTokens?:   number;
  cachedTokens?:      number;
  cacheCreationTokens?: number;
}): string {
  const p = getPricing(params.model);
  const input    = params.inputTokens         ?? 0;
  const output   = params.outputTokens        ?? 0;
  const reasoning= params.reasoningTokens     ?? 0;
  const cacheRead= params.cachedTokens        ?? 0;
  const cacheWrite=params.cacheCreationTokens ?? 0;

  const cost =
    input      * p.inputPerToken +
    output     * p.outputPerToken +
    reasoning  * (p.reasoningPerToken ?? p.outputPerToken) +
    cacheRead  * p.inputPerToken * p.cacheReadMult +
    cacheWrite * p.inputPerToken * p.cacheWriteMult;

  return cost.toFixed(8);
}
