import { DISPLAY_LABELS, HIDDEN_DB_FIELDS, PARAMETER_NAMES_BY_KIND } from "../constants";

export function isHiddenDbField(name) {
  return HIDDEN_DB_FIELDS.has(name) || name.endsWith(" duration (sec)");
}

export function getDisplayLabel(name) {
  return DISPLAY_LABELS[name] || name;
}

export function getMachineKindFromRow(row = {}) {
  const explicitKind = row.kind || row.machine_type || row.machineType;
  if (explicitKind) return explicitKind;
  const machineText = [
    row.machine_name,
    row.machine,
    row.machine_key,
    row.name,
  ].join(" ").toLowerCase();
  if (
    machineText.includes("gauge") ||
    machineText.includes("guage") ||
    row.part_scan_data !== undefined ||
    row.gauge_status !== undefined ||
    row.gauge_judgement !== undefined ||
    row["Part Scan Data"] !== undefined ||
    row["Gauge Status"] !== undefined ||
    row["Gauge  Status"] !== undefined ||
    row["Gauge Judgement"] !== undefined
  ) {
    return "gauge";
  }
  if (machineText.includes("leak") || row.part_qr_code !== undefined || row.body_leak_value !== undefined) {
    return "leaktest";
  }
  return "ube";
}

export function getAllowedParameterNames(machineKind = "ube") {
  if (Object.prototype.hasOwnProperty.call(PARAMETER_NAMES_BY_KIND, machineKind)) {
    return PARAMETER_NAMES_BY_KIND[machineKind];
  }
  return new Set();
}

const TWO_DIGIT_FIELDS = new Set([
  "shot_year",
  "shot_month",
  "shot_day",
  "shot_hour",
  "shot_minute",
  "shot_second",
]);

export function pad2(value) {
  if (value === null || value === undefined || value === "") return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return String(Math.trunc(Math.abs(numericValue)) % 100).padStart(2, "0");
}

export function formatDateOnly(value) {
  if (!value) return value;
  if (typeof value === "string") {
    const match = value.match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})/);
    if (match) return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

