-- Add event_hash column for idempotent ingestion.
-- Hash is: sha256(model || ':' || ts_second || ':' || inputTokens || ':' || outputTokens || ':' || cachedTokens || ':' || cacheCreationTokens)
ALTER TABLE llm_events ADD COLUMN IF NOT EXISTS event_hash TEXT;

-- Backfill hash for all existing events
UPDATE llm_events
SET event_hash = encode(
  sha256(
    (model || ':' || EXTRACT(EPOCH FROM DATE_TRUNC('second', ts))::bigint::text
           || ':' || "inputTokens"::text
           || ':' || "outputTokens"::text
           || ':' || "cachedTokens"::text
           || ':' || "cacheCreationTokens"::text)::bytea
  ),
  'hex'
)
WHERE event_hash IS NULL;

-- Unique index — prevents duplicate firings from being stored
CREATE UNIQUE INDEX IF NOT EXISTS llm_events_event_hash_idx ON llm_events (event_hash)
WHERE event_hash IS NOT NULL;
