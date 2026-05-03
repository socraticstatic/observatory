import { useState, useEffect, useCallback } from "react";
import { fetchSummary, type SummaryResponse } from "./api";
import { useSSE } from "./hooks/useSSE";
import Today from "./views/Today";
import ByModel from "./views/ByModel";
import ByTool from "./views/ByTool";
import ByProject from "./views/ByProject";

type Tab = "today" | "by_model" | "by_tool" | "by_project";
type Range = "today" | "7d" | "30d";

const TABS: { id: Tab; label: string }[] = [
  { id: "today",      label: "Today" },
  { id: "by_model",   label: "By Model" },
  { id: "by_tool",    label: "By Tool" },
  { id: "by_project", label: "By Project" },
];

export default function App() {
  const [tab, setTab]     = useState<Tab>("today");
  const [range, setRange] = useState<Range>("today");
  const [data, setData]   = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive]   = useState(false);

  const load = useCallback(() => {
    fetchSummary(range).then(setData).catch((e) => setError(String(e)));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  useSSE(() => { setLive(true); setTimeout(() => setLive(false), 800); load(); });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Observatory</h1>
          {live && <span className="text-xs text-green-400 animate-pulse">● live</span>}
        </div>
        <select
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1 text-sm text-gray-300"
          value={range} onChange={(e) => setRange(e.target.value as Range)}
        >
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${
              tab === id ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}>{label}</button>
        ))}
      </div>

      {/* Content */}
      {error && <div className="text-red-400 text-sm">{error}</div>}
      {!data && !error && <div className="text-gray-600 py-16 text-center">Loading...</div>}
      {data && tab === "today"      && <Today      data={data} />}
      {data && tab === "by_model"   && <ByModel    data={data} />}
      {data && tab === "by_tool"    && <ByTool     data={data} />}
      {data && tab === "by_project" && <ByProject  data={data} />}
    </div>
  );
}
