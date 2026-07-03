import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Download } from "lucide-react";
import AppLayout from "../../../components/common/AppLayout";
import ricoLogo from "../../../assets/rico-logo.png";
import { DISPLAY_LABELS } from "../../plc-monitor/constants";
import { normalizeDisplayValue } from "../../plc-monitor/utils/plcFormatters";
import {
  getLineMachines,
  getLines,
  getPlcLatestReadings,
  getPlcReadingHistory,
} from "../../../services/api";

const DEFAULT_MACHINE = {
  machine_key: "",
  machine_name: "Machine",
  plc_ip: "",
  plc_port: "",
};

const REPORT_AUTO_REFRESH_MS = Number(import.meta.env.VITE_PLC_REPORT_REFRESH_MS || 5000);
const REPORT_PAGE_SIZE = Number(import.meta.env.VITE_PLC_REPORT_PAGE_SIZE || 100);
const REPORT_EXPORT_PAGE_SIZE = Number(import.meta.env.VITE_PLC_REPORT_EXPORT_PAGE_SIZE || 20000);

const HIDDEN_COLUMNS = new Set([
  "id",
  "history_rank",
  "recorded_at",
  "shot_datetime",
  "production_date",
  "shot_day",
  "shot_fwd_time_sec",
  "shot_fwd_time_sec_value",
  "shot_hour",
  "shot_minute",
  "shot_month",
  "shot_second",
  "shot_year",
  "machine_name",
  "machine_key",
  "counter",
  "high_shot",
  "high_shot_count",
  "ng_counter_value",
  "ok_shot",
  "ng_counter",
  "plc_ip",
  "plc_port",
  "cycle_start",
  "cycle_start_time",
  "cycle_complete",
  "cycle_end",
  "cycle_end_time",
  "machine_breakdown",
  "minor_stoppage",
  "minor_stoppage_machine",
  "minor_stoppage_start_time",
  "minor_stoppage_end_time",
  "minor_stoppage_bit",
  "stoppage_duration_sec",
  "stoppage_type",
  "vacuum_pressure_mmhg",
  "raw_readings_json",
  "created_at",
  "machine_type",
  "has_data",
  "is_online",
  "error",
]);

const LEAK_TEST_HIDDEN_COLUMNS = new Set([
  "auto_bit",
  "part_name",
  "part_qr_code",
  "scan_source_device",
]);

const SERIAL_COLUMN = "serial_number";
const SHIFT_COLUMN = "shift";

const GAUGE_REPORT_COLUMNS = [
  SERIAL_COLUMN,
  "scan_data",
  "scan_time",
  SHIFT_COLUMN,
  "cycle_time_in_sec",
  "gauge_judgement",
];

const NOT_AVAILABLE_COLUMNS = new Set([
  "fix_1_flow",
  "fix_2_flow",
  "fix_3_flow",
  "mov_1_flow",
  "mov_2_flow",
  "mov_3_flow",
]);

const PREFERRED_COLUMNS = [
  SERIAL_COLUMN,
  "recorded_at",
  "plc_ip",
  "plc_port",
  "scan_data",
  "part_name",
  "shot_date",
  "shot_time",
  SHIFT_COLUMN,
  "shot_number",
  "shot_status",
  "cycle_time",
];

