import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  assignMachineOperation,
  getMachineOperations,
  getMachineStatusHistory,
} from "../../../../services/api";

export const safe = (v, fb = "—") => String(v || "").trim() || fb;

export function getDivision(name = "") {
  const n = name.toUpperCase();
  if (n.includes("H.P.D.C") || n.includes("HPDC") || n.includes("TILTING") ||
      n.includes("FURNACE") || n.includes("DOSING") || n.includes("DEGASSING") ||
      n.includes("TRIMMING PRESS") || n.includes("VIBRO") || n.includes("COOLING TOWER") ||
      n.includes("E.O.T") || n.includes("ROBO")) return "HPDC";
  return "Machining";
}

export function getLine(name = "") {
  const n = name.toUpperCase();
  if (n.includes("FURNACE") || n.includes("TILTING") || n.includes("DOSING")) return "Furnace";
  if (n.includes("TRIMMING") || n.includes("VIBRO")) return "Trimming & Vibro";
  if (n.includes("1800T")) return "HPDC Line C06 (1400T–1800T)";
  if (n.includes("1400T")) return "HPDC Line C06 (1400T–1800T)";
  if (n.includes("1050T")) return "HPDC Line C05 (1050T)";
  if (n.includes("800T"))  return "HPDC Line C04 (800T)";
  if (n.includes("660T") || n.includes("560T") || n.includes("500T")) return "HPDC Line C03 (500T–660T)";
  if (n.includes("420T") || n.includes("350T")) return "HPDC Line C02 (350T–420T)";
  if (n.includes("250T") || n.includes("150T") || n.includes("135T")) return "HPDC Line C01 (135T–250T)";
  if (n.includes("BROACH")) return "Machining Line M01";
  if (n.includes("PAINT") || n.includes("ADHESIVE") || n.includes("COATING") || n.includes("BAKING")) return "Paint Shop";
  if (n.includes("DEGASSING")) return "Machining Line M20";
  return "All Lines";
}

export function getMachineType(name = "") {
  const n = name.toUpperCase();
  if (n.includes("H.P.D.C") || n.includes("HPDC")) return "High Pressure Die Casting";
  if (n.includes("CNC") || n.includes("VMC"))       return "CNC Machining";
  if (n.includes("BROACH"))     return "Broaching Machine";
  if (n.includes("BORING"))     return "Boring Machine";
  if (n.includes("GRIND"))      return "Grinding Machine";
  if (n.includes("FURNACE") || n.includes("TILTING")) return "Furnace";
  if (n.includes("CRANE") || n.includes("E.O.T"))     return "Crane / EOT";
  if (n.includes("TRIMM"))      return "Trimming Press";
  if (n.includes("VIBRO"))      return "Vibro Machine";
  if (n.includes("COOLING"))    return "Cooling Tower";
  if (n.includes("PAINT") || n.includes("COATING") || n.includes("BAKING") || n.includes("ADHESIVE")) return "Paint Shop Equipment";
  return "Special Purpose Machine";
}

