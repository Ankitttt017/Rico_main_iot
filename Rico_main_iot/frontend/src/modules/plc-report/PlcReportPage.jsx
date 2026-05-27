import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "../../components/common/AppLayout";
import ricoLogo from "../../assets/rico-logo.png";
import {
  getPlcHistoryExportUrl,
  getPlcLatestReadings,
  getPlcReadingHistory,
} from "../../services/api";

const DEFAULT_MACHINE = {
  machine_key: "ube-850t-2",
  machine_name: "UBE 850T-2",
  plc_ip: "192.168.117.201",
  plc_port: 5002,
};

const HIDDEN_COLUMNS = new Set([
  "recorded_at",
  "plc_ip",
  "plc_port",
  "raw_readings_json",
  "created_at",
  "machine_type",
  "has_data",
  "is_online",
  "error",
]);

const PREFERRED_COLUMNS = [
  "recorded_at",
  "machine_name",
  "plc_ip",
  "plc_port",
  "part_name",
  "shot_date",
  "shot_time",
  "shot_number",
  "shot_status",
  "cycle_time",
  "ok_shot",
];

const SHOT_STATUS = {
  1: { label: "OK Shot", tone: "emerald" },
  3: { label: "Warm Up Shot", tone: "amber" },
  5: { label: "Off Shot", tone: "rose" },
};

function todayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function labelize(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDateOnly(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTimeOnly(value) {
  if (!value) return "-";
  const text = String(value);
  const match = text.match(/T(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/) ||
    text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (match) {
    return `${String(match[1]).padStart(2, "0")}:${String(match[2]).padStart(2, "0")}:${String(match[3] || 0).padStart(2, "0")}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function shotStatusLabel(value) {
  const status = Number(value);
  if (status === 1) return "OK Shot";
  if (status === 3) return "Warm Up Shot";
  if (status === 5) return "Off Shot";
  return value || "-";
}

function formatValue(value, key) {
  if (value === null || value === undefined || value === "") return "-";
  if (key === "recorded_at" || key === "cycle_end_time") return formatDateTime(value);
  if (key === "shot_date") return formatDateOnly(value);
  if (key === "shot_time") return formatTimeOnly(value);
  if (key === "shot_status") {
    return shotStatusLabel(value);
  }
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getMachineId(machine) {
  return machine?.machine_key || machine?.plc_ip || DEFAULT_MACHINE.machine_key;
}

function getMachineReportIp(machine) {
  return machine?.plc_ip || machine?.ip || machine?.machine_key || DEFAULT_MACHINE.plc_ip;
}

function buildColumns(rows) {
  const keys = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!HIDDEN_COLUMNS.has(key)) keys.add(key);
    });
  });
  return [
    ...PREFERRED_COLUMNS.filter((key) => keys.has(key)),
    ...Array.from(keys)
      .filter((key) => !PREFERRED_COLUMNS.includes(key))
      .sort((a, b) => labelize(a).localeCompare(labelize(b))),
  ];
}

function getColumnWidth(key) {
  if (key === "recorded_at") return 150;
  if (key === "machine_name") return 140;
  if (key === "part_name") return 130;
  if (key === "shot_status") return 135;
  if (key === "average_die_clamp_tonnage_count") return 230;
  if (String(key).length > 24) return 190;
  if (String(key).length > 16) return 155;
  return 118;
}

function KpiCard({ title, value, tone }) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  }[tone] || "border-slate-200 bg-white text-slate-700";

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] opacity-75">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

export default function PlcReportPage({ onLogout, currentUser }) {
  const [machines, setMachines] = useState([DEFAULT_MACHINE]);
  const [selectedMachineId, setSelectedMachineId] = useState(getMachineId(DEFAULT_MACHINE));
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const tableScrollRef = useRef(null);

  useEffect(() => {
    let active = true;
    getPlcLatestReadings()
      .then((response) => {
        if (!active) return;
        const next = Array.isArray(response.data?.data) && response.data.data.length
          ? response.data.data
          : [DEFAULT_MACHINE];
        setMachines(next);
        setSelectedMachineId((current) => current || getMachineId(next[0]));
      })
      .catch(() => {
        if (active) setMachines([DEFAULT_MACHINE]);
      });
    return () => { active = false; };
  }, []);

  const selectedMachine = useMemo(
    () => machines.find((machine) => getMachineId(machine) === selectedMachineId) || machines[0] || DEFAULT_MACHINE,
    [machines, selectedMachineId]
  );

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getPlcReadingHistory({
        ip: getMachineReportIp(selectedMachine),
        from: fromDate,
        to: toDate,
        limit: 5000,
      });
      setRows(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (err) {
      setRows([]);
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to load PLC report.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, selectedMachine, toDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const columns = useMemo(() => buildColumns(rows), [rows]);

  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
  }, [columns.length, fromDate, rows.length, selectedMachineId, toDate]);
  const kpis = useMemo(() => {
    const counts = { ok: 0, warm: 0, off: 0 };
    rows.forEach((row) => {
      const value = Number(row.shot_status ?? row["Shot Status"]);
      if (value === 1) counts.ok += 1;
      if (value === 3) counts.warm += 1;
      if (value === 5) counts.off += 1;
    });
    return counts;
  }, [rows]);

  const excelUrl = getPlcHistoryExportUrl({
    ip: getMachineReportIp(selectedMachine),
    from: fromDate,
    to: toDate,
    limit: 5000,
  });

  const downloadPdf = () => {
    const title = `${selectedMachine?.machine_name || "PLC"} Report`;
    const header = columns.map((key) => `<th>${escapeHtml(labelize(key))}</th>`).join("");
    const body = rows.map((row) => (
      `<tr>${columns.map((key) => `<td>${escapeHtml(formatValue(row[key], key))}</td>`).join("")}</tr>`
    )).join("");
    const popup = window.open("", "_blank", "width=1200,height=800");
    if (!popup) return;
    popup.document.write(`<!doctype html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#0f172a;margin:18px;background:#fff}
    .sheet{border:1px solid #cbd5e1}
    .head{display:flex;align-items:center;gap:18px;border-bottom:3px solid #134b8f;padding:14px 16px}
    .logo{width:190px;height:58px;display:flex;align-items:center;justify-content:center;border:1px solid #d7e3f2;border-radius:6px}
    .logo img{max-height:42px;max-width:150px}
    h1{font-size:22px;margin:0;color:#0f172a}
    .company{font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:.08em;text-transform:uppercase}
    .meta{font-size:12px;color:#475569;font-weight:700;margin-top:4px}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #cbd5e1}
    .kpi{border-right:1px solid #cbd5e1;padding:10px 14px}
    .kpi:last-child{border-right:0}
    .kpi span{display:block;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
    .kpi strong{display:block;font-size:22px;margin-top:4px}
    table{width:100%;border-collapse:collapse;font-size:9px}
    th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:left;vertical-align:top;white-space:nowrap}
    th{background:#dbeafe;color:#1e3a5f;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
    tbody tr:nth-child(even){background:#f8fafc}
    @page{size:landscape;margin:12mm}
  </style>
</head>
<body>
  <section class="sheet">
    <div class="head">
      <div class="logo"><img src="${ricoLogo}" alt="RICO"></div>
      <div>
        <div class="company">Rico Auto Industries Limited</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${escapeHtml(selectedMachine?.machine_name || selectedMachine?.plc_ip || "Machine")} | ${escapeHtml(fromDate)} to ${escapeHtml(toDate)} | ${rows.length} shots</div>
      </div>
    </div>
    <div class="summary">
      <div class="kpi"><span>OK Shot</span><strong>${kpis.ok}</strong></div>
      <div class="kpi"><span>Warm Up Shot</span><strong>${kpis.warm}</strong></div>
      <div class="kpi"><span>Off Shot</span><strong>${kpis.off}</strong></div>
      <div class="kpi"><span>Total Shot</span><strong>${rows.length}</strong></div>
    </div>
    <table><thead><tr>${header}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length || 1}">No records</td></tr>`}</tbody></table>
  </section>
  <script>window.onload=function(){window.print();};</script>
</body>
</html>`);
    popup.document.close();
  };

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser}>
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-52 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-5 shadow-sm">
                <img src={ricoLogo} alt="RICO Auto Industries Limited" className="block max-h-11 w-auto object-contain" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Rico Auto Industries Limited</p>
                <h1 className="mt-1 text-2xl font-black text-slate-950">PLC Machine Production Report</h1>
                <p className="text-sm font-semibold text-slate-500">
                  {selectedMachine?.machine_name || selectedMachine?.plc_ip || "Machine"} | {fromDate} to {toDate}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm lg:text-right">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">PLC IP</p>
                <p className="font-black text-slate-900">{selectedMachine?.plc_ip || "-"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Records</p>
                <p className="font-black text-slate-900">{rows.length}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_170px_170px_auto_auto_auto] lg:items-end">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Machine</span>
              <select
                value={selectedMachineId}
                onChange={(event) => setSelectedMachineId(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {machines.map((machine) => (
                  <option key={getMachineId(machine)} value={getMachineId(machine)}>
                    {machine.machine_name || machine.name || machine.plc_ip || getMachineId(machine)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">From</span>
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">To</span>
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </label>
            <button type="button" onClick={loadReport} className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
              View
            </button>
            <a href={excelUrl} className="flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700">
              Excel
            </a>
            <button type="button" onClick={downloadPdf} className="h-11 rounded-lg bg-slate-900 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800">
              PDF
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <KpiCard title="OK Shot" value={kpis.ok} tone="emerald" />
          <KpiCard title="Warm Up Shot" value={kpis.warm} tone="amber" />
          <KpiCard title="Off Shot" value={kpis.off} tone="rose" />
          <KpiCard title="Total Shot" value={rows.length} tone="blue" />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-800">Overall Machine Report</h2>
              <p className="text-xs font-semibold text-slate-500">
                {selectedMachine?.machine_name || selectedMachine?.plc_ip || "Machine"} | {fromDate} to {toDate}
              </p>
            </div>
            {loading && <span className="text-xs font-bold text-blue-600">Loading...</span>}
          </div>
          {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div>}
          <div ref={tableScrollRef} className="max-h-[62vh] overflow-auto">
            <table className="min-w-max border-collapse table-fixed text-xs">
              <colgroup>
                {columns.map((key) => (
                  <col key={key} style={{ width: `${getColumnWidth(key)}px`, minWidth: `${getColumnWidth(key)}px` }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#eef5ff] text-slate-600">
                <tr>
                  {columns.map((key) => (
                    <th key={key} className="border-b border-r border-slate-200 px-4 py-3 text-center align-middle font-black uppercase tracking-[0.06em] last:border-r-0">
                      <span className="block whitespace-normal leading-tight">{labelize(key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id || `${row.recorded_at}-${index}`} className="border-b border-slate-100 hover:bg-slate-50">
                    {columns.map((key) => (
                      <td key={key} className="border-r border-slate-100 px-4 py-2.5 text-center align-middle font-semibold leading-tight text-slate-800 last:border-r-0">
                        {formatValue(row[key], key)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr>
                    <td colSpan={columns.length || 1} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                      No records found for selected date range
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
