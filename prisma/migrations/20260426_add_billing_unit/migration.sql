-- Add billing_unit to capture the denomination used by each AI service.
-- 'tokens' is the default (backwards compatible with all existing LLM events).
-- Creative services (Leonardo, ElevenLabs, HeyGen, etc.) write their native unit.
ALTER TABLE llm_events ADD COLUMN IF NOT EXISTS billing_unit TEXT NOT NULL DEFAULT 'tokens';

-- Backfill from contentType where we know the right unit
UPDATE llm_events SET billing_unit = 'characters' WHERE provider = 'elevenlabs';
UPDATE llm_events SET billing_unit = 'seconds'    WHERE provider = 'heygen';
UPDATE llm_events SET billing_unit = 'credits'    WHERE provider IN ('leonardo', 'stability', 'fal');