export function getShop(name = "") {
  const n = name.toUpperCase();
  if (n.includes("FURNACE") || n.includes("H.P.D.C") || n.includes("HPDC") ||
      n.includes("TILTING") || n.includes("DOSING") || n.includes("TRIMM") ||
      n.includes("VIBRO") || n.includes("DEGASSING")) return "Casting Shop";
  if (n.includes("PAINT") || n.includes("COATING") || n.includes("BAKING") || n.includes("ADHESIVE")) return "Paint Shop";
  return "Machining Shop";
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
export const EditModal = ({ field, value, onSave, onClose }) => {
  const [val, setVal] = useState(value === "—" ? "" : value);

  const handleSave = () => {
    onSave(field, val.trim() || "—");
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ border: "1.5px solid #e5e7eb" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <span className="font-bold text-gray-800 text-sm">Edit {field}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {field}
          </label>
          <input
            autoFocus
            type={field === "Warranty Expiry" || field === "Registered On" ? "date" : "text"}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Enter ${field.toLowerCase()}...`}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 transition-all"
          />
          <p className="text-xs text-gray-400 mt-2">Press Enter to save or Escape to cancel</p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Live State Graph — proper chart with Y-axis, X-axis timestamps ────────────
export const OldLiveStateGraph = ({ status }) => {
  const TOTAL_BARS = 120;
  const CHART_H    = 120; // px height of chart area

  const bars = useMemo(() => {
    const now = Date.now();
    // simulate realistic machine state: mostly ON with occasional short gaps
    let state = 1;
    return Array.from({ length: TOTAL_BARS }, (_, i) => {
      // random state flips — more gaps when idle
      const flipChance = status === "RUNNING" ? 0.05 : 0.18;
      if (Math.random() < flipChance) state = state === 1 ? 0 : 1;
      return {
        time: new Date(now - (TOTAL_BARS - 1 - i) * 30000), // 30s intervals
        val: state,
      };
    });
  }, [status]);

  const fmt      = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtDate  = (d) => d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

  // Pick 6 evenly-spaced tick indices for X-axis
  const xTicks = [0, 24, 48, 72, 96, TOTAL_BARS - 1];

  return (
    <div className="mt-4">
      {/* Header */}
      <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block"/>
        Live Machine State Graph
      </h3>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Chart area */}
        <div className="flex" style={{ padding: "16px 16px 0 16px" }}>

          {/* Y-axis labels */}
          <div
            className="flex flex-col justify-between text-right pr-3 flex-shrink-0 select-none"
            style={{ height: CHART_H, width: 28 }}
          >
            <span className="text-[11px] text-gray-500 font-medium leading-none">1</span>
            <span className="text-[11px] text-gray-500 font-medium leading-none">0.5</span>
            <span className="text-[11px] text-gray-500 font-medium leading-none">0</span>
          </div>

          {/* Bars + grid */}
          <div className="relative flex-1" style={{ height: CHART_H }}>
            {/* Horizontal grid lines at 0, 0.5, 1 */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              <div className="border-t border-gray-200 w-full"/>
              <div className="border-t border-dashed border-gray-100 w-full"/>
              <div className="border-t border-gray-200 w-full"/>
            </div>

            {/* Bars */}
            <div className="absolute inset-0 flex items-end gap-[1px]">
              {bars.map((b, i) => (
                <div
                  key={i}
                  title={`${fmt(b.time)} — ${b.val ? "Running" : "Stopped"}`}
                  className="flex-1 transition-all duration-100"
                  style={{
                    height: b.val ? "100%" : "0%",
                    backgroundColor: b.val ? "#3b82f6" : "transparent",
                    minWidth: 1,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* X-axis */}
        <div
          className="flex text-[10px] text-gray-400 select-none"
          style={{ paddingLeft: 44, paddingRight: 16, paddingTop: 6, paddingBottom: 4 }}
        >
          {xTicks.map((idx, ti) => {
            const d = bars[idx]?.time;
            if (!d) return null;
            const isFirst = ti === 0;
            const isLast  = ti === xTicks.length - 1;
            return (
              <div
                key={idx}
                className="flex-1 flex flex-col"
                style={{
                  alignItems: isFirst ? "flex-start" : isLast ? "flex-end" : "center",
                  textAlign:  isFirst ? "left"        : isLast ? "right"   : "center",
                }}
              >
                <span className="font-medium text-gray-500">{fmt(d)}</span>
                {(isFirst || isLast) && (
                  <span className="text-gray-300 text-[9px]">{fmtDate(d)}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* X-axis label */}
        <div className="text-center text-[11px] text-gray-400 pb-3 tracking-wide font-medium">
          Time Stamp
        </div>

        {/* Legend strip */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-3 rounded-sm bg-blue-500"/>
            <span className="text-[11px] text-gray-500 font-medium">Running</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-3 rounded-sm bg-gray-100 border border-gray-200"/>
            <span className="text-[11px] text-gray-500 font-medium">Stopped / Idle</span>
          </div>
          <div className="ml-auto text-[10px] text-gray-400">
            Last {Math.round(TOTAL_BARS * 30 / 60)} min · 30s intervals
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Tabs ──────────────────────────────────────────────────────────────────────
export const LiveStateGraph = ({ history = [] }) => {
  const TOTAL_POINTS = 150;
  const width = 980;
  const height = 260;
  const leftPad = 54;
  const rightPad = 18;
  const topPad = 28;
  const bottomPad = 42;
  const chartW = width - leftPad - rightPad;
  const chartH = height - topPad - bottomPad;
  const [hoverPoint, setHoverPoint] = useState(null);

  const points = useMemo(() => {
    const rows = Array.isArray(history) ? history : [];
    return rows.slice(-TOTAL_POINTS).map((row) => {
      const running = String(row.status || "").toUpperCase() === "RUNNING" ? 1 : 0;
      return {
        time: new Date(row.updated_at || row.created_at),
        running,
        idle: running ? 0 : 1,
        status: row.status || "IDLE",
        partCode: row.part_code || "",
        operationNo: row.operation_no || "",
      };
    });
  }, [history]);

  const fmt = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d) => d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  const fmtLong = (d) => d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const xTicks = points.length
    ? [0, Math.floor(points.length * 0.25), Math.floor(points.length * 0.5), Math.floor(points.length * 0.75), points.length - 1]
    : [];
  const linePath = (key, svgHeight = height, lPad = leftPad, rPad = rightPad, tPad = topPad, bPad = bottomPad) => {
    const usableW = width - lPad - rPad;
    const usableH = svgHeight - tPad - bPad;
    return points.map((point, index) => {
      const x = lPad + (points.length > 1 ? (index / (points.length - 1)) * usableW : usableW / 2);
      const y = tPad + usableH - point[key] * usableH;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  };

  const handleMove = (event) => {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xInSvg = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (xInSvg - leftPad) / chartW));
    const index = Math.round(ratio * (points.length - 1));
    const point = points[index];
    const x = leftPad + (points.length > 1 ? (index / (points.length - 1)) * chartW : chartW / 2);
    const y = topPad + chartH - point.running * chartH;
    setHoverPoint({ ...point, x, y });
  };

  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block"/>
        Live Machine State Graph
      </h3>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden p-4">
        <div className="flex items-center justify-end gap-4 text-[11px] font-semibold text-gray-600 mb-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-blue-500 rounded-full" />
            Running
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-indigo-500 rounded-full" />
            Stopped / Idle
          </span>
        </div>

        <div
          className="relative overflow-x-auto"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverPoint(null)}
        >
          {!points.length && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
              <svg className="w-10 h-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-gray-400">No machine status records found</p>
              <p className="text-xs text-gray-300 mt-1">Data will appear after rows are inserted in machine_status</p>
            </div>
          )}
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] w-full h-[280px]" role="img" aria-label="Live machine state chart">
            {[0, 0.5, 1].map(value => {
              const y = topPad + chartH - value * chartH;
              return (
                <g key={value}>
                  <line x1={leftPad} y1={y} x2={width - rightPad} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                  <text x="24" y={y + 4} fill="#64748b" fontSize="11" fontWeight="600">{value}</text>
                </g>
              );
            })}

            {!!points.length && (
              <>
                <path d={linePath("running")} fill="none" stroke="#3b82f6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d={linePath("idle")} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
              </>
            )}

            {xTicks.map((idx, ti) => {
              const point = points[idx];
              const x = leftPad + (idx / (points.length - 1)) * chartW;
              const isFirst = ti === 0;
              const isLast = ti === xTicks.length - 1;
              return (
                <g key={idx}>
                  <line x1={x} y1={height - bottomPad} x2={x} y2={height - bottomPad + 5} stroke="#cbd5e1" />
                  <text x={x} y={height - 22} textAnchor={isFirst ? "start" : isLast ? "end" : "middle"} fill="#4b5563" fontSize="11">{fmt(point.time)}</text>
                  {(isFirst || isLast) && (
                    <text x={x} y={height - 8} textAnchor={isFirst ? "start" : "end"} fill="#cbd5e1" fontSize="10">{fmtDate(point.time)}</text>
                  )}
                </g>
              );
            })}

            {hoverPoint && (
              <g>
                <line x1={hoverPoint.x} y1={topPad} x2={hoverPoint.x} y2={height - bottomPad} stroke="#94a3b8" strokeDasharray="4 4" />
                <circle cx={hoverPoint.x} cy={hoverPoint.y} r="5" fill="#60a5fa" stroke="#fff" strokeWidth="2" />
                <circle cx={hoverPoint.x} cy={topPad + chartH - hoverPoint.idle * chartH} r="4" fill="#4f46e5" stroke="#fff" strokeWidth="2" />
              </g>
            )}
          </svg>

          {hoverPoint && (
            <div
              className="pointer-events-none absolute z-10 min-w-[190px] rounded-md border border-gray-300 bg-white/95 px-3 py-2 text-[11px] text-gray-600 shadow-lg"
              style={{
                left: `min(calc(${(hoverPoint.x / width) * 100}% + 10px), calc(100% - 205px))`,
                top: Math.max(12, hoverPoint.y - 18),
              }}
            >
              <p className="font-bold text-gray-800">Live Machine State Graph</p>
              <p>{fmtLong(hoverPoint.time)}</p>
              <p>Time: {fmt(hoverPoint.time)}</p>
              <p>Status: <span className={hoverPoint.running ? "text-green-600" : "text-orange-600"}>{hoverPoint.status}</span></p>
              {hoverPoint.partCode && <p>Part: {hoverPoint.partCode}</p>}
              {hoverPoint.operationNo && <p>Operation: {hoverPoint.operationNo}</p>}
              <p>Running: {hoverPoint.running}</p>
              <p>Idle: {hoverPoint.idle}</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span>Zoom</span>
            {["15m", "30m", "45m", "1h", "All"].map((range, index) => (
              <button
                key={range}
                className={`px-2.5 py-1 rounded text-[11px] font-bold ${index === 4 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}
              >
                {range}
              </button>
            ))}
          </div>
          <div className="sm:ml-auto text-[11px] text-gray-400">
            {points.length ? `${points.length} DB records` : "0 DB records"}
          </div>
        </div>

        <div className="mt-3 rounded-md border border-slate-200 bg-slate-100 h-11 relative overflow-hidden">
          <div className="absolute inset-x-8 top-2 bottom-2 bg-white/50 border border-slate-200" />
          <svg viewBox="0 0 980 44" className="absolute inset-0 w-full h-full">
            {!!points.length && (
              <path
                d={linePath("running", 44, 36, 36, 8, 8)}
                fill="none"
                stroke="#60a5fa"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          <div className="absolute left-8 top-0 bottom-0 w-1 bg-slate-300" />
          <div className="absolute right-8 top-0 bottom-0 w-1 bg-slate-300" />
        </div>
      </div>
    </div>
  );
};

