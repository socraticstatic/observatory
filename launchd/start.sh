#!/bin/bash
set -eu

SECRET=$(security find-generic-password -s "helen-kestra" -a "LITELLM_CALLBACK_SECRET" -w 2>/dev/null || echo "litellm-webhook-secret")
export LITELLM_CALLBACK_SECRET="$SECRET"

exec /usr/local/bin/node /Users/micahbos/Developer/observatory/server/dist/index.js
