import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { SummaryResponse } from "../api";

const COLORS = ["#6366f1","#22d3ee","#f59e0b","#34d399","#f87171","#a78bfa"];

interface Props { data: SummaryResponse; }

export default function Today({ data }: Props) {
  const { today } = data;
  const fmt = (n: number) => n.toLocaleString();
  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;

  return (
    <div className="space-y-8">
      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Cost today", value: fmtUsd(today.cost_usd) },
          { label: "Input tokens", value: fmt(today.input_tokens) },
          { label: "Output tokens", value: fmt(today.output_tokens) },
          { label: "Cache read", value: fmt(today.cache_read_tokens) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 rounded-xl p-4">
            <div className="text-gray-400 text-sm">{label}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
          </div>
        ))}
      </div>

      {/* Cost by model */}
      {today.by_model.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6">
          <h2 className="text-gray-400 text-sm mb-4">Cost by model</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={today.by_model}>
              <XAxis dataKey="model" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
              <Tooltip formatter={(v: number) => fmtUsd(v)} contentStyle={{ background: "#111827", border: "none" }} />
              <Bar dataKey="cost_usd" radius={[4,4,0,0]}>
                {today.by_model.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top tools */}
      {today.top_tools.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6">
          <h2 className="text-gray-400 text-sm mb-4">Top tools by spend</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-500 text-left">
              <th className="pb-2">Tool</th>
              <th className="pb-2 text-right">Calls</th>
              <th className="pb-2 text-right">Cost</th>
            </tr></thead>
            <tbody>
              {today.top_tools.map((t: any) => (
                <tr key={t.tool} className="border-t border-gray-800">
                  <td className="py-2 font-mono text-indigo-400">{t.tool}</td>
                  <td className="py-2 text-right text-gray-400">{t.calls}</td>
                  <td className="py-2 text-right">{fmtUsd(t.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {today.by_model.length === 0 && (
        <div className="text-center text-gray-600 py-16">No events today. Send an ingest event to see data.</div>
      )}
    </div>
  );
}
