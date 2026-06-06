import { DEFAULT_MACHINES, DISPLAY_LABELS, HIDDEN_DB_FIELDS, PARAMETER_NAMES_BY_KIND, getMachineKey } from "../constants";

export function isHiddenDbField(name) {
  return HIDDEN_DB_FIELDS.has(name) || name.endsWith(" duration (sec)");
}

export function getDisplayLabel(name) {
  return DISPLAY_LABELS[name] || name;
}

export function getMachineKindFromRow(row = {}) {
  const machine = DEFAULT_MACHINES.find((item) =>
    getMachineKey(item) === row.machine_key ||
    item.ip === row.plc_ip ||
    item.ip === row.ip
  );
  return machine?.kind || row.kind || "ube";
}

export function getAllowedParameterNames(machineKind = "ube") {
  return PARAMETER_NAMES_BY_KIND[machineKind] || PARAMETER_NAMES_BY_KIND.ube;
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
  return parts.every(Boolean) ? parts.join(":") : "";
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
  const allowedNames = getAllowedParameterNames(machineKind);
  const names = Array.from(allowedNames);

  return Object.fromEntries(
    names.map((name) => {
      let value = row[name] ?? null;
      if (name === "part_name") value = row.part_name ?? row.part_qr_code ?? row.scan_data ?? null;
      if (name === "part_qr_code") value = row.part_qr_code ?? row.scan_data ?? row.part_name ?? null;
      if (name === "machine") value = row.machine ?? row.machine_name ?? null;
      if (name === "ip") value = row.ip ?? row.plc_ip ?? null;
      if (name === "status") value = normalizeLeakStatus(row.status, row.result);
      return [name, { value: normalizeDisplayValue(name, value), column: name }];
    })
  );
}

export function getRowTimestamp(row = {}) {
  return row.cycle_end_time || buildShotDateTimeFromRow(row) || row.recorded_at || row.created_at || null;
}