export function formatTimeOnly(value) {
  if (!value) return value;
  const raw = String(value);
  const match = raw.match(/T(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/) ||
    raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (match) return `${pad2(match[1])}:${pad2(match[2])}:${pad2(match[3] ?? 0)}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDuration(seconds) {
  const total = Math.max(0, Number.parseInt(seconds, 10) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

export const todayInput = () => new Date().toISOString().slice(0, 10);

export function getNumericShotNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getReadingShotNumber(readings = {}) {
  return getNumericShotNumber(readings.shot_number?.value);
}

export function buildShotTimeFromRow(row = {}) {
  if (row.shot_time) return formatTimeOnly(row.shot_time);
  const parts = [row.shot_hour, row.shot_minute, row.shot_second].map((value) => pad2(value));
  if (parts.every(Boolean)) return parts.join(":");
  const timestamp = row.shot_datetime || row.recorded_at || row.created_at;
  return timestamp ? formatTimeOnly(timestamp) : "";
}

export function buildShotDateFromRow(row = {}) {
  if (row.shot_date) return formatDateOnly(row.shot_date);
  const yearValue = Number(row.shot_year);
  const year = Number.isFinite(yearValue)
    ? String(yearValue < 100 ? 2000 + Math.trunc(Math.abs(yearValue)) : Math.trunc(yearValue))
    : "";
  const parts = [row.shot_month, row.shot_day].map((value) => pad2(value));
  return year && parts.every(Boolean) ? `${year}-${parts[0]}-${parts[1]}` : "";
}

export function buildShotDateTimeFromRow(row = {}) {
  if (row.shot_datetime) return String(row.shot_datetime).replace("T", " ");
  const shotDate = buildShotDateFromRow(row);
  const shotTime = buildShotTimeFromRow(row);
  return shotDate && shotTime ? `${shotDate} ${shotTime}` : "";
}

export function normalizeDisplayValue(name, value) {
  if (value === null || value === undefined) return value;
  const normalizedName = String(name || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const raw = String(value).trim();

  if (normalizedName === "gauge_status") {
    if (raw === "0") return "OK";
    if (raw === "1") return "NG";
  }
  if (normalizedName === "gauge_judgement") {
    if (raw === "0") return "NG";
    if (raw === "1") return "OK";
  }
  if (normalizedName === "cycle_mode_auto_manual") {
    if (raw === "1") return "Manual";
    if (raw === "2") return "Auto";
    if (raw.toLowerCase() === "manual") return "Manual";
    if (raw.toLowerCase() === "auto") return "Auto";
  }
  if (TWO_DIGIT_FIELDS.has(name)) return pad2(value);
  if (name === "shot_date") return formatDateOnly(value);
  if (name === "shot_time") return formatTimeOnly(value);
  if (name === "recorded_at") return formatDateTime(value);
  if (name === "shot_datetime") return formatDateTime(value);
  if (name === "cycle_end_time") return formatDateTime(value);
  if (name === "result") return normalizeLeakResult(value);
  if (name === "running_mode") {
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "1") return "Auto";
    if (normalized === "0") return "Manual";
    if (normalized === "auto") return "Auto";
    if (normalized === "manual") return "Manual";
  }
  return value;
}

const READING_VALUE_ALIASES = {
  "SCAN DATA": ["part_qr_code", "scan_data", "part_name"],
  "Scan Data": ["part_qr_code", "scan_data", "part_name"],
  scan_data: ["part_qr_code", "SCAN DATA", "Scan Data", "part_name"],
  "BODY LEAK VALUE": ["body_leak_value"],
  "Body Leak Value": ["body_leak_value"],
  body_leak_value: ["BODY LEAK VALUE", "Body Leak Value"],
  "GALL-1": ["gall_1"],
  "GALL 1": ["gall_1"],
  "Gall-1": ["gall_1"],
  gall_1: ["GALL-1", "GALL 1", "Gall-1"],
  "GALL-2": ["gall_2"],
  "GALL 2": ["gall_2"],
  "Gall-2": ["gall_2"],
  gall_2: ["GALL-2", "GALL 2", "Gall-2"],
  RESULT: ["result", "status"],
  Result: ["result", "status"],
  result: ["RESULT", "Result", "status"],
  AUTO: ["auto_bit", "running_mode"],
  Auto: ["auto_bit", "running_mode"],
  auto_bit: ["AUTO", "Auto"],
  MANUAL: ["manual"],
  Manual: ["manual"],
  manual: ["MANUAL", "Manual"],
  DRY: ["dry"],
  Dry: ["dry"],
  dry: ["DRY", "Dry"],
  WEY: ["wey"],
  Wey: ["wey"],
  wey: ["WEY", "Wey"],
  BOTH: ["both"],
  Both: ["both"],
  both: ["BOTH", "Both"],
  "CYCLE TIME": ["cycle_time"],
  "Cycle Time": ["cycle_time"],
  cycle_time: ["CYCLE TIME", "Cycle Time", "Cycle Time Sec", "Cycle Time In Sec", "cycle_time_in_sec"],
  "CYCLE START": ["cycle_start"],
  "Cycle Start": ["cycle_start"],
  cycle_start: ["CYCLE START", "Cycle Start"],
  "CYCLE END": ["cycle_complete", "cycle_end"],
  "Cycle End": ["cycle_complete", "cycle_end"],
  cycle_end: ["CYCLE END", "Cycle End", "cycle_complete"],
  "Part Scan Data": ["part_scan_data", "scan_data", "part_qr_code", "part_name"],
  "Cycle Time Sec": ["cycle_time_in_sec", "cycle_time"],
  "Cycle Time In Sec": ["cycle_time_in_sec", "cycle_time"],
  "Gauge  Status": ["gauge_status", "Gauge Status", "status"],
  "Gauge Status": ["gauge_status", "Gauge  Status", "status"],
  "Gauge Judgement": ["gauge_judgement", "result"],
  "Cycle Mode Auto/Manual": ["cycle_mode_auto_manual", "running_mode"],
  "Cycle Start": ["cycle_start"],
  "Cycle Complete": ["cycle_complete"],
  part_scan_data: ["Part Scan Data", "scan_data", "part_qr_code", "part_name"],
  cycle_time_in_sec: ["Cycle Time Sec", "Cycle Time In Sec", "cycle_time"],
  gauge_status: ["Gauge Status", "Gauge  Status", "status"],
  gauge_judgement: ["Gauge Judgement", "result"],
  cycle_mode_auto_manual: ["Cycle Mode Auto/Manual", "running_mode"],
  cycle_start: ["Cycle Start"],
  cycle_complete: ["Cycle Complete"],
};

function getAliasedValue(source = {}, name) {
  if (source[name] !== undefined) return source[name];
  const aliases = READING_VALUE_ALIASES[name] || [];
  for (const alias of aliases) {
    if (source[alias] !== undefined) return source[alias];
  }
  return null;
}

function unwrapReadingValue(item) {
  if (item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "value")) {
    return unwrapReadingValue(item.value);
  }
  return item;
}

function hasPresentValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function getReadingValue(readings = {}, name) {
  const direct = readings[name];
  if (direct !== undefined) {
    const directValue = unwrapReadingValue(direct);
    if (hasPresentValue(directValue)) return directValue;
  }
  const aliases = READING_VALUE_ALIASES[name] || [];
  for (const alias of aliases) {
    const value = readings[alias];
    if (value !== undefined) {
      const aliasValue = unwrapReadingValue(value);
      if (hasPresentValue(aliasValue)) return aliasValue;
    }
  }
  return direct !== undefined ? unwrapReadingValue(direct) : null;
}

export function normalizeLeakResult(value) {
  if (value === null || value === undefined) return value;
  const raw = String(value).trim();
  if (!raw) return raw;
  const normalized = raw.toUpperCase();

  if (["OK", "O", "PASS", "PASSED", "GOOD", "G", "Y", "YES", "TRUE", "1"].includes(normalized)) return "OK";
  if (["NG", "N", "FAIL", "FAILED", "BAD", "B", "NO", "FALSE", "0"].includes(normalized)) return "NG";
  return raw;
}

export function normalizeLeakStatus(status, result) {
  const resultStatus = normalizeLeakResult(result);
  const rawStatus = status === null || status === undefined ? "" : String(status).trim();
  const normalizedStatus = rawStatus.toUpperCase();

  if (!rawStatus || ["ONLINE", "SAVED", "MIGRATED", "UNKNOWN"].includes(normalizedStatus)) {
    return resultStatus || rawStatus || null;
  }

  return normalizeLeakResult(rawStatus) || resultStatus || rawStatus;
}

export function rowToReadings(row = {}, machineKind = getMachineKindFromRow(row)) {
  let rawReadings = {};
  try {
    rawReadings = row.raw_readings_json ? JSON.parse(row.raw_readings_json) : {};
  } catch {
    rawReadings = {};
  }
  const expandedRow = {
    ...(rawReadings && typeof rawReadings === "object" && !Array.isArray(rawReadings) ? rawReadings : {}),
    ...row,
  };
  const allowedNames = getAllowedParameterNames(machineKind);
  const dynamicNames = Object.keys(expandedRow)
    .filter((name) => !isHiddenDbField(name))
    .filter((name) => expandedRow[name] !== null && expandedRow[name] !== undefined);
  const names = Array.from(new Set([...allowedNames, ...dynamicNames]));

  return Object.fromEntries(
    names.map((name) => {
      let value = getAliasedValue(expandedRow, name);
      if (name === "part_name") value = expandedRow.part_name ?? expandedRow.part_qr_code ?? expandedRow.scan_data ?? null;
      if (name === "part_qr_code") value = expandedRow.part_qr_code ?? expandedRow.scan_data ?? expandedRow.part_name ?? null;
      if (name === "part_scan_data") value = getAliasedValue(expandedRow, name);
      if (name === "machine") value = expandedRow.machine ?? expandedRow.machine_name ?? null;
      if (name === "ip") value = expandedRow.ip ?? expandedRow.plc_ip ?? null;
      if (name === "status") value = normalizeLeakStatus(expandedRow.status, expandedRow.result);
      return [name, { value: normalizeDisplayValue(name, value), column: name }];
    })
  );
}

export function getRowTimestamp(row = {}) {
  return row.cycle_end_time || buildShotDateTimeFromRow(row) || row.recorded_at || row.created_at || null;
}

