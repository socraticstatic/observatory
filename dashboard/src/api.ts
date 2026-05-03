export interface SummaryResponse {
  today: {
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    by_model: ModelRow[];
    top_tools: ToolRow[];
  };
  by_model: ModelRow[];
  by_tool: ToolRow[];
  by_project: ProjectRow[];
}

export interface ModelRow {
  model: string;
  provider: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  calls: number;
}

export interface ToolRow {
  tool: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  avg_latency_ms: number;
}

export interface ProjectRow {
  project: string;
  calls: number;
  cost_usd: number;
  avg_latency_ms: number;
}

export async function fetchSummary(range: string): Promise<SummaryResponse> {
  const res = await fetch(`/api/summary?range=${range}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
