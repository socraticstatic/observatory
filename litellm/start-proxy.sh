#!/usr/bin/env bash
# Start the LiteLLM proxy with Observatory callback.
# Reads ANTHROPIC_API_KEY from macOS Keychain (helen-kestra service).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

ANTHROPIC_API_KEY="$(security find-generic-password -s "helen-kestra" -a "ANTHROPIC_API_KEY" -w)" \
LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-sk-observatory}" \
LITELLM_CALLBACK_SECRET="${LITELLM_CALLBACK_SECRET:-litellm-webhook-secret}" \
OBSERVATORY_INGEST_URL="${OBSERVATORY_INGEST_URL:-http://localhost:3099/api/ingest}" \
PYTHONPATH="$SCRIPT_DIR" \
exec /Library/Frameworks/Python.framework/Versions/3.13/bin/litellm \
  --config "$SCRIPT_DIR/config.yaml" \
  --port "${LITELLM_PORT:-4000}"
