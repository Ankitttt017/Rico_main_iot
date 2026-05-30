import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "../../../components/common/AppLayout";
import ricoLogo from "../../../assets/rico-logo.png";
import {
  getPlcLatestReadings,
  getPlcReadingHistory,
} from "../../../services/api";

const DEFAULT_MACHINE = {
  machine_key: "ube-850t-2",
  machine_name: "UBE 850T-2",
  plc_ip: "192.168.117.201",
  plc_port: 5002,
};

const HIDDEN_COLUMNS = new Set([
  "recorded_at",
  "shot_datetime",
  "shot_day",
  "shot_fwd_time",
  "shot_fwd_time_sec",
  "shot_fwd_time_sec_value",
  "shot_hour",
  "shot_minute",
  "shot_month",
  "shot_second",
  "shot_year",
  "machine_name",
  "machine_key",
  "plc_ip",
  "plc_port",
  "cycle_start",
  "cycle_end",
  "cycle_end_time",
  "raw_readings_json",
  "created_at",
  "machine_type",
  "has_data",
  "is_online",
  "error",
  "raw_shot_status",
  "shot_status_code",
  "shot_status_display",
]);

const SERIAL_COLUMN = "serial_number";
const SHIFT_COLUMN = "shift";

const PREFERRED_COLUMNS = [
  SERIAL_COLUMN,
  "recorded_at",
  "plc_ip",
  "plc_port",
  "part_name",
  "shot_date",
  "shot_time",
  SHIFT_COLUMN,
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

const QUICK_DATE_FILTERS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "last15", label: "Last 15 Days" },
  { key: "month", label: "This Month" },
];

const SHIFT_FILTERS = [
  { key: "all", label: "All Shift" },
  { key: "A", label: "A Shift" },
  { key: "B", label: "B Shift" },
  { key: "C", label: "C Shift" },
];

function toInputDate(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function todayInput() {
  return toInputDate(new Date());
}

function parseInputDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addDaysToInputDate(value, days) {
  const date = parseInputDate(value);
  return date ? toInputDate(addDays(date, days)) : value;
}

function getQuickDateRange(key) {
  const today = new Date();
  if (key === "week") {
    const start = new Date(today);
    const day = start.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - daysFromMonday);
    return { from: toInputDate(start), to: toInputDate(today) };
  }
  if (key === "last15") {
    return { from: toInputDate(addDays(today, -14)), to: toInputDate(today) };
  }
  if (key === "month") {
    return { from: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: toInputDate(today) };
  }
  return { from: toInputDate(today), to: toInputDate(today) };
}

function getQuickFilterLabel(key) {
  return QUICK_DATE_FILTERS.find((filter) => filter.key === key)?.label || "Custom Range";
}

function getShiftFilterLabel(key) {
  return SHIFT_FILTERS.find((filter) => filter.key === key)?.label || "All Shift";
}

function formatDisplayDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function slugify(value) {
  return String(value || "report")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function labelize(key) {
  if (key === SERIAL_COLUMN) return "S No";
  if (key === SHIFT_COLUMN) return "Shift";
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeColumnKey(key) {
  return String(key || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isHiddenColumn(key) {
  return HIDDEN_COLUMNS.has(normalizeColumnKey(key));
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

function getRowValue(row = {}, ...keys) {
  for (const key of keys) {
    if (row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return null;
}

function getTimeParts(value) {
  if (!value) return null;
  const text = String(value).trim();
  const timeMatch = text.match(/(?:T|\s|^)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const second = Number(timeMatch[3] || 0);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return { hour, minute, second };
  }

  const hourOnlyMatch = text.match(/^(\d{1,2})$/);
  if (hourOnlyMatch) {
    const hour = Number(hourOnlyMatch[1]);
    if (hour > 23) return null;
    return { hour, minute: 0, second: 0 };
  }

  const hourMinuteTextMatch = text.match(/\b(?:shot_)?hour\b\D+(\d{1,2})\D+\b(?:shot_)?minute\b\D+(\d{1,2})/i);
  if (hourMinuteTextMatch) {
    const hour = Number(hourMinuteTextMatch[1]);
    const minute = Number(hourMinuteTextMatch[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, second: 0 };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateTimeMatch = formatted.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (dateTimeMatch) {
    return {
      hour: Number(dateTimeMatch[1]),
      minute: Number(dateTimeMatch[2]),
      second: Number(dateTimeMatch[3]),
    };
  }
  return null;
}

function getSecondsFromTimeParts(parts) {
  if (!parts) return null;
  return parts.hour * 3600 + parts.minute * 60 + parts.second;
}

function getShiftFromTimeParts(parts) {
  if (!parts) return "-";
  const seconds = getSecondsFromTimeParts(parts);
  if (seconds >= 6 * 3600 && seconds < 14 * 3600 + 30 * 60) return "A";
  if (seconds >= 14 * 3600 + 30 * 60 && seconds < 23 * 3600) return "B";
  return "C";
}

function getRowTimeParts(row = {}) {
  const shotTime = getRowValue(row, "shot_time", "SHOT TIME", "Shot Time");
  const shotHour = getRowValue(row, "shot_hour", "SHOT HOUR", "Shot Hour");
  const shotMinute = getRowValue(row, "shot_minute", "SHOT MINUTE", "Shot Minute") || 0;
  const shotSecond = getRowValue(row, "shot_second", "SHOT SECOND", "Shot Second") || 0;
  const timestamp = getRowValue(
    row,
    "shot_datetime",
    "SHOT DATETIME",
    "Shot Datetime",
    "cycle_end_time",
    "cycle_end",
    "recorded_at",
    "created_at"
  );
  if (shotHour !== null) {
    return getTimeParts(`${shotHour}:${shotMinute}:${shotSecond}`);
  }
  return getTimeParts(shotTime || timestamp);
}

function getRowShift(row = {}) {
  return getShiftFromTimeParts(getRowTimeParts(row));
}

function normalizeDateInput(value) {
  if (!value) return null;
  const text = String(value).trim();
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toInputDate(date);
}

function getRowCalendarDate(row = {}) {
  const shotDate = getRowValue(row, "shot_date", "SHOT DATE", "Shot Date");
  const timestamp = getRowValue(
    row,
    "shot_datetime",
    "SHOT DATETIME",
    "Shot Datetime",
    "cycle_end_time",
    "cycle_end",
    "recorded_at",
    "created_at"
  );
  return normalizeDateInput(shotDate) || normalizeDateInput(timestamp);
}

function getRowProductionDate(row = {}) {
  const calendarDate = getRowCalendarDate(row);
  if (!calendarDate) return null;
  const timeParts = getRowTimeParts(row);
  const shift = getShiftFromTimeParts(timeParts);
  const seconds = getSecondsFromTimeParts(timeParts);
  if (shift === "C" && seconds !== null && seconds < 6 * 3600) {
    return addDaysToInputDate(calendarDate, -1);
  }
  return calendarDate;
}

function isRowInProductionFilter(row = {}, fromDate, toDate, shiftFilter) {
  const productionDate = getRowProductionDate(row);
  if (!productionDate || productionDate < fromDate || productionDate > toDate) return false;
  const rowShift = getRowShift(row);
  return shiftFilter === "all" || rowShift === shiftFilter;
}

function shotStatusLabel(value) {
  const status = Number(value);
  if (status === 1) return "OK Shot";
  if (status === 3) return "Warm Up Shot";
  if (status === 5) return "Off Shot";
  return "-";
}

function getShotStatusCode(row = {}, olderRow = {}) {
  const rawStatus = Number(row.shot_status ?? row["Shot Status"]);
  if ([1, 3, 5].includes(rawStatus)) return rawStatus;

  const currentOkShot = Number(row.ok_shot ?? row["OK Shot"]);
  const olderOkShot = Number(olderRow?.ok_shot ?? olderRow?.["OK Shot"]);
  if (Number.isFinite(currentOkShot) && Number.isFinite(olderOkShot) && currentOkShot > olderOkShot) {
    return 1;
  }

  return null;
}

function normalizeReportRows(rows = []) {
  const sortedRows = sortRowsLatestFirst(rows);
  return sortedRows.map((row, index) => {
    const statusCode = getShotStatusCode(row, sortedRows[index + 1]);
    return {
      ...row,
      shot_status_code: statusCode,
      shot_status_display: shotStatusLabel(statusCode),
      raw_shot_status: row.shot_status ?? row["Shot Status"] ?? null,
    };
  });
}

function formatValue(value, key) {
  if (value === null || value === undefined || value === "") return "-";
  if (key === "recorded_at" || key === "cycle_end_time") return formatDateTime(value);
  if (key === "shot_date") return formatDateOnly(value);
  if (key === "shot_time") return formatTimeOnly(value);
  if (key === "shot_status") {
    return shotStatusLabel(value);
  }
  if (key === "average_die_clamp_tonnage_count" && Number(value) <= 0) return "-";
  return String(value);
}

function formatReportCell(row, key, rowIndex = 0) {
  if (key === SERIAL_COLUMN) return rowIndex + 1;
  if (key === SHIFT_COLUMN) return getRowShift(row);
  if (key === "shot_status") return row.shot_status_display || shotStatusLabel(row.shot_status_code);
  return formatValue(row[key], key);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadHtmlFile(filename, html) {
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getMachineId(machine) {
  return machine?.machine_key || machine?.plc_ip || DEFAULT_MACHINE.machine_key;
}

function getMachineReportIp(machine) {
  return machine?.plc_ip || machine?.ip || machine?.machine_key || DEFAULT_MACHINE.plc_ip;
}

function getNumericId(row = {}) {
  const value = getRowValue(row, "id", "ID", "Id");
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function getRowSortTime(row = {}) {
  const candidates = [
    row.cycle_end_time,
    row.shot_datetime,
    row.recorded_at,
    row.created_at,
    row.cycle_end,
    row.shot_date && row.shot_time ? `${row.shot_date}T${row.shot_time}` : null,
    row.shot_date,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}

function sortRowsLatestFirst(nextRows) {
  return [...nextRows].sort((a, b) => {
    const aId = getNumericId(a);
    const bId = getNumericId(b);
    if (aId !== null && bId !== null && aId !== bId) return bId - aId;
    return getRowSortTime(b) - getRowSortTime(a);
  });
}

function buildColumns(rows) {
  const keys = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!isHiddenColumn(key)) keys.add(key);
    });
  });
  if (rows.length) {
    keys.add(SERIAL_COLUMN);
    keys.add(SHIFT_COLUMN);
  }
  return [
    ...PREFERRED_COLUMNS.filter((key) => keys.has(key)),
    ...Array.from(keys)
      .filter((key) => !PREFERRED_COLUMNS.includes(key))
      .sort((a, b) => labelize(a).localeCompare(labelize(b))),
  ];
}

function getColumnWidth(key) {
  if (key === SERIAL_COLUMN) return 72;
  if (key === SHIFT_COLUMN) return 88;
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
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
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
  const [activeQuickFilter, setActiveQuickFilter] = useState("today");
  const [shiftFilter, setShiftFilter] = useState("all");
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

  const applyQuickDateFilter = useCallback((key) => {
    const range = getQuickDateRange(key);
    setActiveQuickFilter(key);
    setFromDate(range.from);
    setToDate(range.to);
  }, []);

  const handleFromDateChange = useCallback((event) => {
    setActiveQuickFilter("custom");
    setFromDate(event.target.value);
  }, []);

  const handleToDateChange = useCallback((event) => {
    setActiveQuickFilter("custom");
    setToDate(event.target.value);
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getPlcReadingHistory({
        ip: getMachineReportIp(selectedMachine),
        from: fromDate,
        to: addDaysToInputDate(toDate, 1),
        limit: 5000,
      });
      const nextRows = Array.isArray(response.data?.data) ? response.data.data : [];
      setRows(sortRowsLatestFirst(nextRows));
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

  const reportRows = useMemo(
    () => normalizeReportRows(rows.filter((row) => isRowInProductionFilter(row, fromDate, toDate, shiftFilter))),
    [fromDate, rows, shiftFilter, toDate]
  );

  const columns = useMemo(() => buildColumns(reportRows), [reportRows]);

  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = 0;
      tableScrollRef.current.scrollTop = 0;
    }
  }, [columns.length, fromDate, reportRows, selectedMachineId, shiftFilter, toDate]);
  const kpis = useMemo(() => {
    const counts = { ok: 0, warm: 0, off: 0, shift: shiftFilter === "all" ? "All" : shiftFilter };
    reportRows.forEach((row) => {
      const value = Number(row.shot_status_code);
      if (value === 1) counts.ok += 1;
      if (value === 3) counts.warm += 1;
      if (value === 5) counts.off += 1;
    });
    if (!reportRows.length) counts.shift = shiftFilter === "all" ? "All" : shiftFilter;
    return counts;
  }, [reportRows, shiftFilter]);

  const reportRangeLabel = `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`;
  const reportFilterLabel = getQuickFilterLabel(activeQuickFilter);
  const reportShiftLabel = getShiftFilterLabel(shiftFilter);
  const machineLabel = selectedMachine?.machine_name || selectedMachine?.plc_ip || "Machine";
  const reportFileBaseName = [
    "rico-production-report",
    slugify(machineLabel),
    slugify(reportFilterLabel),
    slugify(reportShiftLabel),
    fromDate,
    toDate,
  ].filter(Boolean).join("-");

  const downloadPdf = () => {
    const title = `${machineLabel} Production Report`;
    const generatedAt = formatDateTime(new Date());
    const header = columns.map((key) => `<th>${escapeHtml(labelize(key))}</th>`).join("");
    const body = reportRows.map((row, index) => (
      `<tr>${columns.map((key) => `<td>${escapeHtml(formatReportCell(row, key, index))}</td>`).join("")}</tr>`
    )).join("");
    const popup = window.open("", "_blank", "width=1200,height=800");
    if (!popup) return;
    popup.document.write(`<!doctype html>
<html>
<head>
  <title>${escapeHtml(reportFileBaseName)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#0f172a;margin:18px;background:#fff}
    .sheet{border:1px solid #94a3b8}
    .head{display:grid;grid-template-columns:210px 1fr 250px;align-items:center;gap:18px;border-bottom:3px solid #134b8f;padding:14px 16px}
    .logo{height:62px;display:flex;align-items:center;justify-content:center;border:1px solid #d7e3f2;border-radius:6px}
    .logo img{max-height:42px;max-width:150px}
    h1{font-size:22px;margin:2px 0;color:#0f172a}
    .company{font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:.08em;text-transform:uppercase}
    .meta{font-size:12px;color:#475569;font-weight:700;margin-top:4px}
    .doc{border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;font-size:10px}
    .doc div{display:grid;grid-template-columns:90px 1fr;border-bottom:1px solid #e2e8f0}
    .doc div:last-child{border-bottom:0}
    .doc span{background:#f1f5f9;color:#475569;font-weight:800;padding:6px;text-transform:uppercase}
    .doc strong{padding:6px;color:#0f172a}
    .details{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #cbd5e1}
    .detail{border-right:1px solid #cbd5e1;padding:10px 14px}
    .detail:last-child{border-right:0}
    .detail span{display:block;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
    .detail strong{display:block;font-size:13px;margin-top:4px;color:#0f172a}
    .summary{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid #cbd5e1}
    .kpi{border-right:1px solid #cbd5e1;padding:10px 14px}
    .kpi:last-child{border-right:0}
    .kpi span{display:block;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
    .kpi strong{display:block;font-size:22px;margin-top:4px}
    table{width:100%;border-collapse:collapse;font-size:9px}
    th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:left;vertical-align:top;white-space:nowrap}
    th{background:#dbeafe;color:#1e3a5f;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
    tbody tr:nth-child(even){background:#f8fafc}
    .table-title{background:#f8fafc;border-bottom:1px solid #cbd5e1;padding:9px 14px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#334155}
    .footer{display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;padding:8px 12px;font-size:10px;font-weight:700;color:#64748b}
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
        <div class="meta">${escapeHtml(reportFilterLabel)} | ${escapeHtml(reportShiftLabel)} | ${escapeHtml(reportRangeLabel)} | ${reportRows.length} records</div>
      </div>
      <div class="doc">
        <div><span>Report</span><strong>Production</strong></div>
        <div><span>Generated</span><strong>${escapeHtml(generatedAt)}</strong></div>
        <div><span>Status</span><strong>Controlled Copy</strong></div>
      </div>
    </div>
    <div class="details">
      <div class="detail"><span>Machine</span><strong>${escapeHtml(machineLabel)}</strong></div>
      <div class="detail"><span>PLC IP</span><strong>${escapeHtml(selectedMachine?.plc_ip || "-")}</strong></div>
      <div class="detail"><span>Date Range</span><strong>${escapeHtml(reportRangeLabel)}</strong></div>
      <div class="detail"><span>Filter</span><strong>${escapeHtml(reportFilterLabel)} / ${escapeHtml(reportShiftLabel)}</strong></div>
    </div>
    <div class="summary">
      <div class="kpi"><span>OK Shot</span><strong>${kpis.ok}</strong></div>
      <div class="kpi"><span>Warm Up Shot</span><strong>${kpis.warm}</strong></div>
      <div class="kpi"><span>Off Shot</span><strong>${kpis.off}</strong></div>
      <div class="kpi"><span>Total Shot</span><strong>${reportRows.length}</strong></div>
      <div class="kpi"><span>Shift</span><strong>${kpis.shift}</strong></div>
    </div>
    <div class="table-title">Detailed Production Records</div>
    <table><thead><tr>${header}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length || 1}">No records</td></tr>`}</tbody></table>
    <div class="footer"><span>Rico Auto Industries Limited - IoT Master Data</span><span>${escapeHtml(reportFileBaseName)}</span></div>
  </section>
  <script>window.onload=function(){window.print();};</script>
</body>
</html>`);
    popup.document.close();
  };

  const downloadExcel = () => {
    const header = columns.map((key) => `<th>${escapeHtml(labelize(key))}</th>`).join("");
    const body = reportRows.map((row, index) => (
      `<tr>${columns.map((key) => `<td>${escapeHtml(formatReportCell(row, key, index))}</td>`).join("")}</tr>`
    )).join("");
    downloadHtmlFile(`${reportFileBaseName}.xls`, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px}
    th,td{border:1px solid #94a3b8;padding:6px;white-space:nowrap}
    th{background:#dbeafe;font-weight:800;text-transform:uppercase}
    .title{font-size:18px;font-weight:800}
    .meta{font-size:12px;font-weight:700;color:#475569}
  </style>
</head>
<body>
  <table>
    <tr><td colspan="${columns.length || 1}" class="title">Rico Auto Industries Limited - ${escapeHtml(machineLabel)} Production Report</td></tr>
    <tr><td colspan="${columns.length || 1}" class="meta">Filter: ${escapeHtml(reportFilterLabel)} | Shift: ${escapeHtml(reportShiftLabel)} | Production Date: ${escapeHtml(reportRangeLabel)} | Records: ${reportRows.length}</td></tr>
    <tr>${header}</tr>
    ${body || `<tr><td colspan="${columns.length || 1}">No records</td></tr>`}
  </table>
</body>
</html>`);
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
                <p className="font-black text-slate-900">{reportRows.length}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_DATE_FILTERS.map((filter) => {
                const isActive = activeQuickFilter === filter.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => applyQuickDateFilter(filter.key)}
                    className={`h-9 rounded-lg border px-3 text-xs font-black uppercase tracking-[0.08em] transition ${
                      isActive
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-blue-700">
              Report Filter: {reportFilterLabel} | {reportShiftLabel} | {reportRangeLabel}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_170px_170px_auto_auto_auto] lg:items-end">
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
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Shift</span>
              <select
                value={shiftFilter}
                onChange={(event) => setShiftFilter(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {SHIFT_FILTERS.map((filter) => (
                  <option key={filter.key} value={filter.key}>{filter.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">From</span>
              <input type="date" value={fromDate} onChange={handleFromDateChange} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">To</span>
              <input type="date" value={toDate} onChange={handleToDateChange} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </label>
            <button type="button" onClick={loadReport} className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
              View
            </button>
            <button type="button" onClick={downloadExcel} className="h-11 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700">
              Excel
            </button>
            <button type="button" onClick={downloadPdf} className="h-11 rounded-lg bg-slate-900 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800">
              PDF
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          <KpiCard title="OK Shot" value={kpis.ok} tone="emerald" />
          <KpiCard title="Warm Up Shot" value={kpis.warm} tone="amber" />
          <KpiCard title="Off Shot" value={kpis.off} tone="rose" />
          <KpiCard title="Total Shot" value={reportRows.length} tone="blue" />
          <KpiCard title="Shift" value={kpis.shift} tone="indigo" />
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
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
            Active Filter: {reportFilterLabel} | {reportShiftLabel} | {reportRangeLabel} | Latest records first
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
                {reportRows.map((row, index) => (
                  <tr key={row.id || `${row.recorded_at}-${index}`} className="border-b border-slate-100 hover:bg-slate-50">
                    {columns.map((key) => (
                      <td key={key} className="border-r border-slate-100 px-4 py-2.5 text-center align-middle font-semibold leading-tight text-slate-800 last:border-r-0">
                        {formatReportCell(row, key, index)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!reportRows.length && !loading && (
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