const SHOT_STATUS = {
  1: { label: "OK", tone: "emerald" },
  3: { label: "Warm Up", tone: "amber" },
  5: { label: "NG", tone: "rose" },
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

const SHOT_RESULT_FILTERS = [
  { key: "all", label: "All Result" },
  { key: "ok", label: "OK", status: 1 },
  { key: "warm", label: "Warm Up", status: 3 },
  { key: "ng", label: "NG", status: 5 },
];

const REPORT_LABELS = {
  ...DISPLAY_LABELS,
  shot_status: "Shot Result",
  scan_data: "Scan Data",
  scan_time: "Scan Time",
  cycle_time_in_sec: "Cycle Time (sec)",
  gauge_judgement: "Receiving Gauge Judgement",
  ok_shot: "High Shot Count",
  ng_counter: "NG Counter",
  die_close_core_in_time: "Die-Close Core In Time",
  shot_fwd_time: "Shot FWD Time",
  curing_time: "Curing Time (Cooling Time)",
  die_open_core_out_time: "Die Open Core Out Time",
  extract_time: "Extract Time",
  v1_speed: "V1",
  v2_speed: "V2",
  v3_speed: "V3",
  v4_speed: "V4",
  metal_pressure: "Metal Press.",
  furnace_metal_temp: "Furnace Metal Temp.",
  cooling_water_mov: "Cooling Water Flow Rate (Mov.)",
  cooling_water_sta: "Cooling Water Flow Rate (Sta.)",
  accel_point: "Accel. Point",
  deaccel_point: "Deaccel. Point",
  intensification_time: "Inten. Time",
  biscuit_thickness: "Biscuit Thickness",
  jet_cooling_pressure: "Jet Cooling Pressure",
  clamp_tonnage_he_low_pct: "Clamp Tonnage (HE.Low)",
  clamp_tonnage_he_low_mn: "Clamp Tonnage (HE.Low)",
  clamp_tonnage_op_up_pct: "Clamp Tonnage (OP.Up)",
  clamp_tonnage_op_low_pct: "Clamp Tonnage (OP.Low)",
  clamp_tonnage_he_up_pct: "Clamp Tonnage (HE.Up)",
  vacuum_pressure: "Vacuum Pressure",
  clamp_force_pct: "Clamp Force",
  clamp_tonnage: "Clamp Tonnage",
  shot_acc_pressure: "Shot Acc. Pressure",
  intensification_acc_pressure: "Intensification Acc. Pressure",
  fixed_die_temp_f1: "Fixed Die Temp (F-1)",
  fixed_die_temp_f2: "Fixed Die Temp (F-2)",
  moving_die_temp_m1: "Moving Die Temp (M-1)",
  moving_die_temp_m2: "Moving Die Temp (M-2)",
  slide_temp_s1: "Slide Temp -1 (S-1)",
  fix_1_flow: "FIX. 1 Flow",
  fix_2_flow: "FIX. 2 Flow",
  fix_3_flow: "FIX. 3 Flow",
  mov_1_flow: "Mov. 1 Flow",
  mov_2_flow: "Mov. 2 Flow",
  mov_3_flow: "Mov. 3 Flow",
  vacuum_pressure_mmhg: "Vacuum Pressure",
  average_die_clamp_tonnage_count: "Average Die Clamp Tonnage Count",
  time_for_stroke: "Time for Stroke",
  stroke: "Stroke",
};

const REPORT_UNITS = {
  cycle_time: "sec",
  die_close_core_in_time: "sec",
  pouring_time: "sec",
  shot_fwd_time: "sec",
  curing_time: "sec",
  die_open_core_out_time: "sec",
  ejector_time: "sec",
  extract_time: "sec",
  spray_time: "sec",
  v1_speed: "m/sec",
  v2_speed: "m/sec",
  v3_speed: "m/sec",
  v4_speed: "m/sec",
  metal_pressure: "MPa",
  furnace_metal_temp: "°C",
  cooling_water_mov: "L/min",
  cooling_water_sta: "L/min",
  accel_point: "mm",
  deaccel_point: "mm",
  intensification_time: "msec",
  biscuit_thickness: "mm",
  jet_cooling_pressure: "kgf/cm2",
  clamp_tonnage_he_low_pct: "%",
  clamp_tonnage_he_low_mn: "MN",
  clamp_tonnage_op_up_pct: "%",
  clamp_tonnage_op_low_pct: "%",
  clamp_tonnage_he_up_pct: "%",
  vacuum_pressure: "mbar",
  clamp_force_pct: "%",
  clamp_tonnage: "T",
  shot_acc_pressure: "MPa",
  intensification_acc_pressure: "MPa",
  fixed_die_temp_f1: "°C",
  fixed_die_temp_f2: "°C",
  moving_die_temp_m1: "°C",
  moving_die_temp_m2: "°C",
  slide_temp_s1: "°C",
  fix_1_flow: "Lpm",
  fix_2_flow: "Lpm",
  fix_3_flow: "Lpm",
  mov_1_flow: "Lpm",
  mov_2_flow: "Lpm",
  mov_3_flow: "Lpm",
  vacuum_pressure_mmhg: "mmHg",
  average_die_clamp_tonnage_count: "T",
  time_for_stroke: "ms",
  stroke: "mm",
};

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

function getShotResultFilterLabel(key) {
  return SHOT_RESULT_FILTERS.find((filter) => filter.key === key)?.label || "All Result";
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
  if (normalizeColumnKey(key) === "shot_number") return "Machine Shot Number";
  const normalizedKey = normalizeColumnKey(key);
  const baseLabel = REPORT_LABELS[normalizedKey] || String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const unit = REPORT_UNITS[normalizedKey];
  return unit ? `${baseLabel} (${unit})` : baseLabel;
}

function normalizeColumnKey(key) {
  return String(key || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isStoppageOrBreakdownColumn(key) {
  return key.includes("stoppage") || key.includes("stopage") || key.includes("breakdown");
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
  const productionDate = normalizeDateInput(getRowValue(row, "production_date", "Production Date"));
  if (!calendarDate) return productionDate;
  const timeParts = getRowTimeParts(row);
  const shift = getShiftFromTimeParts(timeParts);
  const seconds = getSecondsFromTimeParts(timeParts);
  if (shift === "C" && seconds !== null && seconds < 6 * 3600) {
    return addDaysToInputDate(calendarDate, -1);
  }
  return productionDate || calendarDate;
}

function formatTimeParts12Hour(parts) {
  if (!parts) return "-";
  const period = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${String(hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")} ${period}`;
}

function isRowInProductionFilter(row = {}, fromDate, toDate, shiftFilter, shotResultFilter = "all") {
  const productionDate = getRowProductionDate(row);
  if (!productionDate || productionDate < fromDate || productionDate > toDate) return false;
  const rowShift = getRowShift(row);
  if (shiftFilter !== "all" && rowShift !== shiftFilter) return false;
  const resultFilter = SHOT_RESULT_FILTERS.find((filter) => filter.key === shotResultFilter);
  if (!resultFilter?.status) return true;
  return Number(row.shot_status ?? row["Shot Status"]) === resultFilter.status;
}

function shotStatusLabel(value) {
  const status = Number(value);
  if (status === 1) return "OK";
  if (status === 3) return "Warm Up";
  if (status === 5) return "NG";
  return "-";
}

function formatValue(value, key) {
  if (NOT_AVAILABLE_COLUMNS.has(normalizeColumnKey(key))) return "N/A";
  if (value === null || value === undefined || value === "") return "-";
  const normalizedKey = normalizeColumnKey(key);
  const displayValue = normalizeDisplayValue(key, value);
  if (normalizedKey === "biscuit_thickness") return String(displayValue);
  if (key === "recorded_at" || key === "cycle_end_time") return formatDateTime(value);
  if (key === "shot_date") return formatDateOnly(value);
  if (key === "shot_time") return formatTimeOnly(value);
  if (normalizedKey === "shot_status") {
    return shotStatusLabel(value);
  }
  return String(displayValue);
}

function formatReportCell(row, key, rowIndex = 0, rowCount = 0, rows = []) {
  if (key === SERIAL_COLUMN) return Math.max(1, rowCount - rowIndex);
  if (key === SHIFT_COLUMN) return getRowShift(row);
  if (key === "scan_time") return formatTimeParts12Hour(getRowTimeParts(row));
  if (normalizeColumnKey(key) === "scan_data") {
    return formatValue(row.scan_data || row.part_scan_data || row.part_qr_code || row.part_name, key);
  }
  // The production day runs from 06:00 to 05:59. For C-shift rows after
  // midnight, display the previous production date.
  if (key === "shot_date") return formatDateOnly(getRowProductionDate(row) || row[key]);
  if (key === "shot_time") {
    return formatTimeParts12Hour(getRowTimeParts(row));
  }
  if (normalizeColumnKey(key) === "ng_counter" && rowIndex > 0) {
    const previousValue = rows[rowIndex - 1]?.[key];
    const currentValue = row[key];
    if (
      currentValue !== null &&
      currentValue !== undefined &&
      currentValue !== "" &&
      String(currentValue) === String(previousValue)
    ) {
      return "-";
    }
  }
  return formatValue(row[key], key);
}

function isHighlightedReportCell(row = {}, key) {
  return false;
}

function reportCellHtmlAttrs(row, key) {
  return isHighlightedReportCell(row, key) ? ' class="alarm-cell"' : "";
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
  return machine?.machine_key || machine?.plc_ip || machine?.ip_address || machine?.id || DEFAULT_MACHINE.machine_key;
}

function getMachineReportIp(machine) {
  return machine?.plc_ip || machine?.ip_address || machine?.ip || machine?.machine_key || DEFAULT_MACHINE.plc_ip;
}

function getMachineLabel(machine) {
  return machine?.machine_name || machine?.name || machine?.plc_ip || machine?.ip_address || getMachineId(machine);
}

const machineNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function getMachineSortParts(machine) {
  const label = getMachineLabel(machine);
  const normalized = String(label || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/([a-z])\s+(\d)/gi, "$1$2")
    .replace(/(\d)\s+([a-z])/gi, "$1$2");
  const match = normalized.match(/^(.*?)(?:-?\s*0*(\d+))$/);
  return {
    family: match ? match[1].replace(/[-\s]+$/g, "") : normalized,
    number: match ? Number(match[2]) : Number.MAX_SAFE_INTEGER,
    label: normalized,
  };
}

function sortMachinesBySeries(source = []) {
  return [...source].sort((a, b) => {
    const aParts = getMachineSortParts(a);
    const bParts = getMachineSortParts(b);
    const familyDiff = machineNameCollator.compare(aParts.family, bParts.family);
    if (familyDiff !== 0) return familyDiff;
    if (aParts.number !== bParts.number) return aParts.number - bParts.number;
    return machineNameCollator.compare(aParts.label, bParts.label);
  });
}

function inferMachineKind(machine = {}, rows = []) {
  const explicitKind = machine.machine_type || machine.kind || machine.machineType;
  if (explicitKind) return String(explicitKind).toLowerCase();
  const machineText = [
    machine.machine_name,
    machine.name,
    machine.machine_key,
    machine.machine_code,
  ].join(" ").toLowerCase();
  if (machineText.includes("gauge")) return "gauge";
  if (machineText.includes("leak")) return "leaktest";
  if (rows.some((row) => row?.part_scan_data !== undefined || row?.gauge_status !== undefined || row?.gauge_judgement !== undefined)) return "gauge";
  if (rows.some((row) => String(row?.machine_type || row?.kind || "").toLowerCase() === "leaktest")) return "leaktest";
  return "ube";
}

function normalizeMachineIdentity(value) {
  const compact = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b0+(\d+)\b/g, "$1")
    .replace(/[^a-z0-9]+/g, "");
  return compact || "";
}

function getMachineDedupeKeys(machine = {}) {
  const ip = String(machine.plc_ip || machine.ip_address || machine.ip || "").trim().toLowerCase();
  const labels = [
    machine.machine_key,
    machine.machine_name,
    machine.name,
    machine.machine_code,
  ].map(normalizeMachineIdentity).filter(Boolean);
  return [
    ip ? `ip:${ip}` : "",
    ...labels.map((label) => `name:${label}`),
  ].filter(Boolean);
}

function dedupeMachines(source = []) {
  const rows = [];
  const indexByKey = new Map();

  source.forEach((machine) => {
    if (!machine) return;
    const keys = getMachineDedupeKeys(machine);
    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index !== undefined);
    if (existingIndex !== undefined) {
      rows[existingIndex] = {
        ...machine,
        ...rows[existingIndex],
        line_id: rows[existingIndex].line_id || machine.line_id,
        machine_type: inferMachineKind(rows[existingIndex], []) !== "ube"
          ? inferMachineKind(rows[existingIndex], [])
          : inferMachineKind(machine, []),
        kind: inferMachineKind(rows[existingIndex], []) !== "ube"
          ? inferMachineKind(rows[existingIndex], [])
          : inferMachineKind(machine, []),
        plc_ip: rows[existingIndex].plc_ip || machine.plc_ip || machine.ip_address || machine.ip,
        plc_port: rows[existingIndex].plc_port || machine.plc_port || machine.port,
      };
      getMachineDedupeKeys(rows[existingIndex]).forEach((key) => indexByKey.set(key, existingIndex));
      return;
    }

    const nextIndex = rows.length;
    rows.push(machine);
    keys.forEach((key) => indexByKey.set(key, nextIndex));
  });

  return rows;
}

function getLineId(line) {
  return line?.line_id ? String(line.line_id) : "";
}

function getLineLabel(line) {
  return line?.line_name || line?.line_code || `Line ${getLineId(line)}`;
}

function getNumericId(row = {}) {
  const value = getRowValue(row, "id", "ID", "Id");
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function getRowSortTime(row = {}) {
  const shotParts = getRowTimeParts(row);
  const shotTime = shotParts
    ? `${String(shotParts.hour).padStart(2, "0")}:${String(shotParts.minute).padStart(2, "0")}:${String(shotParts.second).padStart(2, "0")}`
    : null;
  const candidates = [
    row.cycle_end_time,
    row.shot_datetime,
    row.recorded_at,
    row.created_at,
    row.cycle_end,
    row.shot_date && shotTime ? `${row.shot_date}T${shotTime}` : null,
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
    const timeDiff = getRowSortTime(b) - getRowSortTime(a);
    if (timeDiff !== 0) return timeDiff;
    const aId = getNumericId(a);
    const bId = getNumericId(b);
    if (aId !== null && bId !== null && aId !== bId) return bId - aId;
    return 0;
  });
}

function isLeakTestMachine(machine = {}, rows = []) {
  return inferMachineKind(machine, rows) === "leaktest";
}

function isGaugeMachine(machine = {}, rows = []) {
  return inferMachineKind(machine, rows) === "gauge";
}

function isHiddenForReport(key, hideLeakTestFields = false, isGauge = false) {
  const normalizedKey = normalizeColumnKey(key);
  if (isGauge && ["cycle_start", "cycle_complete"].includes(normalizedKey)) return false;
  return (
    HIDDEN_COLUMNS.has(normalizedKey) ||
    isStoppageOrBreakdownColumn(normalizedKey) ||
    (hideLeakTestFields && LEAK_TEST_HIDDEN_COLUMNS.has(normalizedKey))
  );
}

function buildColumns(rows, options = {}) {
  const hideLeakTestFields = Boolean(options.hideLeakTestFields);
  const isGauge = Boolean(options.isGauge);
  if (isGauge) return GAUGE_REPORT_COLUMNS;

  const keys = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!isHiddenForReport(key, hideLeakTestFields, isGauge)) keys.add(key);
    });
  });
  if (rows.length) {
    keys.add(SERIAL_COLUMN);
    keys.add(SHIFT_COLUMN);
    if (hideLeakTestFields && rows.some((row) => row?.scan_data || row?.part_qr_code || row?.part_name)) {
      keys.add("scan_data");
    }
    if (rows.some((row) => getRowTimeParts(row))) keys.add("shot_time");
  }
  return [
    ...PREFERRED_COLUMNS.filter((key) => keys.has(key) && !isHiddenForReport(key, hideLeakTestFields, isGauge)),
    ...Array.from(keys)
      .filter((key) => !PREFERRED_COLUMNS.includes(key))
      .filter((key) => !isHiddenForReport(key, hideLeakTestFields, isGauge))
      .sort((a, b) => labelize(a).localeCompare(labelize(b))),
  ];
}

