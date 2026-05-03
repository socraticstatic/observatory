import type { SummaryResponse, ToolRow } from "../api";
import { useState } from "react";

type SortKey = keyof Pick<ToolRow, "calls" | "cost_usd" | "avg_latency_ms">;

interface Props { data: SummaryResponse; }

export default function ByTool({ data }: Props) {
  const [sort, setSort] = useState<SortKey>("cost_usd");
  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
  const fmtMs = (n: number) => `${Math.round(n)}ms`;

  const rows = [...data.by_tool].sort((a, b) => b[sort] - a[sort]);

  if (!rows.length) return <div className="text-center text-gray-600 py-16">No data for this range.</div>;

  const th = (label: string, key: SortKey) => (
    <th className={`pb-2 text-right cursor-pointer select-none ${sort === key ? "text-indigo-400" : "text-gray-500"}`}
        onClick={() => setSort(key)}>{label} {sort === key ? "↓" : ""}</th>
  );

  return (
    <div className="bg-gray-900 rounded-xl p-6">
      <h2 className="text-gray-400 text-sm mb-4">By tool — click column to sort</h2>
      <table className="w-full text-sm">
        <thead><tr className="text-left">
          <th className="pb-2 text-gray-500">Tool</th>
          {th("Calls", "calls")}
          <th className="pb-2 text-right text-gray-500">Input tok</th>
          <th className="pb-2 text-right text-gray-500">Output tok</th>
          {th("Cost", "cost_usd")}
          {th("Avg latency", "avg_latency_ms")}
        </tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.tool} className="border-t border-gray-800">
              <td className="py-2 font-mono text-indigo-400">{t.tool}</td>
              <td className="py-2 text-right text-gray-400">{t.calls}</td>
              <td className="py-2 text-right text-gray-400">{t.input_tokens.toLocaleString()}</td>
              <td className="py-2 text-right text-gray-400">{t.output_tokens.toLocaleString()}</td>
              <td className="py-2 text-right">{fmtUsd(t.cost_usd)}</td>
              <td className="py-2 text-right text-gray-400">{fmtMs(t.avg_latency_ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
