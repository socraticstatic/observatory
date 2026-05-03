import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

// Use in-memory DB for tests — override DB_PATH via env
process.env.OBSERVATORY_DB = ":memory:";

import { insertEvent, getDb } from "./db.js";

describe("db", () => {
  beforeEach(() => {
    // Reset singleton for each test
    const db = getDb();
    db.exec("DELETE FROM events");
  });

  it("inserts an event and retrieves it", () => {
    insertEvent({
      ts: "2026-05-03T12:00:00Z",
      project: "vault-daemon",
      tool: "gemini_deep_research",
      provider: "google",
      model: "gemini-2.0-flash",
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.002,
      latency_ms: 4200,
      status: "ok",
    });
    const row = getDb().prepare("SELECT * FROM events WHERE project = ?").get("vault-daemon") as any;
    expect(row.project).toBe("vault-daemon");
    expect(row.input_tokens).toBe(1000);
    expect(row.cost_usd).toBeCloseTo(0.002);
  });

  it("inserts event with minimal required fields", () => {
    insertEvent({ ts: "2026-05-03T12:00:00Z", project: "test", provider: "anthropic", model: "claude-3", status: "ok" });
    const count = (getDb().prepare("SELECT COUNT(*) as n FROM events").get() as any).n;
    expect(count).toBe(1);
  });
});
