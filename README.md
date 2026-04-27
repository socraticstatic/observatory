# Observatory

> **Observatory is the first LLM observability tool designed for the person paying the bill, not just the person writing the code.**

Most observability tools ask "what happened?" — they're trace logs dressed up as dashboards.  
Observatory asks **"was this worth it?"** That's a fundamentally different product.

---

## What it shows

- **Pulse** — live spend, burn rate, budget runway, top findings, project allocation
- **Traces** — every LLM call with cost, latency, model, tokens, project
- **Intel** — deterministic rule engine: 8 rules that flag opus-misrouting, cache decay, tail latency, cost whales, error bursts, and more
- **Sessions** — live session monitor with zombie detection (loop, bloat, runaway, abandoned)
- **Costs** — six-dimension cost breakdown: provider, model, surface, project, content type, region
- **Five-W cards** — What (token lifecycle), Who (model attribution + efficiency), Where (regional map), When (activity heatmap), How (agent trace waterfall)

---

## Install (3 steps)

**Requirements:** Node 20+, PostgreSQL 16+, LiteLLM

### 1. Clone and configure

```bash
git clone https://github.com/socraticstatic/observatory
cd observatory
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL and MONTHLY_BUDGET_USD
```

### 2. Start the database and run migrations

```bash
docker-compose up -d postgres
npx prisma migrate deploy
```

Or with an existing PostgreSQL instance, just set `DATABASE_URL` in `.env.local` and run migrations.

### 3. Start Observatory and LiteLLM

```bash
npm run dev          # Observatory on :3099
litellm --config litellm/config.yaml --port 4000  # in a separate terminal
```

Point your application at `http://localhost:4000` instead of the provider API directly.  
Every LLM call flows through LiteLLM → Observatory → your provider.

---

## LiteLLM config

A working config lives in `litellm/config.yaml`. It sets up the Observatory callback and routes calls to Anthropic, Google, xAI, and local models.

Key line in the callback file (`litellm/observatory_callback.py`):

```python
OBSERVATORY_URL = "http://localhost:3099/api/ingest"
```

Change the port if Observatory runs elsewhere.

---

## Environment

```env
DATABASE_URL=postgresql://observatory:observatory@localhost:5432/observatory
MONTHLY_BUDGET_USD=200          # budget threshold for runway/alert calculations
LITELLM_WEBHOOK_SECRET=litellm-webhook-secret  # must match callback config
LEONARDO_API_KEY=               # optional: enables Leonardo creative sync
HEYGEN_API_KEY=                 # optional: enables HeyGen video sync
ELEVENLABS_API_KEY=             # optional: enables ElevenLabs TTS sync
```

---

## Architecture

```
Your app → LiteLLM proxy (:4000) → Provider API
                ↓ callback
           Observatory (:3099)
                ↓
           PostgreSQL (llm_events table)
```

The `llm_events` table is the single source of truth. Every cost, latency, and token count is queryable without leaving the dashboard.

---

## The single-session test

At any point, Observatory should be able to answer this in one session for a stranger:

> *"I ran X AI calls this week. Here's what they cost, here's what was wasteful, here's what needs attention."*

If the answer requires more than one screen, a legend, or an explanation — the product isn't done yet.

---

## Tech stack

Next.js 15 · tRPC v11 · TanStack Query v5 · Prisma 7 · PostgreSQL 16 · LiteLLM
