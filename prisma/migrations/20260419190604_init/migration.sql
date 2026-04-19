-- CreateTable
CREATE TABLE "llm_events" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "surface" TEXT,
    "sessionId" TEXT,
    "project" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "latencyMs" INTEGER,
    "region" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "contentType" TEXT,
    "qualityScore" DECIMAL(4,2),
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "llm_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotations" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "impact" TEXT,
    "severity" TEXT NOT NULL,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_events_ts_idx" ON "llm_events"("ts" DESC);

-- CreateIndex
CREATE INDEX "llm_events_provider_ts_idx" ON "llm_events"("provider", "ts" DESC);

-- CreateIndex
CREATE INDEX "llm_events_sessionId_ts_idx" ON "llm_events"("sessionId", "ts");

-- CreateIndex
CREATE INDEX "llm_events_project_idx" ON "llm_events"("project");

-- CreateIndex
CREATE INDEX "annotations_ts_idx" ON "annotations"("ts" DESC);
