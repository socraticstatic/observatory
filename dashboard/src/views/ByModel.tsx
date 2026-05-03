import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { SummaryResponse } from "../api";

const COLORS = ["#6366f1","#22d3ee","#f59e0b","#34d399","#f87171","#a78bfa"];

interface Props { data: SummaryResponse; }

export default function ByModel({ data }: Props) {
  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;

  if (!data.by_model.length) {
    return <div className="text-center text-gray-600 py-16">No data for this range.</div>;
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-6">
      <h2 className="text-gray-400 text-sm">Cost by model</h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data.by_model}>
          <XAxis dataKey="model" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
          <Tooltip
            formatter={(v: number, name: string) => [fmtUsd(v), name]}
            contentStyle={{ background: "#111827", border: "none" }}
          />
          <Bar dataKey="cost_usd" name="Cost (USD)" radius={[4,4,0,0]}>
            {data.by_model.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <table className="w-full text-sm">
        <thead><tr className="text-gray-500 text-left">
          <th className="pb-2">Model</th>
          <th className="pb-2 text-right">Calls</th>
          <th className="pb-2 text-right">Input tok</th>
          <th className="pb-2 text-right">Output tok</th>
          <th className="pb-2 text-right">Cost</th>
        </tr></thead>
        <tbody>
          {data.by_model.map((m) => (
            <tr key={`${m.model}-${m.provider}`} className="border-t border-gray-800">
              <td className="py-2 font-mono text-indigo-400">{m.model}</td>
              <td className="py-2 text-right text-gray-400">{m.calls}</td>
              <td className="py-2 text-right text-gray-400">{m.input_tokens.toLocaleString()}</td>
              <td className="py-2 text-right text-gray-400">{m.output_tokens.toLocaleString()}</td>
              <td className="py-2 text-right">{fmtUsd(m.cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