export const TABS = [
  { id: "live",   label: "Live Status",   icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { id: "operation", label: "Operation Setup", icon: "M9 5H7a2 2 0 00-2 2v12h14V7a2 2 0 00-2-2h-2m-6 0a3 3 0 016 0m-6 0h6m-7 7h8m-8 4h5" },
  { id: "config", label: "Configuration", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { id: "stats",  label: "Statistics",    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { id: "down",   label: "Downtime",      icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "maint",  label: "Maintenance",   icon: "M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" },
];

// ── Live Status Tab ───────────────────────────────────────────────────────────
export const LiveStatusTab = ({ machine }) => {
  const status = safe(machine?.status, "IDLE").toUpperCase();
  const isRunning = status === "RUNNING";
  const [statusHistory, setStatusHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!machine?.id) return;
    setHistoryLoading(true);
    getMachineStatusHistory(machine.id)
      .then(res => {
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        setStatusHistory(rows);
      })
      .catch(() => setStatusHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [machine?.id]);

  const statusInfo = isRunning
    ? { label: "Active", color: "text-green-600", bg: "bg-green-50 border-green-200", dot: "bg-green-500" }
    : { label: "Management Loss", color: "text-orange-600", bg: "bg-orange-50 border-orange-200", dot: "bg-orange-500" };

  const shiftDate = new Date().toISOString().split("T")[0];
  const shiftStart = new Date();
  shiftStart.setHours(14, 30, 0);

  return (
    <div>
      {/* Status tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <InfoTile label="Status" value={statusInfo.label} valueClass={statusInfo.color} icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" iconBg="bg-purple-100 text-purple-600" />
        <InfoTile label="Current Part" value={safe(machine?.part, "No part assigned")} valueClass="text-blue-700" icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" iconBg="bg-green-100 text-green-600" />
        <InfoTile label="Operator" value="Not Assigned" valueClass="text-red-500" icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" iconBg="bg-red-100 text-red-500" />
        <InfoTile label="Cycletime" value="Data Not Found" valueClass="text-gray-400" icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" iconBg="bg-orange-100 text-orange-500" />
      </div>

      {historyLoading ? (
        <div className="mt-4 rounded-xl border border-gray-100 bg-white py-14 text-center text-sm font-semibold text-gray-400">
          Loading machine status history...
        </div>
      ) : (
        <LiveStateGraph history={statusHistory} />
      )}

      {/* Ongoing shift stats */}
      <div className="mt-5">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Ongoing Shift Statistics
        </h3>
        <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
          {[
            ["Current Shift", `Shift B ${shiftDate}`, "Shift Start Time", shiftStart.toLocaleString()],
            ["Machine Start", "—", "Punctuality Loss", "00 Mins 00 Sec"],
            ["Current Target", "— Parts", "Actual Production", "— Parts"],
            ["Machine Utilization", "—", "Operator Efficiency", "—"],
          ].map(([l1, v1, l2, v2], i) => (
            <div key={i} className={`grid grid-cols-2 divide-x divide-gray-100 ${i !== 3 ? "border-b border-gray-100" : ""}`}>
              <div className="px-4 py-3">
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{l1}</p>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{v1}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{l2}</p>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{v2}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const InfoTile = ({ label, value, valueClass, icon, iconBg }) => (
  <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-3 shadow-sm">
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
      </svg>
    </div>
    <div className="min-w-0">
      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-bold truncate ${valueClass}`}>{value}</p>
    </div>
  </div>
);

export const OperationSetupTab = ({ machine }) => {
  const [operations, setOperations] = useState([]);
  const [current, setCurrent] = useState(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadOperations = useCallback(() => {
    if (!machine?.id) return;
    setLoading(true);
    setMessage("");
    getMachineOperations(machine.id, { plant: machine?.plant_code || "1002" })
      .then((res) => {
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        const active = res.data?.current || null;
        setOperations(rows);
        setCurrent(active);
        setSelected(active?.operation_no || rows[0]?.operation_no || "");
      })
      .catch(() => {
        setOperations([]);
        setCurrent(null);
        setMessage("Unable to load operations for this machine.");
      })
      .finally(() => setLoading(false));
  }, [machine?.id, machine?.plant_code]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  const selectedOperation = operations.find((operation) => operation.operation_no === selected);

  const save = async () => {
    if (!selected) {
      setMessage("Please select an operation before saving.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await assignMachineOperation(machine.id, {
        operation_no: selected,
        part_code: selectedOperation?.part_code || current?.part_code || machine?.part_code || null,
        status: machine?.status || "IDLE",
      });
      setMessage("Operation saved for this machine.");
      loadOperations();
    } catch (err) {
      setMessage(err.response?.data?.message || "Unable to save operation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h3 className="text-base font-bold text-gray-900">Operation Setup</h3>
        <p className="mt-1 text-xs text-gray-400">
          Select the operation currently mapped to this machine. The saved operation is recorded in machine status history.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Machine</p>
              <p className="mt-1 truncate text-sm font-extrabold text-slate-900">{safe(machine?.name, "Unknown Machine")}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Current Part</p>
              <p className="mt-1 truncate text-sm font-extrabold text-blue-700">{safe(machine?.part, "No part assigned")}</p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm font-semibold text-slate-400">
              Loading operations...
            </div>
          ) : operations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm font-bold text-slate-500">No operations found</p>
              <p className="mt-1 text-xs text-slate-400">Assign a part to this machine first, or create operations in Operation Master.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Select Operation</span>
                <select
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                >
                  {operations.map((operation) => (
                    <option key={`${operation.part_code}-${operation.operation_no}-${operation.id}`} value={operation.operation_no}>
                      {operation.operation_no} - {operation.operation_name || "Operation"}
                    </option>
                  ))}
                </select>
              </label>

              {selectedOperation && (
                <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Selected Operation</p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900">{selectedOperation.operation_name || selectedOperation.operation_no}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Part: {selectedOperation.part_code || "Not linked"} {selectedOperation.part_name ? `- ${selectedOperation.part_name}` : ""}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Operation"}
              </button>
            </div>
          )}

          {message && (
            <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${message.includes("saved") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {message}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-slate-50/70 p-4">
          <h4 className="text-sm font-extrabold text-slate-900">Current Assignment</h4>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-white px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Operation</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{current?.operation_no || "Not assigned"}</p>
            </div>
            <div className="rounded-lg bg-white px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Part Code</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{current?.part_code || machine?.part_code || "Not linked"}</p>
            </div>
            <div className="rounded-lg bg-white px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Last Updated</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{current?.updated_at ? new Date(current.updated_at).toLocaleString() : "No history"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Configuration Tab ─────────────────────────────────────────────────────────

// Small pencil edit icon (same style as left panel)
export const CfgEditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
  </svg>
);

// +/- stepper control
export const Stepper = ({ value, onChange, min = 0, max = 999 }) => (
  <div className="flex items-center gap-0 rounded-lg border border-indigo-200 overflow-hidden">
    <button
      onClick={() => onChange(Math.max(min, value - 1))}
      className="w-7 h-7 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-base transition-colors"
    >−</button>
    <span className="w-9 text-center text-sm font-bold text-gray-800 bg-white py-0.5">{value}</span>
    <button
      onClick={() => onChange(Math.min(max, value + 1))}
      className="w-7 h-7 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-base transition-colors"
    >+</button>
  </div>
);

// Yes/No radio toggle
export const YesNoToggle = ({ value, onChange }) => (
  <div className="flex items-center gap-3">
    {["Yes", "No"].map(opt => (
      <label key={opt} className="flex items-center gap-1.5 cursor-pointer select-none">
        <span
          onClick={() => onChange(opt === "Yes")}
          className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
            (opt === "Yes" ? value : !value)
              ? "border-green-500 bg-green-500"
              : "border-gray-300 bg-white"
          }`}
        >
          {(opt === "Yes" ? value : !value) && (
            <span className="w-1.5 h-1.5 rounded-full bg-white block"/>
          )}
        </span>
        <span className="text-xs font-medium text-gray-600">{opt}</span>
      </label>
    ))}
  </div>
);

// Inline editable number field
export const InlineNumberEdit = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(value));

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n)) onChange(n);
    setEditing(false);
  };

  if (editing) return (
    <input
      autoFocus
      className="w-16 border border-indigo-400 rounded px-1.5 py-0.5 text-sm font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
    />
  );
  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="text-sm font-bold text-gray-800 hover:text-indigo-600 transition-colors min-w-[24px] text-left"
    >
      {value}
    </button>
  );
};