function getColumnWidth(key) {
  const normalizedKey = normalizeColumnKey(key);
  if (key === SERIAL_COLUMN) return 72;
  if (key === SHIFT_COLUMN) return 88;
  if (key === "recorded_at") return 150;
  if (key === "machine_name") return 140;
  if (["part_name", "part_qr_code", "scan_data", "part_scan_data"].includes(normalizedKey)) return 240;
  if (key === "shot_status") return 135;
  if (key === "average_die_clamp_tonnage_count") return 230;
  if (String(key).length > 24) return 190;
  if (String(key).length > 16) return 155;
  return 118;
}

function KpiCard({ title, value, tone }) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "border-amber-200 bg-amber-50 text-amber-700 ring-amber-100",
    rose: "border-rose-200 bg-rose-50 text-rose-700 ring-rose-100",
    blue: "border-blue-200 bg-blue-50 text-blue-700 ring-blue-100",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 ring-indigo-100",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700 ring-cyan-100",
  }[tone] || "border-slate-200 bg-white text-slate-700";

  return (
    <div className={`flex min-h-[104px] flex-col items-center justify-center rounded-lg border px-4 py-4 text-center shadow-sm ring-1 ${toneClass}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.12em] opacity-80">{title}</p>
      <p className="mt-2 flex min-h-[38px] items-center justify-center text-3xl font-black leading-none sm:text-[34px]">
        {value}
      </p>
    </div>
  );
}

export default function PlcReportPage({ onLogout, currentUser }) {
  const [searchParams] = useSearchParams();
  const [machines, setMachines] = useState([DEFAULT_MACHINE]);
  const [lines, setLines] = useState([]);
  const [machinesByLine, setMachinesByLine] = useState({});
  const [selectedLineId, setSelectedLineId] = useState("all");
  const [selectedMachineId, setSelectedMachineId] = useState(getMachineId(DEFAULT_MACHINE));
  const [draftLineId, setDraftLineId] = useState("all");
  const [draftMachineId, setDraftMachineId] = useState(getMachineId(DEFAULT_MACHINE));
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [activeQuickFilter, setActiveQuickFilter] = useState("today");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [shotResultFilter, setShotResultFilter] = useState("all");
  const [shotNumberFilter, setShotNumberFilter] = useState("");
  const [draftFromDate, setDraftFromDate] = useState(fromDate);
  const [draftToDate, setDraftToDate] = useState(toDate);
  const [draftQuickFilter, setDraftQuickFilter] = useState(activeQuickFilter);
  const [draftShiftFilter, setDraftShiftFilter] = useState(shiftFilter);
  const [draftShotResultFilter, setDraftShotResultFilter] = useState(shotResultFilter);
  const [draftShotNumberFilter, setDraftShotNumberFilter] = useState("");
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: REPORT_PAGE_SIZE, total: 0, totalPages: 1 });
  const [serverKpis, setServerKpis] = useState({
    ok: 0,
    warm: 0,
    off: 0,
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const tableScrollRef = useRef(null);
  const reportSearch = (searchParams.get("search") || "").trim();

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getPlcLatestReadings(),
      getLines(),
    ])
      .then(async ([latestResult, linesResult]) => {
        if (!active) return;
        const latestResponse = latestResult.status === "fulfilled" ? latestResult.value : null;
        const next = Array.isArray(latestResponse?.data?.data) && latestResponse.data.data.length
          ? latestResponse.data.data
          : [DEFAULT_MACHINE];
        setMachines(next);
        const lineRows = linesResult.status === "fulfilled" && Array.isArray(linesResult.value.data?.data)
          ? linesResult.value.data.data
          : [];
        setLines(lineRows);
        const machineEntries = await Promise.all(lineRows.map(async (line) => {
          try {
            const machineResponse = await getLineMachines(line.line_id);
            return [getLineId(line), Array.isArray(machineResponse.data?.data) ? machineResponse.data.data : []];
          } catch {
            return [getLineId(line), []];
          }
        }));
        if (!active) return;
        setMachinesByLine(Object.fromEntries(machineEntries));
      })
      .catch(() => {
        if (active) setMachines([DEFAULT_MACHINE]);
      });
    return () => { active = false; };
  }, []);

  const allReportMachines = useMemo(() => {
    const rows = [...machines];
    Object.values(machinesByLine).flat().forEach((machine) => {
      const ip = machine.ip_address || machine.plc_ip || machine.ip;
      rows.push({
        machine_key: machine.machine_key || machine.machine_code || ip,
        machine_name: machine.machine_name || machine.name || machine.machine_code || ip,
        machine_code: machine.machine_code,
        name: machine.name,
        machine_type: inferMachineKind(machine),
        kind: inferMachineKind(machine),
        plc_ip: ip,
        plc_port: machine.port || machine.plc_port || 5002,
        line_id: machine.line_id,
      });
    });
    return sortMachinesBySeries(dedupeMachines(rows));
  }, [machines, machinesByLine]);

  const getMachinesForLine = useCallback((lineId) => {
    if (!lineId || lineId === "all") return allReportMachines;
    const lineMachines = machinesByLine[lineId] || [];
    const lineKeys = new Set(lineMachines.flatMap(getMachineDedupeKeys));
    const matched = allReportMachines.filter((machine) =>
      getMachineDedupeKeys(machine).some((key) => lineKeys.has(key))
    );
    if (matched.length) return sortMachinesBySeries(matched);
    return sortMachinesBySeries(dedupeMachines(lineMachines
      .map((machine) => {
        const ip = machine.ip_address || machine.plc_ip || machine.ip;
        if (!ip) return null;
        return {
          machine_key: machine.machine_key || machine.machine_code || ip,
          machine_name: machine.machine_name || machine.name || machine.machine_code || ip,
          machine_code: machine.machine_code,
          name: machine.name,
          machine_type: inferMachineKind(machine),
          kind: inferMachineKind(machine),
          plc_ip: ip,
          plc_port: machine.port || machine.plc_port || 5002,
          line_id: machine.line_id || lineId,
        };
      })
      .filter(Boolean)));
  }, [allReportMachines, machinesByLine]);

  const activeMachineOptions = useMemo(
    () => getMachinesForLine(selectedLineId),
    [getMachinesForLine, selectedLineId]
  );

  const draftMachineOptions = useMemo(
    () => getMachinesForLine(draftLineId),
    [draftLineId, getMachinesForLine]
  );

  useEffect(() => {
    if (!activeMachineOptions.length) return;
    if (activeMachineOptions.some((machine) => String(getMachineId(machine)) === String(selectedMachineId))) return;
    const nextId = getMachineId(activeMachineOptions[0]);
    setSelectedMachineId(nextId);
    setDraftMachineId(nextId);
  }, [activeMachineOptions, selectedMachineId]);

  useEffect(() => {
    if (!draftMachineOptions.length) return;
    if (draftMachineOptions.some((machine) => String(getMachineId(machine)) === String(draftMachineId))) return;
    setDraftMachineId(getMachineId(draftMachineOptions[0]));
  }, [draftMachineId, draftMachineOptions]);

  const selectedMachine = useMemo(
    () => activeMachineOptions.find((machine) => getMachineId(machine) === selectedMachineId) || activeMachineOptions[0] || DEFAULT_MACHINE,
    [activeMachineOptions, selectedMachineId]
  );

  const searchMatchedMachineId = useMemo(() => {
    const q = reportSearch.toLowerCase();
    if (!q) return "";
    const match = allReportMachines.find((machine) =>
      [
        getMachineId(machine),
        getMachineLabel(machine),
        getMachineReportIp(machine),
        machine.machine_name,
        machine.name,
      ].some((value) => String(value || "").toLowerCase().includes(q))
    );
    return match ? getMachineId(match) : "";
  }, [allReportMachines, reportSearch]);

  useEffect(() => {
    if (!searchMatchedMachineId || String(selectedMachineId) === String(searchMatchedMachineId)) return;
    setSelectedLineId("all");
    setDraftLineId("all");
    setSelectedMachineId(searchMatchedMachineId);
    setDraftMachineId(searchMatchedMachineId);
  }, [searchMatchedMachineId, selectedMachineId]);

  const applyQuickDateFilter = useCallback((key) => {
    const range = getQuickDateRange(key);
    setDraftQuickFilter(key);
    setDraftFromDate(range.from);
    setDraftToDate(range.to);
  }, []);

  const handleFromDateChange = useCallback((event) => {
    setDraftQuickFilter("custom");
    setDraftFromDate(event.target.value);
  }, []);

  const handleToDateChange = useCallback((event) => {
    setDraftQuickFilter("custom");
    setDraftToDate(event.target.value);
  }, []);

  const applyReportFilters = useCallback(() => {
    setSelectedLineId(draftLineId);
    setSelectedMachineId(draftMachineId);
    setActiveQuickFilter(draftQuickFilter);
    setFromDate(draftFromDate);
    setToDate(draftToDate);
    setShiftFilter(draftShiftFilter);
    setShotResultFilter(draftShotResultFilter);
    setShotNumberFilter(draftShotNumberFilter.trim());
    setPagination((current) => ({ ...current, page: 1 }));
  }, [draftFromDate, draftLineId, draftMachineId, draftQuickFilter, draftShiftFilter, draftShotNumberFilter, draftShotResultFilter, draftToDate]);

  const clearReportFilters = useCallback(() => {
    const range = getQuickDateRange("today");
    setDraftLineId("all");
    setSelectedLineId("all");
    setDraftMachineId(getMachineId(DEFAULT_MACHINE));
    setSelectedMachineId(getMachineId(DEFAULT_MACHINE));
    setDraftQuickFilter("today");
    setActiveQuickFilter("today");
    setDraftFromDate(range.from);
    setFromDate(range.from);
    setDraftToDate(range.to);
    setToDate(range.to);
    setDraftShiftFilter("all");
    setShiftFilter("all");
    setDraftShotResultFilter("all");
    setShotResultFilter("all");
    setDraftShotNumberFilter("");
    setShotNumberFilter("");
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextShotNumber = draftShotNumberFilter.trim();
      setShotNumberFilter((current) => current === nextShotNumber ? current : nextShotNumber);
      setPagination((current) => current.page === 1 ? current : { ...current, page: 1 });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftShotNumberFilter]);

  const loadReport = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await getPlcReadingHistory({
        ip: getMachineReportIp(selectedMachine),
        from: fromDate,
        to: toDate,
        page: pagination.page,
        pageSize: pagination.pageSize,
        shift: shiftFilter,
        shotResult: shotResultFilter,
        shotNumber: shotNumberFilter,
      });
      const nextRows = Array.isArray(response.data?.data) ? response.data.data : [];
      setRows(sortRowsLatestFirst(nextRows));
      setPagination((current) => response.data?.pagination ? {
        page: response.data.pagination.page || current.page,
        pageSize: response.data.pagination.pageSize || current.pageSize,
        total: response.data.pagination.total || 0,
        totalPages: response.data.pagination.totalPages || 1,
      } : { ...current, total: nextRows.length, totalPages: 1 });
      setServerKpis({
        ok: Number(response.data?.kpis?.ok || 0),
        warm: Number(response.data?.kpis?.warm || 0),
        off: Number(response.data?.kpis?.off || 0),
      });
    } catch (err) {
      if (!silent) setRows([]);
      if (!silent) setPagination((current) => ({ ...current, total: 0, totalPages: 1 }));
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to load PLC report.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fromDate, pagination.page, pagination.pageSize, selectedMachine, shiftFilter, shotNumberFilter, shotResultFilter, toDate]);

  useEffect(() => {
    loadReport();
    const timer = window.setInterval(() => {
      loadReport({ silent: true });
    }, REPORT_AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadReport]);

  const filteredRows = useMemo(() => rows, [rows]);

  const hideLeakTestFields = useMemo(
    () => isLeakTestMachine(selectedMachine, filteredRows),
    [filteredRows, selectedMachine]
  );
  const showGaugeFields = useMemo(
    () => isGaugeMachine(selectedMachine, filteredRows),
    [filteredRows, selectedMachine]
  );

  const columns = useMemo(
    () => buildColumns(filteredRows, { hideLeakTestFields, isGauge: showGaugeFields }),
    [filteredRows, hideLeakTestFields, showGaugeFields]
  );

  const reportRows = useMemo(
    () => sortRowsLatestFirst(filteredRows),
    [filteredRows]
  );

  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = 0;
      tableScrollRef.current.scrollTop = 0;
    }
  }, [columns.length, fromDate, selectedMachineId, shiftFilter, shotNumberFilter, shotResultFilter, toDate]);
  const kpis = useMemo(() => {
    const counts = {
      ok: serverKpis.ok,
      warm: serverKpis.warm,
      off: serverKpis.off,
      totalProduction: pagination.total,
      shift: shiftFilter === "all" ? "All" : shiftFilter,
    };
    if (pagination.total) return counts;
    reportRows.forEach((row) => {
      const value = Number(row.shot_status ?? row["Shot Status"]);
      if (value === 1) counts.ok += 1;
      if (value === 3) counts.warm += 1;
      if (value === 5) counts.off += 1;
    });
    if (!reportRows.length) counts.shift = shiftFilter === "all" ? "All" : shiftFilter;
    return counts;
  }, [pagination.total, reportRows, serverKpis, shiftFilter]);

  const reportRangeLabel = `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`;
  const reportFilterLabel = getQuickFilterLabel(activeQuickFilter);
  const reportShiftLabel = getShiftFilterLabel(shiftFilter);
  const reportShotResultLabel = getShotResultFilterLabel(shotResultFilter);
  const activeLineLabel = selectedLineId === "all"
    ? "All Lines"
    : getLineLabel(lines.find((line) => getLineId(line) === String(selectedLineId)) || { line_name: "Selected Line" });
  const machineLabel = selectedMachine?.machine_name || selectedMachine?.plc_ip || "Machine";
  const reportFileBaseName = [
    "rico-production-report",
    slugify(machineLabel),
    slugify(reportFilterLabel),
    slugify(reportShiftLabel),
    slugify(reportShotResultLabel),
    fromDate,
    toDate,
  ].filter(Boolean).join("-");

  const loadAllReportRows = useCallback(async () => {
    const allRows = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await getPlcReadingHistory({
        ip: getMachineReportIp(selectedMachine),
        from: fromDate,
        to: toDate,
        page,
        pageSize: REPORT_EXPORT_PAGE_SIZE,
        shift: shiftFilter,
        shotResult: shotResultFilter,
        shotNumber: shotNumberFilter,
      });
      const pageRows = Array.isArray(response.data?.data) ? response.data.data : [];
      allRows.push(...pageRows);
      totalPages = Number(response.data?.pagination?.totalPages || 1);
      page += 1;
    } while (page <= totalPages);

    return sortRowsLatestFirst(allRows);
  }, [fromDate, selectedMachine, shiftFilter, shotNumberFilter, shotResultFilter, toDate]);

  const downloadPdf = async () => {
    setExporting(true);
    let exportRows;
    try {
      exportRows = await loadAllReportRows();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to prepare the complete report.");
      setExporting(false);
      return;
    }
    setExporting(false);
    const exportColumns = buildColumns(exportRows, {
      hideLeakTestFields: isLeakTestMachine(selectedMachine, exportRows),
      isGauge: isGaugeMachine(selectedMachine, exportRows),
    });
    const title = `${machineLabel} Production Report`;
    const generatedAt = formatDateTime(new Date());
    const header = exportColumns.map((key) => `<th>${escapeHtml(labelize(key))}</th>`).join("");
    const body = exportRows.map((row, index) => (
      `<tr>${exportColumns.map((key) => `<td${reportCellHtmlAttrs(row, key)}>${escapeHtml(formatReportCell(row, key, index, exportRows.length, exportRows))}</td>`).join("")}</tr>`
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
    .alarm-cell{background:#fee2e2!important;color:#991b1b!important;font-weight:900}
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
        <div class="meta">${escapeHtml(reportFilterLabel)} | ${escapeHtml(reportShiftLabel)} | ${escapeHtml(reportShotResultLabel)} | ${escapeHtml(reportRangeLabel)} | ${exportRows.length} records</div>
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
      <div class="detail"><span>Filter</span><strong>${escapeHtml(reportFilterLabel)} / ${escapeHtml(reportShiftLabel)} / ${escapeHtml(reportShotResultLabel)}</strong></div>
    </div>
    <div class="summary">
      <div class="kpi"><span>OK Shot</span><strong>${kpis.ok}</strong></div>
      <div class="kpi"><span>Warm Up Shot</span><strong>${kpis.warm}</strong></div>
      <div class="kpi"><span>Off Shot</span><strong>${kpis.off}</strong></div>
      <div class="kpi"><span>Total Production</span><strong>${kpis.totalProduction}</strong></div>
      <div class="kpi"><span>Shift</span><strong>${kpis.shift}</strong></div>
    </div>
    <div class="table-title">Detailed Production Records</div>
    <table><thead><tr>${header}</tr></thead><tbody>${body || `<tr><td colspan="${exportColumns.length || 1}">No records</td></tr>`}</tbody></table>
    <div class="footer"><span>Rico Auto Industries Limited - IoT Master Data</span><span>${escapeHtml(reportFileBaseName)}</span></div>
  </section>
  <script>window.onload=function(){window.print();};</script>
</body>
</html>`);
    popup.document.close();
  };

  const downloadExcel = async () => {
    setExporting(true);
    let exportRows;
    try {
      exportRows = await loadAllReportRows();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to prepare the complete report.");
      setExporting(false);
      return;
    }
    setExporting(false);
    const exportColumns = buildColumns(exportRows, {
      hideLeakTestFields: isLeakTestMachine(selectedMachine, exportRows),
      isGauge: isGaugeMachine(selectedMachine, exportRows),
    });
    const colSpan = Math.max(exportColumns.length || 1, 8);
    const generatedAt = formatDateTime(new Date());
    const header = exportColumns.map((key) => `<th>${escapeHtml(labelize(key))}</th>`).join("");
    const body = exportRows.map((row, index) => (
      `<tr>${exportColumns.map((key) => `<td${reportCellHtmlAttrs(row, key)}>${escapeHtml(formatReportCell(row, key, index, exportRows.length, exportRows))}</td>`).join("")}</tr>`
    )).join("");
    downloadHtmlFile(`${reportFileBaseName}.xls`, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11px;color:#0f172a}
    th,td{border:1px solid #b7c4d6;padding:6px;white-space:nowrap;vertical-align:middle}
    .section{background:#eef3f8;color:#173f78;font-size:12px;font-weight:800;text-transform:uppercase}
    .label{background:#f8fafc;color:#173f78;font-weight:800}
    .value{background:#ffffff;font-weight:700}
    .summary-label{background:#f8fafc;color:#475569;font-weight:800;text-align:center}
    .summary-ok{color:#008060;font-size:16px;font-weight:900;text-align:center}
    .summary-warm{color:#b45309;font-size:16px;font-weight:900;text-align:center}
    .summary-off{color:#be123c;font-size:16px;font-weight:900;text-align:center}
    .summary-total{color:#1d4ed8;font-size:16px;font-weight:900;text-align:center}
    .summary-shift{color:#4338ca;font-size:16px;font-weight:900;text-align:center}
    th{background:#173f78;color:#ffffff;font-weight:800;text-transform:uppercase;text-align:center}
    tbody td{mso-number-format:"\\@";font-weight:600}
    tbody tr:nth-child(even) td{background:#f8fbff}
    .alarm-cell{background:#fee2e2!important;color:#991b1b!important;font-weight:900}
  </style>
</head>
<body>
  <table>
    <tr><td colspan="${colSpan}" class="section">Report Details</td></tr>
    <tr>
      <td class="label">Report Type</td><td class="value" colspan="2">Production Report</td>
      <td class="label">Generated At</td><td class="value" colspan="3">${escapeHtml(generatedAt)}</td>
    </tr>
    <tr>
      <td class="label">Line</td><td class="value" colspan="2">${escapeHtml(activeLineLabel)}</td>
      <td class="label">Date From</td><td class="value" colspan="3">${escapeHtml(formatDisplayDate(fromDate))}</td>
    </tr>
    <tr>
      <td class="label">Machine</td><td class="value" colspan="2">${escapeHtml(machineLabel)}</td>
      <td class="label">Date To</td><td class="value" colspan="3">${escapeHtml(formatDisplayDate(toDate))}</td>
    </tr>
    <tr>
      <td class="label">Shift</td><td class="value" colspan="2">${escapeHtml(reportShiftLabel)}</td>
      <td class="label">Records</td><td class="value" colspan="3">${exportRows.length}</td>
    </tr>
    <tr>
      <td class="label">Date Range</td><td class="value" colspan="2">${escapeHtml(reportFilterLabel)}</td>
      <td class="label">Shot Result</td><td class="value" colspan="3">${escapeHtml(reportShotResultLabel)}</td>
    </tr>
    <tr><td colspan="${colSpan}" class="section">Production Summary</td></tr>
    <tr>
      <td class="summary-label">OK Shot</td>
      <td class="summary-label">Warm Up Shot</td>
      <td class="summary-label">Off Shot</td>
      <td class="summary-label">Total Production</td>
      <td class="summary-label">Shift</td>
    </tr>
    <tr>
      <td class="summary-ok">${kpis.ok}</td>
      <td class="summary-warm">${kpis.warm}</td>
      <td class="summary-off">${kpis.off}</td>
      <td class="summary-total">${kpis.totalProduction}</td>
      <td class="summary-shift">${escapeHtml(kpis.shift)}</td>
    </tr>
    <tr><td colspan="${colSpan}" class="section">Detailed Production Records</td></tr>
    <tr>${header}</tr>
    ${body || `<tr><td colspan="${exportColumns.length || 1}">No records</td></tr>`}
  </table>
</body>
</html>`);
  };

  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser} hideFooter>
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-black leading-tight text-slate-950 sm:text-2xl">{machineLabel} Production Report</h1>
              <p className="text-sm font-semibold text-slate-500">
                Machine production history | {fromDate} to {toDate}
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className="flex w-full flex-col gap-3 px-4 py-3 text-left transition hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Filters</p>
              <p className="mt-1 text-sm font-bold text-slate-600">
                {reportFilterLabel} | {reportShiftLabel} | {reportShotResultLabel} | {reportRangeLabel}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600">
                <svg className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          </button>

          {filtersOpen && (
            <div className="border-t border-slate-200 p-3 sm:p-4">
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] 2xl:[grid-template-columns:minmax(170px,1fr)_minmax(170px,1fr)_minmax(150px,0.9fr)_minmax(130px,0.8fr)_minmax(150px,0.9fr)_minmax(150px,0.9fr)_minmax(110px,0.7fr)_minmax(110px,0.7fr)_minmax(130px,0.8fr)_minmax(110px,0.7fr)] 2xl:items-end">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Line</span>
                  <select
                    value={draftLineId}
                    onChange={(event) => {
                      const nextLine = event.target.value;
                      setDraftLineId(nextLine);
                      const nextMachines = getMachinesForLine(nextLine);
                      if (nextMachines.length) setDraftMachineId(getMachineId(nextMachines[0]));
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="all">All Lines</option>
                    {lines.map((line) => (
                      <option key={getLineId(line)} value={getLineId(line)}>
                        {getLineLabel(line)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Machine</span>
                  <select
                    value={draftMachineId}
                    onChange={(event) => setDraftMachineId(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {draftMachineOptions.map((machine) => (
                      <option key={getMachineId(machine)} value={getMachineId(machine)}>
                        {getMachineLabel(machine)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Date Range</span>
                  <select
                    value={draftQuickFilter}
                    onChange={(event) => {
                      if (event.target.value === "custom") {
                        setDraftQuickFilter("custom");
                        return;
                      }
                      applyQuickDateFilter(event.target.value);
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {QUICK_DATE_FILTERS.map((filter) => (
                      <option key={filter.key} value={filter.key}>{filter.label}</option>
                    ))}
                    <option value="custom">Custom Range</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Shift</span>
                  <select
                    value={draftShiftFilter}
                    onChange={(event) => setDraftShiftFilter(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {SHIFT_FILTERS.map((filter) => (
                      <option key={filter.key} value={filter.key}>{filter.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Shot Result</span>
                  <select
                    value={draftShotResultFilter}
                    onChange={(event) => setDraftShotResultFilter(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {SHOT_RESULT_FILTERS.map((filter) => (
                      <option key={filter.key} value={filter.key}>{filter.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">From</span>
                  <input type="date" value={draftFromDate} onChange={handleFromDateChange} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">To</span>
                  <input type="date" value={draftToDate} onChange={handleToDateChange} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Shot No.</span>
                  <input
                    type="search"
                    value={draftShotNumberFilter}
                    onChange={(event) => setDraftShotNumberFilter(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") applyReportFilters();
                    }}
                    placeholder="Find shot number"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <button type="button" onClick={applyReportFilters} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 sm:self-end">
                  <CheckCircle2 className="h-4 w-4" />
                  Apply
                </button>
                <button type="button" onClick={clearReportFilters} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 sm:self-end">
                  Clear
                </button>
                <button type="button" onClick={downloadExcel} disabled={exporting} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60 sm:self-end">
                  <Download className="h-4 w-4" />
                  {exporting ? "Preparing..." : "Excel"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          <KpiCard title="Total Production" value={kpis.totalProduction} tone="blue" />
          <KpiCard title="OK Shot" value={kpis.ok} tone="emerald" />
          <KpiCard title="Warm Up Shot" value={kpis.warm} tone="amber" />
          <KpiCard title="Off Shot" value={kpis.off} tone="rose" />
          <KpiCard title="Shift" value={kpis.shift} tone="indigo" />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-800">Overall Machine Report</h2>
              <p className="text-xs font-semibold text-slate-500">
                Latest records first | Page {pagination.page} of {pagination.totalPages} | {pagination.total} records
                {shotNumberFilter && ` | Shot search: ${shotNumberFilter}`}
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
                {reportRows.map((row, index) => (
                  <tr key={row.id || `${row.recorded_at}-${index}`} className="border-b border-slate-100 hover:bg-slate-50">
                    {columns.map((key) => (
                      <td
                        key={key}
                        className={`border-r px-4 py-2.5 text-center align-middle font-semibold leading-tight last:border-r-0 ${
                          ["part_name", "part_qr_code", "scan_data", "part_scan_data"].includes(normalizeColumnKey(key)) ? "break-all" : ""
                        } ${
                          isHighlightedReportCell(row, key)
                            ? "border-red-200 bg-red-100 text-red-800"
                            : "border-slate-100 text-slate-800"
                        }`}
                      >
                        {formatReportCell(row, key, index, reportRows.length, reportRows)}
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
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-slate-500">
              Showing {reportRows.length ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0}
              {" "}to {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading || pagination.page <= 1}
                onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <span className="min-w-24 text-center text-xs font-black uppercase tracking-wide text-slate-500">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={loading || pagination.page >= pagination.totalPages}
                onClick={() => setPagination((current) => ({ ...current, page: Math.min(current.totalPages, current.page + 1) }))}
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
