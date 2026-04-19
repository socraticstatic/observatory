# LiteLLM Proxy for Observatory

Routes all LLM calls through a local proxy that fires an HTTP callback to Observatory's ingest endpoint after each call.

## Setup

1. Install LiteLLM:
   ```bash
   pip install litellm
   ```

2. Set environment variables:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   export GEMINI_API_KEY=AIza...
   export XAI_API_KEY=xai-...
   export LITELLM_MASTER_KEY=sk-1234   # any string
   export LITELLM_CALLBACK_SECRET=litellm-webhook-secret  # must match .env.local
   ```

3. Start the proxy:
   ```bash
   litellm --config litellm/config.yaml --port 4000
   ```

4. Point your LLM clients at `http://localhost:4000` (OpenAI-compatible endpoint).

## How callbacks work

After each LLM call, LiteLLM POSTs the full vendor response to `http://localhost:3000/api/ingest`.
The `X-LiteLLM-Signature` header carries `LITELLM_CALLBACK_SECRET` for validation.

Observatory's ingest parser handles Anthropic, Google, and xAI response shapes.