// Connection type selector
export const ConnectionTypeSelect = ({ value, onChange }) => (
  <div className="flex flex-col gap-1">
    {["Physical", "Digital"].map(opt => (
      <label key={opt} className="flex items-center gap-1.5 cursor-pointer select-none">
        <span
          onClick={() => onChange(opt)}
          className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
            value === opt ? "border-green-500 bg-green-500" : "border-gray-300 bg-white"
          }`}
        >
          {value === opt && <span className="w-1.5 h-1.5 rounded-full bg-white block"/>}
        </span>
        <span className={`text-xs font-medium ${value === opt ? "text-gray-800" : "text-gray-400"}`}>{opt}</span>
      </label>
    ))}
  </div>
);

export const ConfigTab = ({ machine }) => {
  // All config state lives here
  const [cfg, setCfg] = useState({
    standardCycleTime:    0,
    hourlyTarget:         0,
    loadingTime:          0,
    unloadingTime:        0,
    noPlanThreshold:      10,
    stations:             1,
    connectionType:       "Physical",
    productionMachine:    true,
    qualityMachine:       false,
    bottleneckMachine:    true,
    helpers:              0,
  });

  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }));

  // Generic edit modal state for simple text/number fields
  const [modal, setModal] = useState(null); // { key, label, value }

  const openModal = (key, label) => setModal({ key, label, value: cfg[key] });
  const saveModal = () => {
    const n = parseFloat(modal.value);
    if (!isNaN(n)) set(modal.key, n);
    setModal(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-bold text-gray-900">Configuration</h3>
        <p className="text-xs text-gray-400 mt-1">
          These are the defined parameters of the machine registered. You can edit them as per your convenience.
        </p>
      </div>

      {/* Config rows — 2-column grid matching screenshot */}
      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">

        {/* Row 1: Standard Cycle Time | Hourly Target */}
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="flex items-center justify-between px-4 py-3 group">
            <div>
              <p className="text-xs text-gray-500 font-medium">Standard Cycle Time</p>
              <InlineNumberEdit value={cfg.standardCycleTime} onChange={v => set("standardCycleTime", v)}/>
            </div>
            <button onClick={() => openModal("standardCycleTime","Standard Cycle Time")}
              className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3 group">
            <div>
              <p className="text-xs text-gray-500 font-medium">Hourly Target</p>
              <InlineNumberEdit value={cfg.hourlyTarget} onChange={v => set("hourlyTarget", v)}/>
            </div>
            <button onClick={() => openModal("hourlyTarget","Hourly Target")}
              className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
        </div>

        {/* Row 2: Loading Time | Unloading Time */}
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="flex items-center justify-between px-4 py-3 group">
            <div>
              <p className="text-xs text-gray-500 font-medium">Loading Time</p>
              <InlineNumberEdit value={cfg.loadingTime} onChange={v => set("loadingTime", v)}/>
            </div>
            <button onClick={() => openModal("loadingTime","Loading Time")}
              className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3 group">
            <div>
              <p className="text-xs text-gray-500 font-medium">Unloading Time</p>
              <InlineNumberEdit value={cfg.unloadingTime} onChange={v => set("unloadingTime", v)}/>
            </div>
            <button onClick={() => openModal("unloadingTime","Unloading Time")}
              className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
        </div>

        {/* Row 3: No Plan Threshold | Stations */}
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="flex items-center justify-between px-4 py-3 group">
            <div className="flex-1">
              <p className="text-xs text-gray-500 font-medium mb-2">No Plan (Calendar) Threshold</p>
              <Stepper value={cfg.noPlanThreshold} onChange={v => set("noPlanThreshold", v)} min={0} max={100}/>
            </div>
            <button onClick={() => openModal("noPlanThreshold","No Plan Threshold")}
              className="ml-2 p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3 group">
            <div className="flex-1">
              <p className="text-xs text-gray-500 font-medium mb-2">Stations</p>
              <Stepper value={cfg.stations} onChange={v => set("stations", v)} min={1} max={50}/>
            </div>
            <button onClick={() => openModal("stations","Stations")}
              className="ml-2 p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
        </div>

        {/* Row 4: Connection Type | Production Machine */}
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="flex items-center justify-between px-4 py-3 group">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Connection Type</p>
              <ConnectionTypeSelect value={cfg.connectionType} onChange={v => set("connectionType", v)}/>
            </div>
            <button className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3 group">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Production Machine</p>
              <YesNoToggle value={cfg.productionMachine} onChange={v => set("productionMachine", v)}/>
            </div>
            <button className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
        </div>

        {/* Row 5: Quality Machine | Bottleneck Machine */}
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="flex items-center justify-between px-4 py-3 group">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Quality Machine</p>
              <YesNoToggle value={cfg.qualityMachine} onChange={v => set("qualityMachine", v)}/>
            </div>
            <button className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3 group">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Bottleneck Machine</p>
              <YesNoToggle value={cfg.bottleneckMachine} onChange={v => set("bottleneckMachine", v)}/>
            </div>
            <button className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
              <CfgEditIcon/>
            </button>
          </div>
        </div>

        {/* Row 6: Helpers (full width) */}
        <div className="flex items-center justify-between px-4 py-3 group">
          <div className="flex-1">
            <p className="text-xs text-gray-500 font-medium mb-2">Helpers</p>
            <Stepper value={cfg.helpers} onChange={v => set("helpers", v)} min={0} max={20}/>
          </div>
          <button onClick={() => openModal("helpers","Helpers")}
            className="ml-2 p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
            <CfgEditIcon/>
          </button>
        </div>

      </div>

      {/* Inline edit modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden border border-gray-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <CfgEditIcon/>
                </div>
                <span className="font-bold text-gray-800 text-sm">Edit {modal.label}</span>
              </div>
              <button onClick={() => setModal(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="px-5 py-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{modal.label}</label>
              <input
                autoFocus
                type="number"
                value={modal.value}
                onChange={e => setModal(m => ({ ...m, value: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") saveModal(); if (e.key === "Escape") setModal(null); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              />
              <p className="text-xs text-gray-400 mt-2">Press Enter to save · Escape to cancel</p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveModal}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Statistics Tab ─────────────────────────────────────────────────────────────
export const StatsTab = () => {
  const stats = [
    { label: "OEE", value: "—", sub: "Overall Equipment Effectiveness", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    { label: "Availability", value: "—", sub: "Machine uptime ratio", color: "text-green-600", bg: "bg-green-50", border: "border-green-100", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Performance", value: "—", sub: "Speed vs ideal rate", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { label: "Quality", value: "—", sub: "Good parts ratio", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100", icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" },
    { label: "Total Production", value: "—", sub: "Units produced", color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-100", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
    { label: "Rejection Count", value: "—", sub: "Defective units", color: "text-red-600", bg: "bg-red-50", border: "border-red-100", icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" },
  ];

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Performance Statistics</h3>
          <p className="text-xs text-gray-400 mt-0.5">Overall equipment effectiveness metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">All Time</span>
        </div>
      </div>

      {/* OEE gauge style top row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {stats.slice(0, 3).map(s => (
          <div key={s.label} className={`border ${s.border} rounded-xl p-4 ${s.bg} relative overflow-hidden`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{s.label}</p>
                <p className={`text-3xl font-black mt-1 ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-400 mt-1">{s.sub}</p>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.bg}`} style={{border: `1px solid`}}>
                <svg className={`w-4 h-4 ${s.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={s.icon} />
                </svg>
              </div>
            </div>
            {/* decorative bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100 rounded-b-xl">
              <div className={`h-full w-0 rounded-b-xl ${s.color.replace("text-", "bg-")}`} style={{width: "0%"}}></div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-3">
        {stats.slice(3).map(s => (
          <div key={s.label} className={`border ${s.border} rounded-xl p-4 ${s.bg}`}>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-3xl font-black mt-1 ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Trend placeholder */}
      <div className="mt-4 border border-gray-100 rounded-xl bg-gray-50 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Weekly OEE Trend</p>
        <div className="flex items-end gap-2 h-16">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
            <div key={d} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-gray-200 rounded-t" style={{height: "100%"}}></div>
              <span className="text-[10px] text-gray-400">{d}</span>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-300 mt-1">No data available</p>
      </div>
    </div>
  );
};

// ── Downtime Tab ──────────────────────────────────────────────────────────────
export const buildDowntimeTrend = (machineName = "") => {
  let seed = Array.from(machineName).reduce((sum, char) => sum + char.charCodeAt(0), 42);
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const months = [
    "May '23", "Sep '23", "Jan '24", "May '24", "Sep '24",
    "Jan '25", "May '25", "Sep '25", "Jan '26", "May '26",
  ];

  return Array.from({ length: 180 }, (_, index) => {
    const activitySpike = random() > 0.56 ? 240 + random() * 930 : random() * 210;
    const idleValue = index < 18 ? 1160 : random() > 0.82 ? 260 + random() * 520 : random() * 170;

    return {
      index,
      label: months[Math.min(months.length - 1, Math.floor(index / 18))],
      date: new Date(2023, 4, 1 + Math.round(index * 6.8)),
      idle: Math.round(idleValue),
      activity: Math.round(activitySpike),
    };
  });
};

export const TrendLine = ({ points, color, getValue, maxValue, width, height, leftPad, rightPad, topPad, bottomPad }) => {
  const usableW = width - leftPad - rightPad;
  const usableH = height - topPad - bottomPad;
  const d = points.map((point, index) => {
    const x = leftPad + (index / (points.length - 1)) * usableW;
    const y = topPad + usableH - (getValue(point) / maxValue) * usableH;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  return <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />;
};

export const DowntimeTab = ({ machine }) => {
  const trend = useMemo(() => [], [machine?.id]);
  const [hoverPoint, setHoverPoint] = useState(null);
  const width = 980;
  const height = 300;
  const leftPad = 54;
  const rightPad = 18;
  const topPad = 34;
  const bottomPad = 42;
  const maxValue = 1250;
  const chartW = width - leftPad - rightPad;
  const chartH = height - topPad - bottomPad;
  const tickIndexes = trend.length ? [0, 22, 44, 66, 88, 110, 132, 154, trend.length - 1] : [];
  const totalDowntime = Math.round(trend.reduce((sum, point) => sum + point.activity, 0) / 60);
  const events = trend.filter(point => point.activity > 520).length;
  const mttr = events ? Math.round((totalDowntime * 60) / events) : 0;
  const fmtLong = (d) => d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const handleTrendMove = (event) => {
    if (!trend.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xInSvg = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (xInSvg - leftPad) / chartW));
    const index = Math.round(ratio * (trend.length - 1));
    const point = trend[index];
    const x = leftPad + (index / (trend.length - 1)) * chartW;
    const idleY = topPad + chartH - (point.idle / maxValue) * chartH;
    const activityY = topPad + chartH - (point.activity / maxValue) * chartH;
    setHoverPoint({ ...point, x, idleY, activityY });
  };

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {[
          ["Total Downtime", `${totalDowntime} Hrs`, "text-red-600", "bg-red-50 border-red-100", "M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728"],
          ["Breakdown Events", events, "text-orange-600", "bg-orange-50 border-orange-100", "M13 16h-1v-4h-1m1-4h.01M12 18a6 6 0 100-12 6 6 0 000 12z"],
          ["MTTR", `${mttr} Mins`, "text-blue-600", "bg-blue-50 border-blue-100", "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"],
        ].map(([label, value, color, bg, icon]) => (
          <div key={label} className={`border rounded-xl px-4 py-4 ${bg}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center border border-white">
                <svg className={`w-4 h-4 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-gray-800">Downtime Trends</h3>
            <p className="text-[11px] text-gray-400 mt-1">Idle time and downtime activity over the selected range</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-semibold text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-sky-400 rounded-full" />
              IdleTime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-indigo-600 rounded-full" />
              Downtime Activity
            </span>
          </div>
        </div>

        <div
          className="relative overflow-x-auto"
          onMouseMove={handleTrendMove}
          onMouseLeave={() => setHoverPoint(null)}
        >
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] w-full h-[320px]" role="img" aria-label="Downtime trends chart">
            {[0, 250, 500, 750, 1000, 1250].map(value => {
              const y = topPad + (height - topPad - bottomPad) - (value / maxValue) * (height - topPad - bottomPad);
              return (
                <g key={value}>
                  <line x1={leftPad} y1={y} x2={width - rightPad} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                  <text x="18" y={y + 4} fill="#6b7280" fontSize="11" fontWeight="600">{value}</text>
                </g>
              );
            })}

            <TrendLine
              points={trend}
              color="#38bdf8"
              getValue={point => point.idle}
              maxValue={maxValue}
              width={width}
              height={height}
              leftPad={leftPad}
              rightPad={rightPad}
              topPad={topPad}
              bottomPad={bottomPad}
            />
            <TrendLine
              points={trend}
              color="#4f46e5"
              getValue={point => point.activity}
              maxValue={maxValue}
              width={width}
              height={height}
              leftPad={leftPad}
              rightPad={rightPad}
              topPad={topPad}
              bottomPad={bottomPad}
            />

            {tickIndexes.map(index => {
              const x = leftPad + (index / (trend.length - 1)) * (width - leftPad - rightPad);
              return (
                <g key={index}>
                  <line x1={x} y1={height - bottomPad} x2={x} y2={height - bottomPad + 5} stroke="#cbd5e1" />
                  <text x={x} y={height - 16} textAnchor="middle" fill="#4b5563" fontSize="11">{trend[index].label}</text>
                </g>
              );
            })}

            {hoverPoint && (
              <g>
                <line x1={hoverPoint.x} y1={topPad} x2={hoverPoint.x} y2={height - bottomPad} stroke="#94a3b8" strokeDasharray="4 4" />
                <circle cx={hoverPoint.x} cy={hoverPoint.idleY} r="5" fill="#38bdf8" stroke="#fff" strokeWidth="2" />
                <circle cx={hoverPoint.x} cy={hoverPoint.activityY} r="5" fill="#4f46e5" stroke="#fff" strokeWidth="2" />
              </g>
            )}
          </svg>

          {!trend.length && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
              <svg className="w-10 h-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-gray-400">No downtime records found in database</p>
              <p className="text-xs text-gray-300 mt-1">Create a downtime table/API to display real downtime trends</p>
            </div>
          )}

          {hoverPoint && (
            <div
              className="pointer-events-none absolute z-10 min-w-[205px] rounded-md border border-gray-300 bg-white/95 px-3 py-2 text-[11px] text-gray-600 shadow-lg"
              style={{
                left: `min(calc(${(hoverPoint.x / width) * 100}% + 10px), calc(100% - 220px))`,
                top: Math.max(10, Math.min(230, Math.min(hoverPoint.idleY, hoverPoint.activityY) - 14)),
              }}
            >
              <p className="font-bold text-gray-800">Downtime Trends</p>
              <p>{fmtLong(hoverPoint.date)}</p>
              <p>IdleTime: <span className="font-semibold text-sky-500">{hoverPoint.idle}</span></p>
              <p>Downtime Activity: <span className="font-semibold text-indigo-600">{hoverPoint.activity}</span></p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span>Zoom</span>
            {["1m", "3m", "6m", "YTD", "1y", "All"].map((range, index) => (
              <button
                key={range}
                className={`px-2.5 py-1 rounded text-[11px] font-bold ${index === 5 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}
              >
                {range}
              </button>
            ))}
          </div>
          <div className="sm:ml-auto text-[11px] font-semibold text-blue-600">
            1 Jan 2023 <span className="text-gray-400 px-1">to</span> 5 May 2026
          </div>
        </div>

        <div className="mt-3 rounded-md border border-slate-200 bg-slate-100 h-12 relative overflow-hidden">
          <div className="absolute inset-x-8 top-2 bottom-2 bg-white/50 border border-slate-200" />
          <svg viewBox="0 0 980 48" className="absolute inset-0 w-full h-full">
            <TrendLine
              points={trend}
              color="#60a5fa"
              getValue={point => Math.max(point.idle, point.activity)}
              maxValue={maxValue}
              width={980}
              height={48}
              leftPad={36}
              rightPad={36}
              topPad={8}
              bottomPad={8}
            />
          </svg>
          <div className="absolute left-8 top-0 bottom-0 w-1 bg-slate-300" />
          <div className="absolute right-8 top-0 bottom-0 w-1 bg-slate-300" />
        </div>
      </div>
    </div>
  );
};

