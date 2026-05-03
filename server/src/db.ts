import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

const DB_PATH = process.env.OBSERVATORY_DB ?? join(homedir(), ".observatory", "events.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (DB_PATH !== ":memory:") mkdirSync(join(homedir(), ".observatory"), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      ts                TEXT NOT NULL,
      project           TEXT NOT NULL,
      tool              TEXT,
      provider          TEXT NOT NULL,
      model             TEXT NOT NULL,
      input_tokens      INTEGER,
      output_tokens     INTEGER,
      cache_read_tokens INTEGER,
      cost_usd          REAL,
      latency_ms        INTEGER,
      status            TEXT NOT NULL DEFAULT 'ok'
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_project  ON events(project);
    CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider);
    CREATE INDEX IF NOT EXISTS idx_events_model    ON events(model);
  `);
  return _db;
}

export interface Event {
  ts: string;
  project: string;
  tool?: string;
  provider: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
  status: "ok" | "error";
}

export function insertEvent(event: Event): void {
  const row = {
    ts: event.ts,
    project: event.project,
    tool: event.tool ?? null,
    provider: event.provider,
    model: event.model,
    input_tokens: event.input_tokens ?? null,
    output_tokens: event.output_tokens ?? null,
    cache_read_tokens: event.cache_read_tokens ?? null,
    cost_usd: event.cost_usd ?? null,
    latency_ms: event.latency_ms ?? null,
    status: event.status,
  };
  getDb().prepare(`
    INSERT INTO events
      (ts, project, tool, provider, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, latency_ms, status)
    VALUES
      (@ts, @project, @tool, @provider, @model, @input_tokens, @output_tokens, @cache_read_tokens, @cost_usd, @latency_ms, @status)
  `).run(row);
}
