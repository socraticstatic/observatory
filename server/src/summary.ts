import { getDb } from "./db.js";

type Range = "today" | "7d" | "30d";

// rangeFilter returns a hardcoded SQL fragment — no user input reaches this function.
function rangeFilter(range: Range): string {
  if (range === "today") return `date(ts) = date('now')`;
  if (range === "7d")    return `ts >= date('now', '-7 days')`;
  return                        `ts >= date('now', '-30 days')`;
}

export function summarize(range: Range) {
  const db = getDb();
  const w = rangeFilter(range);

  const totals = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0)          AS cost_usd,
           COALESCE(SUM(input_tokens), 0)       AS input_tokens,
           COALESCE(SUM(output_tokens), 0)      AS output_tokens,
           COALESCE(SUM(cache_read_tokens), 0)  AS cache_read_tokens
    FROM events WHERE ${w}
  `).get() as Record<string, number>;

  const byModel = db.prepare(`
    SELECT model, provider,
           COALESCE(SUM(cost_usd), 0)     AS cost_usd,
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens,
           COUNT(*)                        AS calls
    FROM events WHERE ${w}
    GROUP BY model, provider ORDER BY cost_usd DESC
  `).all();

  const byTool = db.prepare(`
    SELECT COALESCE(tool, '(direct)') AS tool,
           COUNT(*)                   AS calls,
           COALESCE(SUM(input_tokens), 0)  AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens,
           COALESCE(SUM(cost_usd), 0)      AS cost_usd,
           COALESCE(AVG(latency_ms), 0)    AS avg_latency_ms
    FROM events WHERE ${w}
    GROUP BY tool ORDER BY cost_usd DESC
  `).all();

  const byProject = db.prepare(`
    SELECT project,
           COUNT(*)                AS calls,
           COALESCE(SUM(cost_usd), 0)   AS cost_usd,
           COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
    FROM events WHERE ${w}
    GROUP BY project ORDER BY cost_usd DESC
  `).all();

  const topTools = db.prepare(`
    SELECT COALESCE(tool, '(direct)') AS tool,
           COALESCE(SUM(cost_usd), 0) AS cost_usd,
           COUNT(*)                   AS calls
    FROM events WHERE ${w}
    GROUP BY tool ORDER BY cost_usd DESC LIMIT 5
  `).all();

  return {
    today: {
      cost_usd: totals.cost_usd,
      input_tokens: totals.input_tokens,
      output_tokens: totals.output_tokens,
      cache_read_tokens: totals.cache_read_tokens,
      by_model: byModel,
      top_tools: topTools,
    },
    by_model: byModel,
    by_tool: byTool,
    by_project: byProject,
  };
}
