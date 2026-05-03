import { describe, it, expect, beforeEach, afterAll } from "vitest";

process.env.OBSERVATORY_DB = ":memory:";

import { getDb, insertEvent, _resetDbForTest } from "./db.js";
import { summarize } from "./summary.js";

function seed() {
  insertEvent({ ts: new Date().toISOString(), project: "vault-daemon", tool: "gemini_deep_research", provider: "google", model: "gemini-2.0-flash", input_tokens: 1000, output_tokens: 400, cost_usd: 0.003, latency_ms: 3000, status: "ok" });
  insertEvent({ ts: new Date().toISOString(), project: "vault-daemon", tool: "leonardo_generate", provider: "leonardo", model: "flux-dev", cost_usd: 0.08, latency_ms: 12000, status: "ok" });
}

describe("summarize", () => {
  beforeEach(() => { getDb().exec("DELETE FROM events"); });
  afterAll(() => { _resetDbForTest(); });

  it("returns zero totals for empty DB", () => {
    const s = summarize("today");
    expect(s.today.cost_usd).toBe(0);
    expect(s.by_tool).toHaveLength(0);
  });

  it("aggregates cost across events", () => {
    seed();
    const s = summarize("today");
    expect(s.today.cost_usd).toBeCloseTo(0.083);
    expect(s.by_model).toHaveLength(2);
    expect(s.by_tool).toHaveLength(2);
    expect(s.by_project).toHaveLength(1);
    expect((s.by_project[0] as Record<string, unknown>).project).toBe("vault-daemon");
  });

  it("top_tools is limited to 5", () => {
    for (let i = 0; i < 7; i++) {
      insertEvent({ ts: new Date().toISOString(), project: "test", tool: `tool-${i}`, provider: "google", model: "gemini", cost_usd: i * 0.01, status: "ok" });
    }
    const s = summarize("today");
    expect(s.today.top_tools.length).toBeLessThanOrEqual(5);
  });
});