// ── Maintenance Tab ───────────────────────────────────────────────────────────
export const MaintenanceTab = () => (
  <div className="pt-5">
    <div className="mb-5">
      <h3 className="text-lg font-semibold text-gray-600">Maintenance Logs</h3>
      <div className="relative mt-3 w-full max-w-[198px]">
        <input
          type="date"
          className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 pr-9 text-sm font-medium text-gray-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3M5 11h14M7 5h10a2 2 0 012 2v11a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z" />
        </svg>
      </div>
    </div>

    <div className="overflow-hidden rounded-md border border-gray-100 bg-white">
      <div className="grid grid-cols-[1fr_2fr_2fr] bg-[#f3f2f7] text-[11px] font-black uppercase tracking-wider text-gray-500">
        <div className="px-7 py-3.5">Date</div>
        <div className="px-7 py-3.5">Inspection Name</div>
        <div className="px-7 py-3.5">Status | Comment</div>
      </div>
      <div className="flex min-h-[88px] items-start justify-center px-4 py-4">
        <p className="text-sm font-medium uppercase tracking-wide text-gray-400">No Data Found</p>
      </div>
    </div>
  </div>
);

// ── Realistic Adhesive Coating Machine SVG ────────────────────────────────────
export const AdhesiveCoatingMachineSVG = () => (
  <svg viewBox="0 0 300 220" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* ── Floor shadow ── */}
    <ellipse cx="150" cy="212" rx="120" ry="7" fill="#1e293b" opacity="0.25"/>

    {/* ── GANTRY FRAME top beam ── */}
    <rect x="18" y="22" width="264" height="14" rx="4" fill="url(#topBeam)"/>
    <rect x="18" y="22" width="264" height="4" rx="2" fill="#94a3b8" opacity="0.4"/>
    {/* bolt details on beam */}
    {[30,60,90,120,150,180,210,240,270].map(x => (
      <circle key={x} cx={x} cy="29" r="3" fill="#475569" stroke="#64748b" strokeWidth="0.8"/>
    ))}

    {/* ── Left vertical column ── */}
    <rect x="18" y="22" width="22" height="168" rx="3" fill="url(#columnGrad)"/>
    <rect x="22" y="30" width="14" height="3" rx="1" fill="#94a3b8" opacity="0.3"/>
    {[50,70,90,110,130,150,170].map(y => (
      <rect key={y} x="22" y={y} width="14" height="2" rx="1" fill="#334155" opacity="0.5"/>
    ))}

    {/* ── Right vertical column ── */}
    <rect x="260" y="22" width="22" height="168" rx="3" fill="url(#columnGrad)"/>
    {[50,70,90,110,130,150,170].map(y => (
      <rect key={y} x="264" y={y} width="14" height="2" rx="1" fill="#334155" opacity="0.5"/>
    ))}

    {/* ── Main machine body (base cabinet) ── */}
    <rect x="40" y="140" width="220" height="50" rx="5" fill="url(#bodyGrad)"/>
    {/* body panel lines */}
    <line x1="130" y1="140" x2="130" y2="190" stroke="#475569" strokeWidth="1" opacity="0.5"/>
    <line x1="170" y1="140" x2="170" y2="190" stroke="#475569" strokeWidth="1" opacity="0.5"/>

    {/* ── Left cabinet section ── */}
    <rect x="42" y="142" width="86" height="46" rx="3" fill="#2d3e52"/>
    {/* ventilation grille */}
    {[0,1,2,3,4,5].map(i => (
      <rect key={i} x="50" y={148 + i*5} width="70" height="2.5" rx="1" fill="#1e2d3d" opacity="0.8"/>
    ))}
    {/* door handle */}
    <rect x="120" y="157" width="3" height="16" rx="1.5" fill="#64748b"/>
    <rect x="119" y="163" width="5" height="5" rx="1" fill="#475569"/>

    {/* ── Right control cabinet ── */}
    <rect x="172" y="142" width="86" height="46" rx="3" fill="#1e3a5f"/>
    {/* HMI Screen */}
    <rect x="178" y="147" width="60" height="36" rx="3" fill="#0f172a"/>
    <rect x="180" y="149" width="56" height="32" rx="2" fill="#0a1628"/>
    {/* screen scanlines effect */}
    {[0,1,2,3,4,5,6,7].map(i => (
      <rect key={i} x="180" y={149 + i*4} width="56" height="1" rx="0" fill="#1e3a5f" opacity="0.4"/>
    ))}
    {/* screen content */}
    <rect x="182" y="151" width="52" height="8" rx="1" fill="#1d4ed8" opacity="0.7"/>
    <text x="208" y="157.5" textAnchor="middle" fill="#bfdbfe" fontSize="5" fontFamily="monospace" fontWeight="bold">RICO  IOT</text>
    <rect x="182" y="161" width="35" height="4" rx="1" fill="#064e3b" opacity="0.8"/>
    <text x="199" y="164.5" textAnchor="middle" fill="#34d399" fontSize="4" fontFamily="monospace">● SYSTEM OK</text>
    <text x="208" y="172" textAnchor="middle" fill="#94a3b8" fontSize="4" fontFamily="monospace">ADHESIVE COAT</text>
    <text x="208" y="178" textAnchor="middle" fill="#f59e0b" fontSize="4" fontFamily="monospace">SPM (CFD)-1</text>

    {/* ── CENTER: Coating head gantry carriage ── */}
    {/* carriage body */}
    <rect x="110" y="36" width="80" height="28" rx="4" fill="url(#carriageGrad)"/>
    <rect x="112" y="38" width="76" height="4" rx="2" fill="#7dd3fc" opacity="0.3"/>
    {/* linear rail guides */}
    <rect x="40" y="33" width="220" height="6" rx="3" fill="#334155"/>
    <rect x="40" y="33" width="220" height="2" rx="1" fill="#64748b" opacity="0.5"/>
    <rect x="40" y="57" width="220" height="6" rx="3" fill="#334155"/>

    {/* carriage wheels on rail */}
    <rect x="108" y="31" width="12" height="10" rx="2" fill="#475569"/>
    <rect x="180" y="31" width="12" height="10" rx="2" fill="#475569"/>
    <rect x="108" y="55" width="12" height="8" rx="2" fill="#475569"/>
    <rect x="180" y="55" width="12" height="8" rx="2" fill="#475569"/>

    {/* ── Spray arm / Z-axis ── */}
    <rect x="144" y="62" width="12" height="72" rx="3" fill="url(#sprayArmGrad)"/>
    <rect x="146" y="64" width="8" height="68" rx="2" fill="#1e3a5f" opacity="0.4"/>
    {/* arm ribbing */}
    {[0,1,2,3,4,5,6,7,8].map(i => (
      <rect key={i} x="144" y={66 + i*8} width="12" height="2" rx="1" fill="#3b5e82" opacity="0.6"/>
    ))}

    {/* ── Spray nozzle head ── */}
    <rect x="136" y="130" width="28" height="12" rx="4" fill="#1e40af"/>
    <rect x="138" y="132" width="24" height="8" rx="3" fill="#2563eb"/>
    {/* nozzle tips */}
    <rect x="140" y="141" width="5" height="7" rx="1.5" fill="#3b82f6"/>
    <rect x="148" y="141" width="5" height="7" rx="1.5" fill="#3b82f6"/>
    <rect x="156" y="141" width="5" height="7" rx="1.5" fill="#3b82f6"/>
    {/* spray particles */}
    {[
      [141,154,2],[143,158,1.5],[145,152,1],[147,156,2],[149,154,1.5],
      [151,158,1],[153,152,2],[155,156,1.5],[158,153,1],
    ].map(([cx,cy,r],i) => (
      <circle key={i} cx={cx} cy={cy} r={r} fill="#93c5fd" opacity={0.3 + i*0.05}/>
    ))}

    {/* ── Work table / conveyor ── */}
    <rect x="55" y="133" width="190" height="10" rx="3" fill="#1e293b"/>
    <rect x="55" y="133" width="190" height="3" rx="2" fill="#334155"/>
    {/* table surface markings */}
    {[0,1,2,3,4,5,6,7,8,9].map(i => (
      <rect key={i} x={58 + i*19} y="137" width="14" height="3" rx="1" fill="#0f172a" opacity="0.6"/>
    ))}
    {/* workpiece on table */}
    <rect x="118" y="124" width="64" height="10" rx="2" fill="#78716c"/>
    <rect x="120" y="125" width="60" height="7" rx="1.5" fill="#a8a29e"/>
    <rect x="125" y="126" width="50" height="5" rx="1" fill="#d6d3d1" opacity="0.7"/>

    {/* ── Fluid supply hose (left) ── */}
    <path d="M60 80 Q50 80 48 95 L48 130 Q48 140 58 140" stroke="#475569" strokeWidth="6" fill="none" strokeLinecap="round"/>
    <path d="M60 80 Q50 80 48 95 L48 130 Q48 140 58 140" stroke="#334155" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <path d="M60 80 Q50 80 48 95 L48 130 Q48 140 58 140" stroke="#64748b" strokeWidth="1" fill="none" strokeLinecap="round" strokeDasharray="4 6"/>
    <circle cx="60" cy="80" r="5" fill="#64748b" stroke="#94a3b8" strokeWidth="1"/>
    <circle cx="58" cy="140" r="5" fill="#64748b" stroke="#94a3b8" strokeWidth="1"/>

    {/* ── Cable chain (right) ── */}
    <path d="M240 80 Q250 80 252 95 L252 130 Q252 140 242 140" stroke="#374151" strokeWidth="8" fill="none" strokeLinecap="round"/>
    {[0,1,2,3,4,5,6,7].map(i => (
      <rect key={i} x="246" y={87 + i*7} width="10" height="5" rx="1" fill="#4b5563" stroke="#6b7280" strokeWidth="0.5"/>
    ))}

    {/* ── Legs / feet ── */}
    <rect x="50" y="188" width="18" height="14" rx="2" fill="#1e293b"/>
    <rect x="48" y="200" width="22" height="4" rx="2" fill="#0f172a"/>
    <rect x="100" y="188" width="18" height="14" rx="2" fill="#1e293b"/>
    <rect x="98" y="200" width="22" height="4" rx="2" fill="#0f172a"/>
    <rect x="182" y="188" width="18" height="14" rx="2" fill="#1e293b"/>
    <rect x="180" y="200" width="22" height="4" rx="2" fill="#0f172a"/>
    <rect x="232" y="188" width="18" height="14" rx="2" fill="#1e293b"/>
    <rect x="230" y="200" width="22" height="4" rx="2" fill="#0f172a"/>

    {/* ── Status LED bar on top beam ── */}
    {[0,1,2,3,4,5,6,7,8,9].map(i => (
      <circle key={i} cx={35 + i*26} cy="27" r="2.5"
        fill={i%4===0?"#22c55e":i%4===1?"#3b82f6":i%4===2?"#f59e0b":"#64748b"} opacity="0.95"/>
    ))}

    {/* ── Safety warning label ── */}
    <rect x="66" y="155" width="56" height="14" rx="2" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.8"/>
    <text x="94" y="165" textAnchor="middle" fill="#92400e" fontSize="5" fontFamily="monospace" fontWeight="bold">⚠ ADHESIVE</text>

    {/* ── RICO badge ── */}
    <rect x="118" y="168" width="64" height="16" rx="3" fill="#1e293b" stroke="#334155" strokeWidth="1"/>
    <text x="150" y="179" textAnchor="middle" fill="#38bdf8" fontSize="7" fontFamily="monospace" fontWeight="bold" letterSpacing="3">RICO</text>

    {/* ── Gradients ── */}
    <defs>
      <linearGradient id="topBeam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#64748b"/>
        <stop offset="100%" stopColor="#334155"/>
      </linearGradient>
      <linearGradient id="columnGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#475569"/>
        <stop offset="50%" stopColor="#334155"/>
        <stop offset="100%" stopColor="#1e293b"/>
      </linearGradient>
      <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b4d63"/>
        <stop offset="100%" stopColor="#243145"/>
      </linearGradient>
      <linearGradient id="carriageGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e40af"/>
        <stop offset="100%" stopColor="#1e3a8a"/>
      </linearGradient>
      <linearGradient id="sprayArmGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#1e40af"/>
        <stop offset="50%" stopColor="#2563eb"/>
        <stop offset="100%" stopColor="#1e3a8a"/>
      </linearGradient>
    </defs>
  </svg>
);

