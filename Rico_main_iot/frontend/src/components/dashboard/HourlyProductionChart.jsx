import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Activity,
  Calendar,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { getPlcHourlyProduction } from "../../services/api";

function getInitialProductionDate() {
  const now = new Date();
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const fmt = (num) => Number(num || 0).toLocaleString("en-IN");

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload || {};
  const { total = 0, ok = 0, warm = 0, ng = 0, shift = "", okRate = 0 } = data;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md text-white min-w-[210px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-sky-400">
            {label} - {String((parseInt(label, 10) + 1) % 24).padStart(2, "0")}:00
          </span>
          <span className="block text-[11px] font-semibold text-slate-400">{shift}</span>
        </div>
        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300">
          {fmt(total)} parts
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            OK Produced
          </span>
          <span className="font-bold text-emerald-400">{fmt(ok)}</span>
        </div>

        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
            Warm-Up Cycles
          </span>
          <span className="font-bold text-amber-400">{fmt(warm)}</span>
        </div>

        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
            NG / Rejection
          </span>
          <span className="font-bold text-rose-400">{fmt(ng)}</span>
        </div>

        <div className="mt-2.5 border-t border-slate-800/80 pt-2 flex items-center justify-between font-bold text-[11px]">
          <span className="text-slate-400">Quality Rate</span>
          <span className={`${okRate >= 95 ? "text-emerald-400" : okRate >= 85 ? "text-amber-400" : "text-rose-400"}`}>
            {okRate}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default function HourlyProductionChart({ machines = [] }) {
  const [selectedMachine, setSelectedMachine] = useState("all");
  const [selectedDate, setSelectedDate] = useState(getInitialProductionDate());
  const [chartData, setChartData] = useState({
    summary: { total: 0, ok: 0, warm: 0, ng: 0, okRate: 0, ngRate: 0 },
    hours: [],
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const machineOptions = useMemo(() => {
    const list = Array.isArray(machines) ? machines : [];
    const seen = new Set();
    const unique = [];

    for (const m of list) {
      const key = m.plc_ip || m.ip || m.machine_key || m.key;
      const name = m.machine_name || m.name || m.machine || key;
      if (key && !seen.has(key)) {
        seen.add(key);
        unique.push({ key, name, ip: m.plc_ip || m.ip });
      }
    }
    return unique;
  }, [machines]);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const params = {
        date: selectedDate,
      };
      if (selectedMachine && selectedMachine !== "all") {
        params.ip = selectedMachine;
      }

      const res = await getPlcHourlyProduction(params);
      if (res?.data?.success && res?.data?.data) {
        setChartData(res.data.data);
      } else if (res?.data?.hours) {
        setChartData(res.data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to load hourly production stats:", err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [selectedMachine, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live periodic refresh (every 30 seconds for live production updates)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchData(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const summary = chartData.summary || { total: 0, ok: 0, warm: 0, ng: 0, okRate: 0, ngRate: 0 };
  const hasData = summary.total > 0;

  return (
    <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {/* Top Header & Interactive Controls */}
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0b73bd] to-[#123f75] text-white shadow-md shadow-sky-500/20">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">
                Hourly Production & Quality Trend
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500">
              Hour-by-hour output distribution: OK vs Warm-Up vs NG (Shift A, B & C)
            </p>
          </div>
        </div>

        {/* Filters: Machine Dropdown & Date Picker */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Machine selector */}
          <div className="relative flex items-center">
            <Cpu className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <select
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50/80 pl-8 pr-7 text-xs font-bold text-slate-800 shadow-sm hover:border-slate-300 focus:border-[#0b73bd] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0b73bd] transition-colors"
            >
              <option value="all">🏭 All Machines (Plant Total)</option>
              {machineOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name} {m.ip && m.ip !== m.name ? `(${m.ip})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Production Date Selector */}
          <div className="relative flex items-center">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50/80 pl-8 pr-2.5 text-xs font-bold text-slate-800 shadow-sm hover:border-slate-300 focus:border-[#0b73bd] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0b73bd] transition-colors"
            />
          </div>

          {/* Snap to Today */}
          {selectedDate !== getInitialProductionDate() && (
            <button
              onClick={() => setSelectedDate(getInitialProductionDate())}
              className="h-9 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-xs font-bold text-[#0b73bd] hover:bg-sky-100 transition-colors"
              title="Reset to today's production date"
            >
              Today
            </button>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => fetchData(false)}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-[#0b73bd] active:scale-95 disabled:opacity-50 transition-all"
            title="Refresh chart data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-[#0b73bd]" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Chips Bar */}
      <div className="grid grid-cols-2 gap-2.5 py-4 sm:grid-cols-5">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">Total Output</span>
            <Layers className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-slate-900">{fmt(summary.total)}</p>
          <span className="text-[10px] font-bold text-slate-400">Recorded shots</span>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[11px] font-black uppercase tracking-wider">OK Parts</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-emerald-700">{fmt(summary.ok)}</p>
          <span className="text-[10px] font-bold text-emerald-600">Passed quality</span>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-black uppercase tracking-wider">Warm-Up</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-amber-700">{fmt(summary.warm)}</p>
          <span className="text-[10px] font-bold text-amber-600">Start / setup cycles</span>
        </div>

        <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-[11px] font-black uppercase tracking-wider">NG Defective</span>
            <XCircle className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-rose-700">{fmt(summary.ng)}</p>
          <span className="text-[10px] font-bold text-rose-600">Rejections</span>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
          <div className="flex items-center justify-between text-[#0b73bd]">
            <span className="text-[11px] font-black uppercase tracking-wider">Quality Rate</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[#0b73bd]" />
          </div>
          <p className="mt-1.5 text-2xl font-black text-[#0b73bd]">{summary.okRate}%</p>
          <span className="text-[10px] font-bold text-slate-500">First-time yield</span>
        </div>
      </div>

      {/* Recharts Bar Chart Container */}
      <div className="relative pt-2">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px] rounded-xl">
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-lg">
              <RefreshCw className="h-4 w-4 animate-spin text-[#0b73bd]" />
              <span className="text-xs font-bold text-slate-700">Loading accurate shift data...</span>
            </div>
          </div>
        )}

        {hasData ? (
          <div className="h-[330px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData.hours}
                margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  stroke="#94a3b8"
                  fontSize={11}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ paddingBottom: 12, fontSize: 12, fontWeight: 700 }}
                  formatter={(value) => <span className="text-slate-700 ml-1 mr-3">{value}</span>}
                />
                {/* Stacked bars: OK (emerald), Warm-Up (amber), NG (rose) */}
                <Bar
                  dataKey="ok"
                  name="OK Parts"
                  stackId="hourly"
                  fill="#10b981"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="warm"
                  name="Warm-Up"
                  stackId="hourly"
                  fill="#f59e0b"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="ng"
                  name="NG Rejection"
                  stackId="hourly"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <Activity className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-slate-700">No Cycle Readings Found</p>
            <p className="mt-1 text-xs text-slate-400 max-w-sm">
              No deduplicated PLC cycle data was recorded for the selected machine on {selectedDate}.
              Try selecting another production date or machine filter.
            </p>
          </div>
        )}

        {/* Industrial Shift Timeline Bar at Bottom */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 font-semibold">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-700">Production Shifts:</span>
            <span className="flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-blue-700 border border-blue-100 font-bold">
              Shift A (06:00 - 14:00)
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-700 border border-indigo-100 font-bold">
              Shift B (14:00 - 22:00)
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 border border-slate-200 font-bold">
              Shift C (23:00 - 05:00)
            </span>
          </div>

          {lastUpdated && (
            <span className="text-[10px] text-slate-400">
              Synced: {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