// ── Machine Image Panel with Upload ───────────────────────────────────────────
export const MachineImagePanel = ({ machineName, status }) => {
  const [customImage, setCustomImage] = useState(null);
  const [hovering, setHovering]       = useState(false);
  const fileRef = React.useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCustomImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const isRunning = String(status || "").toUpperCase() === "RUNNING";

  return (
    <div
      className="relative bg-gradient-to-b from-slate-800 to-slate-900 h-56 flex items-center justify-center overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => fileRef.current?.click()}
    >
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        onClick={e => e.stopPropagation()}
      />

      {/* Machine image or SVG */}
      {customImage ? (
        <img
          src={customImage}
          alt={machineName}
          className="w-full h-full object-contain p-3"
        />
      ) : (
        <div className="w-full h-full p-3">
          <AdhesiveCoatingMachineSVG />
        </div>
      )}

      {/* Hover overlay — upload prompt */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center transition-all duration-200"
        style={{
          background: hovering ? "rgba(0,0,0,0.55)" : "transparent",
          opacity: hovering ? 1 : 0,
          pointerEvents: hovering ? "auto" : "none",
        }}
      >
        <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center mb-2 border-2 border-white/40">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-white text-xs font-bold">
          {customImage ? "Change Photo" : "Upload Photo"}
        </p>
        <p className="text-white/60 text-[10px] mt-0.5">Click to browse</p>
      </div>

      {/* Status badge — top right */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1 pointer-events-none">
        <span className={`w-2 h-2 rounded-full animate-pulse ${isRunning ? "bg-green-400" : "bg-orange-400"}`}/>
        <span className={`text-[10px] font-bold uppercase tracking-wide ${isRunning ? "text-green-300" : "text-orange-300"}`}>
          {isRunning ? "Running" : "Idle"}
        </span>
      </div>

      {/* Shop badge — top left */}
      <div className="absolute top-3 left-3 bg-blue-600/80 backdrop-blur-sm rounded-full px-2.5 py-1 pointer-events-none">
        <span className="text-[10px] font-bold text-white uppercase tracking-wide">Paint Shop</span>
      </div>

      {/* Camera icon bottom-right corner (always visible, subtle) */}
      <div className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-black/30 backdrop-blur flex items-center justify-center pointer-events-none">
        <svg className="w-3.5 h-3.5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
    </div>
  );
};

// ── Left panel info row ───────────────────────────────────────────────────────
export const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

export const InfoRow = ({ label, value, highlight, editable = true, onEdit }) => (
  <div className="py-2 border-b border-gray-50 last:border-0 flex items-center justify-between gap-2 group">
    <div className="min-w-0 flex-1">
      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${highlight ? "text-blue-600" : "text-gray-800"}`}>{value}</p>
    </div>
    {editable && (
      <button
        onClick={() => onEdit && onEdit(label, value)}
        className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all flex-shrink-0 opacity-0 group-hover:opacity-100"
        title={`Edit ${label}`}
      >
        <EditIcon />
      </button>
    )}
  </div>
);

// ── Main Page ─────────────────────────────────────────────────────────────────
