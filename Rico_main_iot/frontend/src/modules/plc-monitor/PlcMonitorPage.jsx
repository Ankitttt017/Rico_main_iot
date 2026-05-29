import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import AppLayout from "../../components/common/AppLayout";
import {
  getPlcConnectionEvents,
  getPlcConnectionEventsExportUrl,
  getPlcHistoryExportUrl,
  getPlcLatestReadings,
  getPlcReadingHistory,
} from "../../services/api";
import { SOCKET_URL } from "../../services/endpoints";

const PLC_LATEST_POLL_MS = Number(import.meta.env.VITE_PLC_LATEST_POLL_MS || 2000);

const MACHINE_NAMES = {
  "192.168.117.201": "UBE 850T-2",
};

const DEFAULT_MACHINES = [
  { key: "ube-850t-2", ip: "192.168.117.201", port: 5002, name: "UBE 850T-2", kind: "ube" },
];

function getMachineKey(machine = {}) {
  return machine.key || machine.machine_key || machine.ip;
}

function mergeMachineList(list = []) {
  const byKey = new Map(DEFAULT_MACHINES.map((machine) => [getMachineKey(machine), machine]));
  list.forEach((machine) => {
    const key = getMachineKey(machine);
    const defaultMachine = byKey.get(key);
    byKey.set(key, {
      ...machine,
      ...(defaultMachine || {}),
      connected: machine.connected,
      error: machine.error,
      lastCycleAt: machine.lastCycleAt,
      lastShotNumber: machine.lastShotNumber,
      partName: machine.partName,
      cycleTime: machine.cycleTime,
    });
  });
  return Array.from(byKey.values());
}

const REGISTER_GROUPS = [
  {
    id: "production",
    label: "Production",
    kind: "ube",
    icon: "TIME",
    color: "#22d3ee",
    keys: [
      { name: "machine_name", unit: "" },
      { name: "plc_ip", unit: "" },
      { name: "part_name", unit: "" },
      { name: "shot_date", unit: "" },
      { name: "shot_time", unit: "" },
      { name: "shot_datetime", unit: "" },
      { name: "shot_year", unit: "" },
      { name: "shot_month", unit: "" },
      { name: "shot_day", unit: "" },
      { name: "shot_hour", unit: "" },
      { name: "shot_minute", unit: "" },
      { name: "shot_second", unit: "" },
      { name: "shot_number", unit: "" },
      { name: "ok_shot", unit: "" },
      { name: "cycle_time", unit: "sec" },
    ],
  },
  {
    id: "cycle_times",
    label: "Cycle Timings",
    kind: "ube",
    icon: "CYC",
    color: "#f97316",
    keys: [
      { name: "die_close_core_in_time", unit: "sec" },
      { name: "pouring_time", unit: "sec" },
      { name: "shot_fwd_time", unit: "sec" },
      { name: "curing_time", unit: "sec" },
      { name: "die_open_core_out_time", unit: "sec" },
      { name: "ejector_time", unit: "sec" },
      { name: "extract_time", unit: "sec" },
      { name: "spray_time", unit: "sec" },
    ],
  },
  {
    id: "shot",
    label: "Shot Setup",
    kind: "ube",
    icon: "SPD",
    color: "#a78bfa",
    keys: [
      { name: "v1_speed", unit: "m/sec" },
      { name: "v2_speed", unit: "m/sec" },
      { name: "v3_speed", unit: "m/sec" },
      { name: "v4_speed", unit: "m/sec" },
      { name: "accel_point", unit: "mm" },
      { name: "deaccel_point", unit: "mm" },
      { name: "intensification_time", unit: "msec" },
      { name: "biscuit_thickness", unit: "mm" },
    ],
  },
  {
    id: "pressure",
    label: "Pressure & Tonnage",
    kind: "ube",
    icon: "TON",
    color: "#34d399",
    keys: [
      { name: "metal_pressure", unit: "MPa" },
      { name: "clamp_tonnage_he_low_pct", unit: "%" },
      { name: "clamp_tonnage_he_low_mn", unit: "MN" },
      { name: "clamp_tonnage_op_up_pct", unit: "%" },
      { name: "clamp_tonnage_op_low_pct", unit: "%" },
      { name: "clamp_tonnage_he_up_pct", unit: "%" },
      { name: "clamp_force_pct", unit: "%" },
      { name: "clamp_tonnage", unit: "T" },
      { name: "shot_acc_pressure", unit: "MPa" },
      { name: "intensification_acc_pressure", unit: "MPa" },
      { name: "jet_cooling_pressure", unit: "kgf/cm2" },
      { name: "vacuum_pressure", unit: "mbar" },
    ],
  },
  {
    id: "temp",
    label: "Temperature & Cooling",
    kind: "ube",
    icon: "TMP",
    color: "#f472b6",
    keys: [
      { name: "cooling_water_mov", unit: "L/min" },
      { name: "cooling_water_sta", unit: "L/min" },
      { name: "furnace_metal_temp", unit: "°C" },
      { name: "fixed_die_temp_f1", unit: "°C" },
      { name: "fixed_die_temp_f2", unit: "°C" },
      { name: "moving_die_temp_m1", unit: "°C" },
      { name: "moving_die_temp_m2", unit: "°C" },
      { name: "slide_temp_s1", unit: "°C" },
    ],
  },
  {
    id: "machine_bits",
    label: "Machine Bits",
    kind: "ube",
    icon: "STS",
    color: "#60a5fa",
    keys: [
      { name: "running_mode", unit: "" },
      { name: "emergency_stop", unit: "" },
      { name: "hyd_pump_motor_overload", unit: "" },
      { name: "hyd_oil_level_low", unit: "" },
      { name: "hyd_oil_high_temp", unit: "" },
      { name: "servo_pump_overload", unit: "" },
      { name: "servo_pump_motor_high_temp", unit: "" },
      { name: "die_close_step", unit: "" },
      { name: "pouring_step", unit: "" },
      { name: "shot_fwd_step", unit: "" },
      { name: "curing_step", unit: "" },
      { name: "die_open_step", unit: "" },
      { name: "ejector_step", unit: "" },
      { name: "extractor_step", unit: "" },
      { name: "spray_step", unit: "" },
      { name: "cycle_end", unit: "" },
    ],
  },
  {
    id: "leak_test",
    label: "Leak Test",
    kind: "leaktest",
    icon: "LT",
    color: "#14b8a6",
    keys: [
      { name: "machine", unit: "" },
      { name: "ip", unit: "" },
      { name: "status", unit: "" },
      { name: "cycle_end_time", unit: "" },
      { name: "part_qr_code", unit: "" },
      { name: "result", unit: "" },
      { name: "body_leak_value", unit: "" },
      { name: "gall_1", unit: "" },
      { name: "gall_2", unit: "" },
      { name: "cycle_time", unit: "sec" },
      { name: "running_mode", unit: "" },
      { name: "manual", unit: "" },
      { name: "dry", unit: "" },
      { name: "wey", unit: "" },
      { name: "both", unit: "" },
    ],
  },
];

const PARAMETER_NAMES = REGISTER_GROUPS.flatMap((group) => group.keys.map((item) => item.name));
const PARAMETER_NAMES_BY_KIND = REGISTER_GROUPS.reduce((acc, group) => {
  acc[group.kind] = acc[group.kind] || new Set();
  group.keys.forEach((item) => acc[group.kind].add(item.name));
  return acc;
}, {});
const HIDDEN_DB_FIELDS = new Set([
  "id",
  "created_at",
  "raw_readings_json",
  "shot_uid",
  "rn",
  "is_online",
  "has_data",
  "error",
  "db_status",
  "Counter",
  "HIGH SHOT COUNT value",
  "NG COUNTER value",
  "high_shot_count",
  "high_shot",
  "ng_counter",
  "off_shot",
  "Sr. No",
  "cycletime EndDateTime",
  "AUTO/OK-step value (sec)",
  "AUTO/ROBOT/OK-step value (sec)",
  "SHOT FWD TIME sec value",
  "cycletime value (sec)",
  "DIE CLOSE/CORE IN -step value (sec)",
  "POURING -step value (sec)",
  "SHOT FWD -step value (sec)",
  "COOLING -step value (sec)",
  "DIE OPEN/CORE OUT -step value (sec)",
  "EXTRACTOR -step value (sec)",
  "EJECTOR -step value (sec)",
  "SPRAY -step value (sec)",
  "V1 m/sec value",
  "V2 m/sec) value",
  "V3 m/sec value",
  "V4 m/sec value",
  "ACCEL. POINT mm value",
  "DEACEL. POINT mm value",
  "METAL PRESS. Mpa value",
  "INTEN. TIME msec value",
  "BISCUIT THICKNESS mm value",
  "CLAMP TONNAGE(HE.LOW) % value",
  "CLAMP TONNAGE(HE.LOW) MN value",
  "CLAMP TONNAGE(OP.UP) % value",
  "CLAMP TONNAGE(OP.LOW) % value",
  "CLAMP TONNAGE(HE.UP) % value",
  "VACUUM PRESSURE mbar value",
  "COOLING WATER FLOW RATE(MOV.) L/min value",
  "COOLING WATER FLOW RATE(STA.) L/min value",
  "FURNACE METAL TEMP. C value",
  "DIE-CLOSE CORE IN TIME sec value",
  "POURING TIME sec value",
  "CURING TIME sec value",
  "DIE OPEN CORE OUT TIME sec value",
  "EJECTOR TIME sec value",
  "EXTRACT TIME sec value",
  "SPRAY TIME sec value",
  "CLAMP FORCE (%) value",
  "CLAMP TONNAGE (T) value",
  "SHOT ACC. PRESSURE MPa value",
  "INTENSIFICATION ACC. PRESSURE MPa value",
  "JET COOLING PRESSURE kgf/cm2 value",
  "FIXED DIE TEMP (F-1) C value",
  "FIXED DIE TEMP (F-2) C value",
  "MOVING DIE TEMP (M-1) C value",
  "MOVING DIE TEMP (M-2) C value",
  "SLIDE TEMP-1 (S-1) C value",
  "MANUAL MODE -step value (sec)",
  "EMG. STOP -step value (sec)",
  "HYD.OIL LEVEL LOW LIMIT -step value (sec)",
  "Running Mode (AUTO/ROBOT)",
  "EMG. STOP",
  "MANUAL MODE",
  "HYD. PUMP MOTOR OVERLOAD",
  "HYD. OIL LEVEL LOW LIMIT",
  "HYD. OIL HIGH TEMP.",
  "SERVO PUMP OVERLOAD",
  "SERVO PUMP MOTOR HIGH TEMP.",
  "DIE CLOSE / CORE IN - step",
  "POURING - step",
  "SHOT FWD - step",
  "CURING - step",
  "DIE OPEN / CORE OUT - step",
  "EJECTOR - step",
  "EXTRACTOR - step",
  "SPRAY - step",
  "Cycle End",
  "machine_key",
  "scan_data",
  "cycle_start",
  "auto_mode",
  "manual_mode",
  "ng_shot",
  "dry_mode",
  "wey_mode",
  "both_mode",
]);
const DISPLAY_LABELS = {
  recorded_at: "Recorded At",
  machine_name: "Machine",
  plc_ip: "PLC IP",
  plc_port: "PLC Port",
  machine: "Machine",
  ip: "IP",
  status: "Status",
  cycle_end_time: "Cycle End Time",
  machine_key: "Machine Key",
  part_name: "Part Name",
  part_qr_code: "Part QR Code",
  body_leak_value: "Body Leak Value",
  gall_1: "GALL-1",
  gall_2: "GALL-2",
  result: "Result",
  manual: "Manual",
  dry_mode: "Dry",
  dry: "Dry",
  wey: "Wey",
  both: "Both",
  shot_year: "Shot Year",
  shot_month: "Shot Month",
  shot_day: "Shot Day",
  shot_date: "Shot Date",
  shot_time: "Shot Time",
  shot_datetime: "Shot Date Time",
  ok_shot: "OK Shot",
  shot_number: "Shot Number",
  cycle_time: "Cycle Time",
  "cycletime value (sec)": "Cycle Time",
  "cycletime EndDateTime": "Shot Time",
  shot_hour: "Shot Hour",
  shot_minute: "Shot Minute",
  shot_second: "Shot Second",
  die_close_core_in_time: "Die Close/Core In Time",
  pouring_time: "Pouring Time",
  shot_fwd_time: "Shot FWD Time",
  curing_time: "Curing Time",
  die_open_core_out_time: "Die Open/Core Out Time",
  ejector_time: "Ejector Time",
  extract_time: "Extractor Time",
  spray_time: "Spray Time",
  v1_speed: "V1 Speed",
  v2_speed: "V2 Speed",
  v3_speed: "V3 Speed",
  v4_speed: "V4 Speed",
  accel_point: "Accel. Point",
  deaccel_point: "Deaccel. Point",
  intensification_time: "Intensification Time",
  biscuit_thickness: "Biscuit Thickness",
  metal_pressure: "Metal Pressure",
  furnace_metal_temp: "Furnace Metal Temp",
  cooling_water_mov: "Cooling Water MOV",
  cooling_water_sta: "Cooling Water STA",
  clamp_tonnage_he_low_pct: "Clamp Tonnage HE Low %",
  clamp_tonnage_he_low_mn: "Clamp Tonnage HE Low MN",
  clamp_tonnage_op_up_pct: "Clamp Tonnage OP Up %",
  clamp_tonnage_op_low_pct: "Clamp Tonnage OP Low %",
  clamp_tonnage_he_up_pct: "Clamp Tonnage HE Up %",
  vacuum_pressure: "Vacuum Pressure",
  clamp_force_pct: "Clamp Force",
  clamp_tonnage: "Clamp Tonnage",
  shot_acc_pressure: "Shot Acc. Pressure",
  intensification_acc_pressure: "Intensification Acc. Pressure",
  jet_cooling_pressure: "Jet Cooling Pressure",
  fixed_die_temp_f1: "Fixed Die Temp F1",
  fixed_die_temp_f2: "Fixed Die Temp F2",
  moving_die_temp_m1: "Moving Die Temp M1",
  moving_die_temp_m2: "Moving Die Temp M2",
  slide_temp_s1: "Slide Temp S1",
  running_mode: "Running Mode",
  emergency_stop: "Emergency Stop",
  hyd_pump_motor_overload: "Hyd. Pump Motor Overload",
  hyd_oil_level_low: "Hyd. Oil Level Low",
  hyd_oil_high_temp: "Hyd. Oil High Temp",
  servo_pump_overload: "Servo Pump Overload",
  servo_pump_motor_high_temp: "Servo Pump Motor High Temp",
  die_close_step: "Die Close/Core In Step",
  pouring_step: "Pouring Step",
  shot_fwd_step: "Shot FWD Step",
  curing_step: "Curing Step",
  die_open_step: "Die Open Step",
  ejector_step: "Ejector Step",
  extractor_step: "Extractor Step",
  spray_step: "Spray Step",
  cycle_end: "Cycle End",
};

function isHiddenDbField(name) {
  return HIDDEN_DB_FIELDS.has(name) || name.endsWith(" duration (sec)");
}

function getDisplayLabel(name) {
  return DISPLAY_LABELS[name] || name;
}

function getMachineKindFromRow(row = {}) {
  const machine = DEFAULT_MACHINES.find((item) =>
    getMachineKey(item) === row.machine_key ||
    item.ip === row.plc_ip ||
    item.ip === row.ip
  );
  return machine?.kind || row.kind || "ube";
}

function getAllowedParameterNames(machineKind = "ube") {
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

function pad2(value) {
  if (value === null || value === undefined || value === "") return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return String(Math.trunc(Math.abs(numericValue)) % 100).padStart(2, "0");
}

function formatDateOnly(value) {
  if (!value) return value;
  if (typeof value === "string") {
    const match = value.match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})/);
    if (match) return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDateTime(value) {
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

function formatTimeOnly(value) {
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

function formatDuration(seconds) {
  const total = Math.max(0, Number.parseInt(seconds, 10) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

const todayInput = () => new Date().toISOString().slice(0, 10);

function getNumericShotNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getReadingShotNumber(readings = {}) {
  return getNumericShotNumber(readings.shot_number?.value);
}

function buildShotTimeFromRow(row = {}) {
  if (row.shot_time) return formatTimeOnly(row.shot_time);
  const parts = [row.shot_hour, row.shot_minute, row.shot_second].map((value) => pad2(value));
  return parts.every(Boolean) ? parts.join(":") : "";
}

function buildShotDateFromRow(row = {}) {
  if (row.shot_date) return formatDateOnly(row.shot_date);
  const parts = [row.shot_year, row.shot_month, row.shot_day].map((value) => pad2(value));
  return parts.every(Boolean) ? `20${parts[0]}-${parts[1]}-${parts[2]}` : "";
}

function normalizeDisplayValue(name, value) {
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

function normalizeLeakResult(value) {
  if (value === null || value === undefined) return value;
  const raw = String(value).trim();
  if (!raw) return raw;
  const normalized = raw.toUpperCase();

  if (["OK", "O", "PASS", "PASSED", "GOOD", "G", "Y", "YES", "TRUE", "1"].includes(normalized)) return "OK";
  if (["NG", "N", "FAIL", "FAILED", "BAD", "B", "NO", "FALSE", "0"].includes(normalized)) return "NG";
  return raw;
}

function normalizeLeakStatus(status, result) {
  const resultStatus = normalizeLeakResult(result);
  const rawStatus = status === null || status === undefined ? "" : String(status).trim();
  const normalizedStatus = rawStatus.toUpperCase();

  if (!rawStatus || ["ONLINE", "SAVED", "MIGRATED", "UNKNOWN"].includes(normalizedStatus)) {
    return resultStatus || rawStatus || null;
  }

  return normalizeLeakResult(rawStatus) || resultStatus || rawStatus;
}

function rowToReadings(row = {}, machineKind = getMachineKindFromRow(row)) {
  const allowedNames = getAllowedParameterNames(machineKind);
  const names = Array.from(allowedNames);

  return Object.fromEntries(
    names.map((name) => {
      let value = row[name] ?? null;
      if (name === "part_qr_code") value = row.part_qr_code ?? row.scan_data ?? row.part_name ?? null;
      if (name === "machine") value = row.machine ?? row.machine_name ?? null;
      if (name === "ip") value = row.ip ?? row.plc_ip ?? null;
      if (name === "status") value = normalizeLeakStatus(row.status, row.result);
      return [name, { value: normalizeDisplayValue(name, value), column: name }];
    })
  );
}

function getRowTimestamp(row = {}) {
  return row.cycle_end_time || row.shot_datetime || row.recorded_at || row.created_at || new Date().toISOString();
}

function Spark({ data, color = "#22d3ee" }) {
  if (!data) return null;

  const values = data.map(Number).filter(Number.isFinite);
  if (values.length === 0) return null;
  if (values.length < 2) return <div className="spark-empty" />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 76;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="spark">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STATUS_CFG = {
  idle: { label: "Waiting for Cycle", cls: "status-idle" },
  complete: { label: "Cycle Complete", cls: "status-complete" },
};

function formatValue(value, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" && !Number.isInteger(value)) {
    return Number(value.toFixed(2));
  }

  return value;
}

function hasReadableValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "" && String(value).trim() !== "-";
}

function ValueCard({ name, label, unit, value, history, accentColor }) {
  const hasValue = value !== null && value !== undefined;

  return (
    <div className="vcard" style={{ "--accent": accentColor }}>
      <div className="vcard-top">
        <div className="vcard-name" title={name}>
          {label || getDisplayLabel(name)}
        </div>
        <span className="vcard-led" />
      </div>
      <div className="vcard-bottom">
        <div className="vcard-readout">
          <span className="vcard-val">{hasValue ? value : "-"}</span>
          {hasValue && unit && <span className="vcard-unit">{unit}</span>}
        </div>
        <Spark data={history} color={accentColor} />
      </div>
    </div>
  );
}

function MetricTile({ label, value, unit, tone = "cyan" }) {
  const isMachine = label === "Machine" || label === "Part Name";

  return (
    <div className={`metric metric-${tone} ${isMachine ? "metric-machine" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" title={value || ""}>
        {formatValue(value)}
        {value !== null && value !== undefined && unit && (
          <span className="metric-unit">{unit}</span>
        )}
      </div>
    </div>
  );
}

function MachineStatusCard({
  machineName,
  machineKind,
  plcConfig,
  socketConnected,
  monitoringRunning,
  selectedMachineStatus,
  readings,
  lastTimestamp,
}) {
  const isLeakTest = machineKind === "leaktest";
  const counter = readings.shot_number?.value ?? null;
  const highShot = readings.ok_shot?.value ?? null;
  const partQrCode = readings.part_qr_code?.value ?? null;
  const leakResult = readings.result?.value ?? null;
  const bodyLeak = readings.body_leak_value?.value ?? null;
  const gall1 = readings.gall_1?.value ?? null;
  const gall2 = readings.gall_2?.value ?? null;
  const manualMode = isLeakTest ? readings.manual?.value ?? null : null;
  const emergencyStop = readings.emergency_stop?.value ?? readings["EMG. STOP -step value (sec)"]?.value ?? null;
  const oilLevelLow = readings.hyd_oil_level_low?.value ?? readings["HYD.OIL LEVEL LOW LIMIT -step value (sec)"]?.value ?? null;
  const isOnline = Boolean(selectedMachineStatus.connected);
  const stateText = isOnline ? "ONLINE" : socketConnected ? "WAITING" : "OFFLINE";

  const detailItems = isLeakTest
    ? [
        ["Monitor", monitoringRunning ? "RUNNING" : "STOPPED"],
        ["Part QR", formatValue(partQrCode)],
        ["Result", formatValue(leakResult)],
        ["Body Leak", formatValue(bodyLeak)],
        ["GALL-1", formatValue(gall1)],
        ["GALL-2", formatValue(gall2)],
        ["Manual", formatValue(manualMode)],
      ]
    : [
        ["Monitor", monitoringRunning ? "RUNNING" : "STOPPED"],
        ["E-Stop", formatValue(emergencyStop)],
        ["Hyd. Oil Low", formatValue(oilLevelLow)],
      ];

  return (
    <div className={`machine-status-card ${isOnline ? "is-online" : ""}`}>
      <div className="msc-head">
        <div>
          <div className="msc-label">Running Machine</div>
          <div className="msc-title">{machineName}</div>
        </div>
        <span className={`msc-pill ${isOnline ? "online" : "offline"}`}>{stateText}</span>
      </div>
      <div className="msc-grid">
        {detailItems.map(([label, value]) => (
          <div className="msc-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="msc-foot">
        {isLeakTest ? "Cycle end" : "Last cycle"}: {lastTimestamp ? lastTimestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "No cycle yet"}
        {selectedMachineStatus.error && <span>{selectedMachineStatus.error}</span>}
      </div>
    </div>
  );
}

function ParameterTable({ groups, readings }) {
  return (
    <div className="param-table-wrap">
      <table className="param-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap(group =>
            group.keys.map(({ name, unit, label }) => {
              const value = readings[name]?.value ?? null;
              return (
                <tr key={name}>
                  <td title={name}>{label || getDisplayLabel(name)}</td>
                  <td className="table-value">
                    {formatValue(value)}
                    {value !== null && value !== undefined && unit && (
                      <span className="table-unit">{unit}</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function getReportParameterRows(readings, machineKind = "ube") {
  const machineGroups = REGISTER_GROUPS.filter((group) => group.kind === machineKind);

  return machineGroups.flatMap((group) =>
    group.keys.map(({ name, unit, label }) => ({
      group: group.label,
      groupColor: group.color,
      name,
      label: label || getDisplayLabel(name),
      unit,
      value: readings[name]?.value ?? null,
    }))
  );
}

function PlcReportModal({ reading, readings, onClose }) {
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [historyRows, setHistoryRows] = useState([]);
  const [connectionRows, setConnectionRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const reportMachineId = reading.machine_key || reading.plc_ip;
  const isLeakTestReport = reading.kind === "leaktest";
  const parameterRows = getReportParameterRows(readings, isLeakTestReport ? "leaktest" : "ube");

  const loadReportPreview = useCallback(async () => {
    if (!reportMachineId) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await getPlcReadingHistory({
        ip: reportMachineId,
        from: fromDate,
        to: toDate,
        limit: 300,
      });
      const connectionResponse = await getPlcConnectionEvents({
        ip: reportMachineId,
        from: fromDate,
        to: toDate,
        limit: 300,
      });
      setHistoryRows(Array.isArray(response.data?.data) ? response.data.data : []);
      setConnectionRows(Array.isArray(connectionResponse.data?.data) ? connectionResponse.data.data : []);
    } catch {
      setHistoryRows([]);
      setConnectionRows([]);
      setHistoryError("Unable to load report preview.");
    } finally {
      setHistoryLoading(false);
    }
  }, [fromDate, reportMachineId, toDate]);

  useEffect(() => {
    loadReportPreview();
  }, [loadReportPreview]);

  const reportUrl = getPlcHistoryExportUrl({
    ip: reportMachineId,
    from: fromDate,
    to: toDate,
    limit: 5000,
  });
  const connectionReportUrl = getPlcConnectionEventsExportUrl({
    ip: reportMachineId,
    from: fromDate,
    to: toDate,
    limit: 5000,
  });

  return (
    <div className="report-backdrop">
      <section className="report-modal">
        <div className="report-head">
          <div>
            <div className="report-kicker">PLC Monitor Table</div>
            <h2 className="report-title">{reading.machine_name || MACHINE_NAMES[reading.plc_ip] || reading.plc_ip}</h2>
            <div className="report-sub">
              {reading.plc_ip || "-"}:{reading.plc_port || "-"} | {isLeakTestReport ? "Cycle End" : "Latest"}: {formatDateTime(reading.cycle_end_time || reading.recorded_at)}
            </div>
          </div>

          <div className="report-actions">
            <label className="report-date">
              <span>From</span>
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label className="report-date">
              <span>To</span>
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </label>
            <button type="button" className="preview-btn" onClick={loadReportPreview}>
              ↻ Preview
            </button>
            <a className="download-btn" href={reportUrl}>
              ↓ Download Excel
            </a>
            <a className="download-btn download-warn" href={connectionReportUrl}>
              Connectivity Excel
            </a>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close report">
              ×
            </button>
          </div>
        </div>

        <div className="report-body">
          <div className="report-pane report-parameters">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {parameterRows.map((row, index) => {
                  const previous = parameterRows[index - 1];
                  const showGroup = !previous || previous.group !== row.group;
                  return (
                    <Fragment key={`${row.group}-${row.name}`}>
                      {showGroup && (
                        <tr>
                          <td colSpan={2} className="report-group" style={{ color: row.groupColor }}>
                            {row.group}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td>{row.label}</td>
                        <td>
                          <strong>{formatValue(row.value)}</strong>
                          {row.value !== null && row.value !== undefined && row.unit && (
                            <span className="report-unit">{row.unit}</span>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="report-pane">
            <div className="preview-head">
              <div className="preview-kicker">Historical Report Preview</div>
              <div className="preview-count">{historyRows.length} records from selected date range</div>
            </div>
            {historyError && <div className="preview-error">{historyError}</div>}
            {historyLoading ? (
              <div className="preview-loading">Loading report preview...</div>
            ) : (
              <>
                <table className="report-table history-preview">
                  <thead>
                    <tr>
                      <th>{isLeakTestReport ? "Cycle End Time" : "Recorded At"}</th>
                      {!isLeakTestReport && <th>Shot Date</th>}
                      {!isLeakTestReport && <th>Shot Time</th>}
                      <th>{isLeakTestReport ? "Result" : "Shot"}</th>
                      <th>{isLeakTestReport ? "Part QR Code" : "Part"}</th>
                      <th>Cycle</th>
                      <th>{isLeakTestReport ? "Body Leak" : "OK"}</th>
                      <th>{isLeakTestReport ? "GALL" : "NG"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row.id || `${row.plc_ip}-${row.recorded_at}`}>
                        <td>{formatDateTime(isLeakTestReport ? row.cycle_end_time || row.recorded_at : row.recorded_at)}</td>
                        {!isLeakTestReport && <td>{formatDateOnly(row.shot_date || buildShotDateFromRow(row)) || "-"}</td>}
                        {!isLeakTestReport && <td>{formatTimeOnly(row.shot_time || buildShotTimeFromRow(row)) || "-"}</td>}
                        <td><strong>{formatValue(isLeakTestReport ? row.result : row.shot_number)}</strong></td>
                        <td>{formatValue(isLeakTestReport ? row.part_qr_code || row.scan_data || row.part_name : row.part_name)}</td>
                        <td className="cycle-cell">{formatValue(row.cycle_time)}s</td>
                        <td>{formatValue(isLeakTestReport ? row.body_leak_value : row.ok_shot)}</td>
                        <td>{formatValue(isLeakTestReport ? [row.gall_1, row.gall_2].filter(value => value !== null && value !== undefined).join(" / ") : row.ok_shot)}</td>
                      </tr>
                    ))}
                    {!historyRows.length && (
                      <tr>
                        <td colSpan={isLeakTestReport ? 6 : 8} className="empty-preview">No records found for this date range</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="preview-head connection-head">
                  <div className="preview-kicker">PLC / Server Connectivity</div>
                  <div className="preview-count">{connectionRows.length} events from selected date range</div>
                </div>
                <table className="report-table history-preview connection-preview">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Duration</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connectionRows.map((row) => (
                      <tr key={row.id || `${row.event_type}-${row.started_at}`}>
                        <td><strong>{formatValue(row.event_type)}</strong></td>
                        <td>{formatDateTime(row.started_at)}</td>
                        <td>{row.ended_at ? formatDateTime(row.ended_at) : "Running"}</td>
                        <td className="cycle-cell">{formatDuration(row.duration_seconds)}</td>
                        <td>{formatValue(row.reason)}</td>
                      </tr>
                    ))}
                    {!connectionRows.length && (
                      <tr>
                        <td colSpan={5} className="empty-preview">No connectivity events found for this date range</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PLCDashboard() {
  const [theme] = useState("light");
  const [plcConnected, setPlcConnected] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [cycleStatus, setCycleStatus] = useState("idle");
  const [lastTimestamp, setLastTimestamp] = useState(null);
  const [partName, setPartName] = useState("");
  const [shotTime, setShotTime] = useState("");
  const [readings, setReadings] = useState({});
  const [cycleHistory, setCycleHistory] = useState([]);
  const [cycleCount, setCycleCount] = useState(0);
  const [sparklines, setSparklines] = useState({});
  const [activeGroup, setActiveGroup] = useState(null);
  const [machines, setMachines] = useState(DEFAULT_MACHINES);
  const [machineStatuses, setMachineStatuses] = useState({});
  const [monitoringRunning, setMonitoringRunning] = useState(true);
  const [plcConfig, setPlcConfig] = useState({ key: "ube-850t-2", ip: "192.168.117.201", port: 5002,kind: "ube" });
  const [draftConfig, setDraftConfig] = useState({ ip: "192.168.117.201", port: "5002" });
  const [configMessage, setConfigMessage] = useState("");
  const [readingsByIp, setReadingsByIp] = useState({});
  const [historyByIp, setHistoryByIp] = useState({});
  const [sparkByIp, setSparkByIp] = useState({});
  const [metaByIp, setMetaByIp] = useState({});
  const socketRef = useRef(null);
  const selectedKeyRef = useRef(plcConfig.key || plcConfig.ip);
  const selectedSnapshotRef = useRef({ shotNumber: null, observedAtMs: 0, source: "" });
  const disconnectTimerRef = useRef(null);

  const rememberSelectedSnapshot = useCallback((readingsSnapshot = {}, { observedAt, source } = {}) => {
    const shotNumber = getReadingShotNumber(readingsSnapshot);
    if (shotNumber === null) return;
    const observedAtMs = observedAt ? new Date(observedAt).getTime() : Date.now();
    selectedSnapshotRef.current = {
      shotNumber,
      observedAtMs: Number.isNaN(observedAtMs) ? Date.now() : observedAtMs,
      source: source || selectedSnapshotRef.current.source,
    };
  }, []);

  const isOlderDbSnapshotForSelectedMachine = useCallback((row = {}) => {
    const dbShotNumber = getNumericShotNumber(row.shot_number);
    const current = selectedSnapshotRef.current;
    if (dbShotNumber === null || current.shotNumber === null) return false;
    if (dbShotNumber >= current.shotNumber) return false;

    const liveAgeMs = Date.now() - (current.observedAtMs || 0);
    return current.source === "live" && liveAgeMs < Math.max(PLC_LATEST_POLL_MS * 3, 10000);
  }, []);

  useEffect(() => {
    selectedKeyRef.current = plcConfig.key || plcConfig.ip;
  }, [plcConfig.ip, plcConfig.key]);

  useEffect(() => {
    let cancelled = false;

    getPlcLatestReadings()
      .then((response) => {
        if (cancelled) return;
        const rows = Array.isArray(response.data?.data) ? response.data.data.filter((item) => item.has_data) : [];
        if (!rows.length) return;

        const selectedAtLoad = selectedKeyRef.current || plcConfig.key || plcConfig.ip;
        const row = rows.find((item) => (item.machine_key || item.plc_ip) === selectedAtLoad || item.plc_ip === selectedAtLoad);

        const nextReadingsByKey = {};
        const nextMetaByKey = {};
        const nextHistoryByKey = {};
        const nextStatusByKey = {};
        rows.forEach((item) => {
          const key = item.machine_key || item.plc_ip;
          const machine = DEFAULT_MACHINES.find((entry) => getMachineKey(entry) === key || entry.ip === item.plc_ip);
          const itemKind = machine?.kind || getMachineKindFromRow(item);
          const itemTimestamp = getRowTimestamp(item);
          const itemHistory = { id: `db-${item.id || itemTimestamp}`, timestamp: new Date(itemTimestamp), cycleTime: item.cycle_time ?? null };
          nextReadingsByKey[key] = rowToReadings(item, itemKind);
          if (item.plc_ip) nextReadingsByKey[item.plc_ip] = nextReadingsByKey[key];
          nextMetaByKey[key] = {
            timestamp: itemTimestamp,
            cycleTime: item.cycle_time ?? null,
            partName: item.part_qr_code || item.scan_data || item.part_name || "",
            shotTime: buildShotTimeFromRow(item),
          };
          if (item.plc_ip) nextMetaByKey[item.plc_ip] = nextMetaByKey[key];
          nextHistoryByKey[key] = [itemHistory];
          if (item.plc_ip) nextHistoryByKey[item.plc_ip] = [itemHistory];
          nextStatusByKey[key] = {
            ...(machine || {}),
            key,
            machine_key: key,
            ip: item.plc_ip || machine?.ip,
            port: Number(item.plc_port || machine?.port || 5002),
            name: item.machine_name || machine?.name,
            kind: itemKind,
            connected: Boolean(item.is_online),
            hasRecentData: true,
            lastCycleAt: itemTimestamp,
            partName: item.part_qr_code || item.scan_data || item.part_name || "",
            cycleTime: item.cycle_time ?? null,
          };
          if (item.plc_ip) nextStatusByKey[item.plc_ip] = nextStatusByKey[key];
        });

        setReadingsByIp(prev => ({ ...prev, ...nextReadingsByKey }));
        setMetaByIp(prev => ({ ...prev, ...nextMetaByKey }));
        setHistoryByIp(prev => ({ ...prev, ...nextHistoryByKey }));
        setMachineStatuses(prev => ({ ...prev, ...nextStatusByKey }));

        if (!row) return;

        const rowKey = row.machine_key || row.plc_ip;
        const rowMachine = DEFAULT_MACHINES.find((machine) => getMachineKey(machine) === rowKey || machine.ip === row.plc_ip);
        const nextReadings = rowToReadings(row, rowMachine?.kind || getMachineKindFromRow(row));
        const timestamp = getRowTimestamp(row);
        const cycleTime = row.cycle_time ?? null;
        const historyItem = { id: `db-${row.id || timestamp}`, timestamp: new Date(timestamp), cycleTime };
        setReadings(nextReadings);
        rememberSelectedSnapshot(nextReadings, { observedAt: timestamp, source: "db" });
        setCycleHistory([historyItem]);
        setCycleCount(1);
        setLastTimestamp(new Date(timestamp));
        setPartName(row.part_qr_code || row.scan_data || row.part_name || "");
        setShotTime(buildShotTimeFromRow(row));
        setPlcConfig({ key: rowKey, ip: row.plc_ip, port: Number(row.plc_port || rowMachine?.port || 5002), kind: rowMachine?.kind });
        setDraftConfig({ ip: row.plc_ip, port: String(row.plc_port || rowMachine?.port || 5002) });
      })
      .catch((error) => {
        setConfigMessage(error.response?.data?.message || "Latest PLC DB data load failed.");
      });

    return () => {
      cancelled = true;
    };
  }, [rememberSelectedSnapshot]);

  const pushSpark = useCallback((name, value) => {
    setSparklines(prev => {
      const arr = [...(prev[name] || []), value].slice(-20);
      return { ...prev, [name]: arr };
    });
  }, []);

  const applyReadings = useCallback((newReadings, timestamp, cycleTime) => {
    setReadings(newReadings);
    setLastTimestamp(new Date(timestamp));
    setCycleCount(c => c + 1);
    setCycleHistory(prev => [
      { id: Date.now(), timestamp: new Date(timestamp), cycleTime },
      ...prev,
    ].slice(0, 100));

    Object.entries(newReadings).forEach(([k, v]) => {
      if (v?.value !== undefined && v.value !== null) pushSpark(k, v.value);
    });
  }, [pushSpark]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const syncLatestDbSnapshot = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const response = await getPlcLatestReadings();
        if (cancelled) return;

        const rows = Array.isArray(response.data?.data)
          ? response.data.data.filter((item) => item.has_data)
          : [];
        if (!rows.length) return;

        const nextReadingsByKey = {};
        const nextMetaByKey = {};
        const nextHistoryByKey = {};
        const nextStatusByKey = {};
        const selectedAtPoll = selectedKeyRef.current || plcConfig.key || plcConfig.ip;

        rows.forEach((item) => {
          const key = item.machine_key || item.plc_ip;
          const machine = DEFAULT_MACHINES.find((entry) => getMachineKey(entry) === key || entry.ip === item.plc_ip);
          const itemKind = machine?.kind || getMachineKindFromRow(item);
          const itemTimestamp = getRowTimestamp(item);
          const itemReadings = rowToReadings(item, itemKind);
          const itemHistory = {
            id: `db-${item.id || itemTimestamp}`,
            timestamp: new Date(itemTimestamp),
            cycleTime: item.cycle_time ?? null,
          };

          nextReadingsByKey[key] = itemReadings;
          if (item.plc_ip) nextReadingsByKey[item.plc_ip] = itemReadings;
          nextMetaByKey[key] = {
            timestamp: itemTimestamp,
            cycleTime: item.cycle_time ?? null,
            partName: item.part_qr_code || item.scan_data || item.part_name || "",
            shotTime: buildShotTimeFromRow(item),
          };
          if (item.plc_ip) nextMetaByKey[item.plc_ip] = nextMetaByKey[key];
          nextHistoryByKey[key] = [itemHistory];
          if (item.plc_ip) nextHistoryByKey[item.plc_ip] = [itemHistory];
          nextStatusByKey[key] = {
            ...(machine || {}),
            key,
            machine_key: key,
            ip: item.plc_ip || machine?.ip,
            port: Number(item.plc_port || machine?.port || 5002),
            name: item.machine_name || machine?.name,
            kind: itemKind,
            connected: Boolean(item.is_online),
            hasRecentData: true,
            lastCycleAt: itemTimestamp,
            lastShotNumber: item.shot_number ?? null,
            partName: item.part_qr_code || item.scan_data || item.part_name || "",
            cycleTime: item.cycle_time ?? null,
          };
          if (item.plc_ip) nextStatusByKey[item.plc_ip] = nextStatusByKey[key];
        });

        setReadingsByIp(prev => ({ ...prev, ...nextReadingsByKey }));
        setMetaByIp(prev => ({ ...prev, ...nextMetaByKey }));
        setHistoryByIp(prev => ({ ...prev, ...nextHistoryByKey }));
        setMachineStatuses(prev => ({ ...prev, ...nextStatusByKey }));

        const selectedRow = rows.find((item) =>
          (item.machine_key || item.plc_ip) === selectedAtPoll ||
          item.plc_ip === selectedAtPoll
        );
        if (!selectedRow) return;

        const rowKey = selectedRow.machine_key || selectedRow.plc_ip;
        const rowMachine = DEFAULT_MACHINES.find((machine) => getMachineKey(machine) === rowKey || machine.ip === selectedRow.plc_ip);
        const nextReadings = rowToReadings(selectedRow, rowMachine?.kind || getMachineKindFromRow(selectedRow));
        const timestamp = getRowTimestamp(selectedRow);
        const cycleTime = selectedRow.cycle_time ?? null;
        const historyItem = { id: `db-${selectedRow.id || timestamp}`, timestamp: new Date(timestamp), cycleTime };

        if (isOlderDbSnapshotForSelectedMachine(selectedRow)) return;

        setReadings(nextReadings);
        rememberSelectedSnapshot(nextReadings, { observedAt: timestamp, source: "db" });
        setLastTimestamp(new Date(timestamp));
        setPartName(selectedRow.part_qr_code || selectedRow.scan_data || selectedRow.part_name || "");
        setShotTime(buildShotTimeFromRow(selectedRow));
        setCycleHistory(prev => {
          if (prev[0]?.id === historyItem.id) return prev;
          return [historyItem, ...prev].slice(0, 100);
        });
        setCycleCount(prev => Math.max(prev, 1));

        Object.entries(nextReadings).forEach(([name, item]) => {
          if (item?.value !== undefined && item.value !== null) pushSpark(name, item.value);
        });
      } catch (error) {
        if (!cancelled) {
          setConfigMessage(error.response?.data?.message || "Latest PLC auto refresh failed.");
        }
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(syncLatestDbSnapshot, PLC_LATEST_POLL_MS);
    syncLatestDbSnapshot();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOlderDbSnapshotForSelectedMachine, plcConfig.ip, plcConfig.key, pushSpark, rememberSelectedSnapshot]);

  const loadMachineSnapshot = useCallback((machineOrKey) => {
    const lookupKeys = typeof machineOrKey === "object"
      ? [getMachineKey(machineOrKey), machineOrKey.ip].filter(Boolean)
      : [machineOrKey].filter(Boolean);
    const snapshotKey = lookupKeys.find((key) => readingsByIp[key]) || lookupKeys[0];
    const nextReadings = snapshotKey ? readingsByIp[snapshotKey] || {} : {};
    const nextMeta = snapshotKey ? metaByIp[snapshotKey] || {} : {};
    const nextHistory = snapshotKey ? historyByIp[snapshotKey] || [] : [];
    const nextSparks = snapshotKey ? sparkByIp[snapshotKey] || {} : {};

    setReadings(nextReadings);
    setCycleHistory(nextHistory);
    setCycleCount(nextHistory.length);
    setSparklines(nextSparks);
    setLastTimestamp(nextMeta.timestamp ? new Date(nextMeta.timestamp) : null);
    setPartName(nextMeta.partName || "");
    setShotTime(nextMeta.shotTime || "");
    setCycleStatus("idle");
  }, [historyByIp, metaByIp, readingsByIp, sparkByIp]);

  const normalizeConfig = useCallback((config = {}) => {
    const key = config.key || config.machine_key || config.ip;
    const localMachine = DEFAULT_MACHINES.find((machine) => getMachineKey(machine) === key)
      || machines.find((machine) => getMachineKey(machine) === key || machine.ip === config.ip);
    const machineKey = localMachine ? getMachineKey(localMachine) : key;
    return {
      key: machineKey,
      ip: localMachine?.ip || config.ip,
      port: Number(localMachine?.port || config.port || 5002),
      kind: localMachine?.kind || config.kind || "ube",
    };
  }, [machines]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = setTimeout(() => {
        setSocketConnected(false);
        setPlcConnected(false);
      }, 1800);
    });

    socket.on("plc_status", ({ connected }) => {
      setPlcConnected(connected);
    });

    socket.on("plc_config", (config) => {
      const nextConfig = normalizeConfig(config);
      if (nextConfig.key && selectedKeyRef.current && nextConfig.key !== selectedKeyRef.current) {
        return;
      }

      setPlcConfig(nextConfig);
      setDraftConfig({ ip: nextConfig.ip, port: String(nextConfig.port) });
    });

    socket.on("machines", (list = []) => {
      setMachines(list.length ? mergeMachineList(list) : DEFAULT_MACHINES);
    });

    socket.on("monitoring_status", ({ running }) => {
      setMonitoringRunning(Boolean(running));
    });

    socket.on("machines_status", (list = []) => {
      setMachineStatuses(prev => {
        const next = { ...prev };
        list.forEach((item) => {
          const key = getMachineKey(item);
          next[key] = { ...(prev[key] || {}), ...item };
          if (item.ip) next[item.ip] = { ...(prev[item.ip] || {}), ...item };
        });
        return next;
      });
    });

    socket.on("plc_data", ({ timestamp, observedAt, liveOnly = false, cycleTime, readings: r = {}, config, partName: nextPartName, shotTime: nextShotTime }) => {
      const key = config?.key || config?.ip || selectedKeyRef.current;
      const ip = config?.ip || key;
      const port = Number(config?.port || 5002);
      const eventTimestamp = r?.cycle_end_time?.value || r?.shot_datetime?.value || timestamp || null;
      const observedTimestamp = observedAt || new Date().toISOString();
      const eventPartName = r?.part_qr_code?.value || r?.scan_data?.value || nextPartName || "";

      setReadingsByIp(prev => ({ ...prev, [key]: r, [ip]: r }));
      setMetaByIp(prev => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          timestamp: liveOnly ? prev[key]?.timestamp || eventTimestamp : eventTimestamp,
          observedAt: observedTimestamp,
          cycleTime,
          partName: eventPartName,
          shotTime: nextShotTime,
        },
        [ip]: {
          ...(prev[ip] || {}),
          timestamp: liveOnly ? prev[ip]?.timestamp || eventTimestamp : eventTimestamp,
          observedAt: observedTimestamp,
          cycleTime,
          partName: eventPartName,
          shotTime: nextShotTime,
        },
      }));
      setSparkByIp(prev => {
        const next = { ...(prev[key] || {}) };
        Object.entries(r).forEach(([name, item]) => {
          if (item?.value !== undefined && item.value !== null) {
            next[name] = [...(next[name] || []), item.value].slice(-20);
          }
        });
        return { ...prev, [key]: next, [ip]: next };
      });

      if (selectedKeyRef.current !== key && selectedKeyRef.current !== ip) return;

      setPlcConfig({ key, ip, port, kind: config?.kind });
      setDraftConfig({ ip, port: String(port) });
      setReadings(r);
      rememberSelectedSnapshot(r, { observedAt: observedTimestamp, source: "live" });
      if (!liveOnly && eventTimestamp) {
        setLastTimestamp(new Date(eventTimestamp));
      }
      setPartName(eventPartName);
      setShotTime(nextShotTime || "");
      Object.entries(r).forEach(([name, item]) => {
        if (item?.value !== undefined && item.value !== null) pushSpark(name, item.value);
      });
    });

    socket.on("cycle_complete", ({ timestamp, cycleTime, readings: r, config, partName: nextPartName, shotTime: nextShotTime }) => {
      const key = config?.key || config?.ip || selectedKeyRef.current;
      const ip = config?.ip || key;
      const port = Number(config?.port || 5002);
      const eventTimestamp = r?.cycle_end_time?.value || r?.shot_datetime?.value || timestamp;
      const eventPartName = r?.part_qr_code?.value || r?.scan_data?.value || nextPartName || "";
      const historyItem = { id: `${key}-${eventTimestamp}`, timestamp: new Date(eventTimestamp), cycleTime };

      setReadingsByIp(prev => ({ ...prev, [key]: r, [ip]: r }));
      setMetaByIp(prev => ({
        ...prev,
        [key]: { timestamp: eventTimestamp, cycleTime, partName: eventPartName, shotTime: nextShotTime },
        [ip]: { timestamp: eventTimestamp, cycleTime, partName: eventPartName, shotTime: nextShotTime },
      }));
      setHistoryByIp(prev => ({
        ...prev,
        [key]: [historyItem, ...(prev[key] || [])].slice(0, 100),
        [ip]: [historyItem, ...(prev[ip] || [])].slice(0, 100),
      }));
      setSparkByIp(prev => {
        const next = { ...(prev[key] || {}) };
        Object.entries(r).forEach(([k, v]) => {
          if (v?.value !== undefined && v.value !== null) {
            next[k] = [...(next[k] || []), v.value].slice(-20);
          }
        });
        return { ...prev, [key]: next, [ip]: next };
      });

      if (selectedKeyRef.current !== key && selectedKeyRef.current !== ip) return;

      selectedKeyRef.current = key;
      setPlcConfig({ key, ip, port, kind: config?.kind });
      setDraftConfig({ ip, port: String(port) });
      setCycleStatus("complete");
      setReadings(r);
      rememberSelectedSnapshot(r, { observedAt: eventTimestamp, source: "live" });
      setLastTimestamp(new Date(eventTimestamp));
      setPartName(eventPartName);
      setShotTime(nextShotTime || "");
      setCycleHistory(prev => [historyItem, ...prev].slice(0, 100));
      setCycleCount(c => c + 1);
      Object.entries(r).forEach(([k, v]) => {
        if (v?.value !== undefined && v.value !== null) pushSpark(k, v.value);
      });
      setConfigMessage(`${machines.find((machine) => getMachineKey(machine) === key)?.name || MACHINE_NAMES[ip] || ip} live data received.`);
      setTimeout(() => setCycleStatus("idle"), 3000);
    });

    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      socket.disconnect();
    };
  }, [normalizeConfig, pushSpark, rememberSelectedSnapshot]);

  const st = STATUS_CFG[cycleStatus] || STATUS_CFG.idle;
  const shotNumber = readings.shot_number?.value ?? null;
  const highShot = readings.ok_shot?.value ?? null;
  const cycleTime = readings.cycle_time?.value ?? null;
  const shotDate = readings.shot_date?.value || buildShotDateFromRow(
    Object.fromEntries(Object.entries(readings).map(([name, item]) => [name, item?.value ?? null]))
  );
  const plcShotTime = readings.shot_time?.value || shotTime || buildShotTimeFromRow(
    Object.fromEntries(Object.entries(readings).map(([name, item]) => [name, item?.value ?? null]))
  );
  const selectedMachineKey = plcConfig.key || plcConfig.ip;
  const selectedMachine = DEFAULT_MACHINES.find((machine) => getMachineKey(machine) === selectedMachineKey || machine.ip === plcConfig.ip)
    || machines.find((machine) => getMachineKey(machine) === selectedMachineKey || machine.ip === plcConfig.ip);
  const machineName = selectedMachine?.name || MACHINE_NAMES[plcConfig.ip] || "Unknown Machine";
  const selectedMachineKind = selectedMachine?.kind || plcConfig.kind || "ube";
  const isLeakTestMachine = selectedMachineKind === "leaktest";
  const selectedMachineStatus = machineStatuses[selectedMachineKey] || machineStatuses[plcConfig.ip] || {};
  const selectedMachineOnline = Boolean(selectedMachineStatus.connected);
  const selectedPlcConnected = Boolean(selectedMachineStatus.connected || selectedMachineStatus.hasRecentData || readings.plc_ip?.value);
  const availableGroups = REGISTER_GROUPS
    .filter((group) => group.kind === selectedMachineKind)
    .filter((group) => {
      if (group.id !== "machine_bits") return true;
      return group.keys.some(({ name }) => {
        const value = readings[name]?.value;
        if (!hasReadableValue(value)) return false;
        if (name === "cycle_end" && Number(value) === 0) return false;
        return true;
      });
    });
  const validActiveGroup = availableGroups.some((group) => group.id === activeGroup) ? activeGroup : null;
  const baseDisplayGroups = validActiveGroup
    ? availableGroups.filter(g => g.id === validActiveGroup)
    : availableGroups;
  const displayGroups = baseDisplayGroups
    .map((group) => (
      group.id === "machine_bits"
        ? {
            ...group,
            keys: group.keys.filter(({ name }) => {
              const value = readings[name]?.value;
              if (!hasReadableValue(value)) return false;
              if (name === "cycle_end" && Number(value) === 0) return false;
              return true;
            }),
          }
        : group
    ))
    .filter((group) => group.keys.length > 0);
  const compactCardHiddenFields = new Set([
    "machine_name",
    "plc_ip",
    "shot_datetime",
    "shot_year",
    "shot_month",
    "shot_day",
    "shot_hour",
    "shot_minute",
    "shot_second",
  ]);
  const cardGroups = displayGroups
    .map((group) => ({
      ...group,
      keys: group.keys.filter(({ name }) => !compactCardHiddenFields.has(name)),
    }))
    .filter((group) => group.keys.length > 0);
  const reportReading = {
    ...Object.fromEntries(Object.entries(readings).map(([name, item]) => [name, item?.value ?? null])),
    machine_name: readings.machine_name?.value || machineName,
    machine_key: readings.machine_key?.value || selectedMachineKey,
    kind: selectedMachineKind,
    plc_ip: readings.plc_ip?.value || readings.ip?.value || plcConfig.ip,
    plc_port: readings.plc_port?.value || plcConfig.port,
    part_name: readings.part_name?.value || readings.part_qr_code?.value || partName,
    shot_date: readings.shot_date?.value || shotDate,
    shot_time: readings.shot_time?.value || plcShotTime,
    shot_datetime: readings.shot_datetime?.value || readings.recorded_at?.value || lastTimestamp?.toISOString(),
    cycle_end_time: readings.cycle_end_time?.value || lastTimestamp?.toISOString(),
    recorded_at: readings.shot_datetime?.value || lastTimestamp?.toISOString(),
  };

  const resetDashboardData = () => {
    setCycleStatus("idle");
    setLastTimestamp(null);
    setPartName("");
    setShotTime("");
    setReadings({});
    setCycleHistory([]);
    setCycleCount(0);
    setSparklines({});
  };

  const selectMachine = (key) => {
    const machine = DEFAULT_MACHINES.find(item => getMachineKey(item) === key)
      || machines.find(item => getMachineKey(item) === key)
      || { key, ip: key, port: 5002 };
    const config = { key: getMachineKey(machine), ip: machine.ip, port: Number(machine.port || draftConfig.port || 5002), kind: machine.kind };
    selectedKeyRef.current = config.key;
    setPlcConfig(config);
    setDraftConfig({ ip: config.ip, port: String(config.port) });
    resetDashboardData();
    setConfigMessage(`${machine.name || MACHINE_NAMES[config.ip] || "Machine"} selected.`);
    loadMachineSnapshot(machine);
    socketRef.current?.emit("update_plc_config", config);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Rajdhani:wght@500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; }
        * { margin: 0; padding: 0; }

        :root {
          --bg: #eef3ff;
          --panel: #f9fbfe;
          --panel-2: #eef4fb;
          --panel-3: #20224a;
          --line: rgba(28, 63, 104, 0.13);
          --line-strong: rgba(28, 63, 104, 0.24);
          --text: #102b46;
          --muted: #5f7288;
          --faint: #8a98ad;
          --green: #22c55e;
          --red: #f3797e;
          --amber: #e17a00;
          --cyan: #1474b8;
          --overview-card-height: 112px;
          --mono: 'Inter', system-ui, sans-serif;
          --sans: 'Inter', system-ui, sans-serif;
        }

        body {
          background: var(--bg);
          color: var(--text);
        }

        .dash {
          min-height: 0;
          background: transparent;
          font-family: var(--sans);
        }

        .theme-dark {
          --bg: #070b12;
          --panel: #101722;
          --panel-2: #141d2a;
          --panel-3: #0c111a;
          --line: rgba(148, 163, 184, 0.16);
          --line-strong: rgba(148, 163, 184, 0.28);
          --text: #e5edf7;
          --muted: #7f8ea3;
          --faint: #4d5b6e;
          --cyan: #22d3ee;
          --overview-card-height: 108px;
          background:
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px) 0 0 / 36px 36px,
            linear-gradient(0deg, rgba(255,255,255,0.02) 1px, transparent 1px) 0 0 / 36px 36px,
            radial-gradient(circle at 18% -12%, rgba(34,211,238,0.12), transparent 34%),
            linear-gradient(180deg, #0b111b 0%, #070b12 45%, #05070c 100%);
        }

        .shell {
          width: 100%;
          margin: 0;
        }

        .header {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          background: linear-gradient(135deg, #f8fbff 0%, #edf4ff 100%);
          box-shadow: 0 16px 34px rgba(75,73,172,0.11);
        }

        .plant-tag {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--cyan);
          letter-spacing: 1.8px;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text);
          font-family: var(--mono);
          font-size: clamp(20px, 2.4vw, 30px);
          font-weight: 700;
          letter-spacing: 0;
        }

        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 0 4px rgba(34,197,94,0.12);
        }

        .status-dot.off {
          background: var(--red);
          box-shadow: 0 0 0 4px rgba(239,68,68,0.12);
        }

        .header-sub {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 12px;
          margin-top: 6px;
        }

        .header-controls {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px 14px;
          align-items: center;
          min-width: min(520px, 42vw);
        }

        .plc-form {
          display: grid;
          grid-template-columns: minmax(180px, 280px);
          gap: 8px;
          align-items: end;
          justify-content: end;
        }

        .field {
          display: grid;
          gap: 5px;
          min-width: 0;
        }

        .field span {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .field input,
        .field select {
          width: 100%;
          height: 36px;
          border: 1px solid var(--line-strong);
          border-radius: 8px;
          background: #ffffff;
          color: var(--text);
          font-family: var(--mono);
          font-size: 12px;
          outline: none;
          padding: 0 10px;
        }

        .field select {
          appearance: auto;
          background: #ffffff;
          color: var(--text);
        }

        .field select option {
          background: #ffffff;
          color: var(--text);
        }

        .field input:focus,
        .field select:focus {
          border-color: var(--cyan);
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }

        .apply-btn,
        .run-btn {
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--line-strong);
          background: #ffffff;
          color: var(--text);
          cursor: pointer;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.5px;
          padding: 0 12px;
          transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
        }

        .apply-btn:hover,
        .run-btn:hover {
          transform: translateY(-1px);
          border-color: rgba(75,73,172,0.38);
        }

        .run-btn {
          background: var(--green);
          border-color: rgba(34,197,94,0.65);
          color: #07120b;
        }

        .run-btn.is-running {
          background: #ef4444;
          border-color: rgba(239,68,68,0.72);
          color: #ffffff;
        }

        .apply-btn:disabled {
          cursor: wait;
          opacity: 0.7;
          transform: none;
        }

        .config-line {
          grid-column: 1 / -1;
          color: #aab3c0;
          font-family: var(--mono);
          font-size: 11px;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          min-height: 16px;
        }

        .config-line span {
          color: var(--cyan);
        }

        .overview {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          grid-auto-rows: minmax(var(--overview-card-height), auto);
          gap: 10px;
          margin: 10px 0;
        }

        .process-state {
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: linear-gradient(180deg, #ffffff, #f2f6fb);
          padding: 10px 12px;
          min-height: var(--overview-card-height);
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 10px 22px rgba(19,75,143,0.06);
          overflow: hidden;
        }

        .state-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }

        .state-label {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }

        .state-value {
          margin-top: 8px;
          font-size: clamp(16px, 1.05vw, 19px);
          font-weight: 600;
          font-family: var(--mono);
          color: var(--text);
          line-height: 1.12;
          font-variant-numeric: tabular-nums;
          overflow-wrap: anywhere;
          word-break: break-word;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }

        .state-sub {
          margin-top: 6px;
          color: var(--muted);
          font-family: var(--mono);
          font-size: 11px;
          line-height: 1.35;
          display: -webkit-box;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .status-chip {
          border-radius: 999px;
          padding: 5px 9px;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          border: 1px solid rgba(255,255,255,0.22);
          color: #d8dde5;
          background: rgba(255,255,255,0.08);
          flex: 0 1 auto;
          line-height: 1.15;
          max-width: 104px;
          text-align: center;
          white-space: normal;
        }

        .status-complete .status-chip {
          color: #16a34a;
          border-color: rgba(34,197,94,0.46);
          background: rgba(34,197,94,0.13);
        }

        .status-idle .status-chip {
          color: var(--red);
          border-color: rgba(243,121,126,0.42);
          background: rgba(243,121,126,0.1);
        }

        .metric {
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: linear-gradient(180deg, #ffffff, #f2f6fb);
          padding: 10px 12px;
          min-height: var(--overview-card-height);
          min-width: 0;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 22px rgba(19,75,143,0.06);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .metric::before {
          content: '';
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: var(--metric-color, var(--cyan));
        }

        .metric-cyan { --metric-color: var(--cyan); }
        .metric-green { --metric-color: var(--green); }
        .metric-amber { --metric-color: var(--amber); }
        .metric-slate { --metric-color: #94a3b8; }

        .metric-label {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .metric-value {
          margin-top: 8px;
          color: var(--text);
          font-family: var(--mono);
          font-size: clamp(17px, 1.15vw, 22px);
          font-weight: 600;
          line-height: 1.12;
          font-variant-numeric: tabular-nums;
          white-space: normal;
          overflow: hidden;
          text-overflow: ellipsis;
          overflow-wrap: anywhere;
          word-break: break-word;
          max-width: 100%;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .metric-unit {
          margin-left: 6px;
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
        }

        .metric-machine .metric-value {
          font-size: clamp(15px, 1vw, 18px);
          line-height: 1.15;
          overflow-wrap: anywhere;
          white-space: normal;
          display: -webkit-box;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .dashboard-content {
          width: 100%;
          margin-top: 6px;
        }

        .content-main {
          min-width: 0;
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          background: linear-gradient(180deg, #f8fbff, #edf4ff);
          overflow: hidden;
          box-shadow: 0 14px 30px rgba(28,48,90,0.08);
        }

        .info-card {
          background: linear-gradient(180deg, #f8fbff, #edf4ff);
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          padding: 11px 13px;
          box-shadow: 0 10px 22px rgba(28,48,90,0.06);
        }

        .info-card-title {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 8px;
        }

        .info-time {
          font-family: var(--mono);
          font-size: 20px;
          font-weight: 700;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }

        .info-date {
          color: var(--faint);
          font-family: var(--mono);
          font-size: 12px;
          margin-top: 4px;
        }

        .info-ct {
          margin-top: 9px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          border: 1px solid rgba(8,145,178,0.26);
          border-radius: 6px;
          color: var(--cyan);
          background: rgba(8,145,178,0.06);
          padding: 6px 9px;
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
        }

        .info-none {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 13px;
          padding: 12px 0;
        }

        .hist-row {
          display: grid;
          grid-template-columns: 1fr 84px;
          align-items: center;
          gap: 12px;
          padding: 7px 0;
          border-bottom: 1px solid var(--line);
          font-family: var(--mono);
          font-size: 12px;
        }

        .hist-row:last-child { border-bottom: 0; }
        .hist-time { color: var(--text); }
        .hist-ct { color: var(--green); text-align: right; font-weight: 700; }
        .hist-ct.old { color: var(--muted); font-weight: 500; }

        .history-card {
          max-height: 190px;
          overflow: hidden;
        }

        .history-scroll {
          max-height: 140px;
          overflow-y: auto;
          padding-right: 6px;
          scrollbar-width: thin;
          scrollbar-color: var(--line-strong) transparent;
        }

        .history-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .history-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .history-scroll::-webkit-scrollbar-thumb {
          background: var(--line-strong);
          border-radius: 999px;
        }

        .machine-status-card {
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          background: linear-gradient(180deg, #f8fbff, #edf4ff);
          padding: 11px 13px;
          box-shadow: 0 10px 22px rgba(28,48,90,0.06);
          width: 100%;
        }

        .table-side-card {
          align-self: start;
        }

        .msc-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .msc-label {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .msc-title {
          margin-top: 4px;
          color: var(--text);
          font-family: var(--mono);
          font-size: 17px;
          font-weight: 700;
          line-height: 1.15;
        }

        .msc-pill {
          border: 1px solid rgba(239,68,68,0.34);
          border-radius: 999px;
          color: var(--red);
          background: rgba(239,68,68,0.08);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 800;
          padding: 6px 9px;
          white-space: nowrap;
        }

        .msc-pill.online {
          border-color: rgba(34,197,94,0.36);
          color: var(--green);
          background: rgba(34,197,94,0.09);
        }

        .msc-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
        }

        .msc-item {
          border: 1px solid var(--line-strong);
          border-radius: 6px;
          padding: 7px 9px;
          font-family: var(--mono);
          background: rgba(255,255,255,0.44);
        }

        .msc-item span {
          display: block;
          color: var(--muted);
          font-size: 10px;
          text-transform: uppercase;
        }

        .msc-item strong {
          display: block;
          margin-top: 4px;
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          overflow-wrap: anywhere;
        }

        .msc-item.is-off-shot {
          border-color: rgba(245,158,11,0.46);
          background: rgba(245,158,11,0.1);
        }

        .msc-item.is-off-shot strong {
          color: var(--amber);
        }

        .msc-foot {
          margin-top: 11px;
          color: var(--muted);
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-family: var(--mono);
          font-size: 11px;
        }

        .msc-foot span {
          color: var(--red);
          overflow-wrap: anywhere;
        }

        .view-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0;
          width: 100%;
          padding: 10px;
          border-bottom: 1px solid var(--line-strong);
          background: rgba(237,244,255,0.92);
        }

        .group-tabs {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin: 0;
        }

        .report-btn {
          height: 34px;
          min-width: 86px;
          border: 1px solid rgba(34,197,94,0.36);
          border-radius: 7px;
          background: rgba(34,197,94,0.12);
          color: var(--green);
          cursor: pointer;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 800;
        }

        .report-btn:hover {
          background: rgba(34,197,94,0.18);
        }

        .report-btn:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .report-backdrop {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(17,24,39,0.7);
          padding: 22px;
          backdrop-filter: blur(10px);
        }

        .report-modal {
          width: min(1340px, 100%);
          max-height: 88vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 28px 80px rgba(15,23,42,0.36);
        }

        .report-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 16px 18px;
          border-bottom: 1px solid var(--line-strong);
        }

        .report-kicker,
        .preview-kicker {
          color: #22d3ee;
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .report-title {
          margin-top: 6px;
          color: #111827;
          font-size: 24px;
          font-weight: 900;
          line-height: 1.05;
        }

        .report-sub {
          margin-top: 8px;
          color: #64748b;
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
        }

        .report-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
          flex-wrap: wrap;
        }

        .report-date {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #6b7280;
          font-size: 13px;
          font-weight: 800;
        }

        .report-date input {
          height: 42px;
          width: 174px;
          border: 1px solid #c8d8ff;
          border-radius: 7px;
          background: #f8fbff;
          color: #111827;
          font-size: 16px;
          font-weight: 800;
          padding: 0 12px;
          outline: none;
        }

        .preview-btn,
        .download-btn,
        .close-btn {
          height: 42px;
          border-radius: 7px;
          border: 1px solid transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 900;
          text-decoration: none;
          white-space: nowrap;
        }

        .preview-btn {
          border-color: #c8d8ff;
          background: #edf4ff;
          color: #2563eb;
          padding: 0 14px;
        }

        .download-btn {
          background: #10b981;
          color: #05130e;
          padding: 0 18px;
        }

        .download-warn {
          background: #f59e0b;
          color: #241600;
        }

        .close-btn {
          width: 42px;
          border-color: #c8d8ff;
          background: #f8fbff;
          color: #64748b;
          font-size: 28px;
          line-height: 1;
        }

        .report-body {
          min-height: 0;
          flex: 1;
          display: grid;
          grid-template-columns: 1.12fr 0.88fr;
          overflow: hidden;
        }

        .report-pane {
          min-width: 0;
          overflow: auto;
        }

        .report-parameters {
          border-right: 1px solid var(--line-strong);
        }

        .report-table {
          width: 100%;
          min-width: 650px;
          border-collapse: collapse;
          text-align: left;
          font-size: 14px;
        }

        .report-table th {
          position: sticky;
          top: 0;
          z-index: 2;
          border-bottom: 1px solid var(--line-strong);
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.7px;
          padding: 13px 16px;
          text-transform: uppercase;
        }

        .report-table td {
          border-bottom: 1px solid #e9eef7;
          color: #334155;
          font-weight: 700;
          padding: 13px 16px;
        }

        .report-table td strong {
          color: #020617;
          font-size: 16px;
        }

        .report-group {
          background: #f8fafc;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .report-unit {
          margin-left: 6px;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
        }

        .preview-head {
          position: sticky;
          top: 0;
          z-index: 3;
          border-bottom: 1px solid var(--line-strong);
          background: #ffffff;
          padding: 16px;
        }

        .connection-head {
          position: static;
          border-top: 1px solid var(--line-strong);
          margin-top: 12px;
        }

        .preview-kicker {
          color: #10b981;
        }

        .preview-count {
          margin-top: 6px;
          color: #334155;
          font-size: 13px;
          font-weight: 800;
        }

        .history-preview th {
          top: 64px;
        }

        .cycle-cell {
          color: #10b981 !important;
          font-weight: 900 !important;
        }

        .preview-loading,
        .empty-preview {
          color: #64748b;
          font-weight: 800;
          padding: 34px 16px !important;
          text-align: center;
        }

        .preview-error {
          margin: 14px;
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 7px;
          background: rgba(239,68,68,0.08);
          color: #b91c1c;
          font-weight: 800;
          padding: 10px 12px;
        }

        .tab {
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #ffffff;
          color: var(--muted);
          cursor: pointer;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          min-height: 34px;
          padding: 0 12px;
          transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
        }

        .tab:hover {
          color: #111111;
          border-color: var(--line-strong);
          background: #f3f4f6;
        }

        .tab.active {
          color: #ffffff;
          background: #111111;
        }

        .group-section {
          margin: 12px 0 18px;
          padding: 0 12px;
        }

        .group-header {
          display: grid;
          grid-template-columns: auto auto 1fr auto;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .group-icon {
          border: 1px solid color-mix(in srgb, var(--group-color) 45%, transparent);
          border-radius: 4px;
          color: var(--group-color);
          background: color-mix(in srgb, var(--group-color) 8%, transparent);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          padding: 3px 6px;
        }

        .group-label {
          color: var(--group-color);
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }

        .group-line {
          height: 1px;
          background: linear-gradient(90deg, color-mix(in srgb, var(--group-color) 45%, transparent), var(--line));
        }

        .group-count {
          color: var(--faint);
          font-family: var(--mono);
          font-size: 10px;
          text-transform: uppercase;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
        }

        .param-table-wrap {
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          overflow: auto;
          max-height: 610px;
          width: 100%;
        }

        .param-table {
          width: 100%;
          min-width: 480px;
          border-collapse: collapse;
          font-family: var(--mono);
          font-size: 12px;
          table-layout: fixed;
        }

        .param-table th,
        .param-table td {
          border-bottom: 1px solid var(--line);
          padding: 8px 14px;
          text-align: left;
          color: var(--text);
          height: 36px;
        }

        .param-table th:first-child,
        .param-table td:first-child {
          width: 58%;
        }

        .param-table th:last-child,
        .param-table td:last-child {
          width: 42%;
        }

        .param-table th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #f8fafc;
          color: var(--muted);
          font-size: 10px;
          letter-spacing: 1.1px;
          text-transform: uppercase;
        }

        .param-table tbody tr:hover td {
          background: rgba(8,145,178,0.045);
        }

        .param-table tr:last-child td {
          border-bottom: 0;
        }

        .table-value {
          color: var(--text);
          font-size: 13px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .table-unit {
          margin-left: 6px;
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
        }

        .table-value.status-off {
          color: var(--amber);
        }

        .table-value.status-high {
          color: var(--green);
        }

        .vcard {
          background:
            linear-gradient(180deg, #ffffff, #f3f7fb);
          border: 1px solid var(--line-strong);
          border-left: 3px solid var(--accent);
          border-radius: 10px;
          min-height: 78px;
          padding: 9px 10px;
          box-shadow: 0 8px 18px rgba(19,75,143,0.055);
          transition: border-color 0.16s ease, transform 0.16s ease, background 0.16s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .vcard:hover {
          border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
          background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, #f8fbff), #edf4ff);
          transform: translateY(-1px);
        }

        .vcard-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 7px;
        }

        .vcard-name {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          line-height: 1.25;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .vcard-led {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 10px var(--accent);
          flex: 0 0 auto;
          opacity: 0.9;
        }

        .vcard-bottom {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 10px;
        }

        .vcard-readout {
          flex: 1 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
        }

        .vcard-val {
          color: var(--text);
          font-family: var(--mono);
          font-size: clamp(14px, 0.95vw, 18px);
          font-weight: 600;
          line-height: 1.16;
          font-variant-numeric: tabular-nums;
          display: inline-block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: bottom;
          white-space: nowrap;
        }

        .vcard-unit {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 600;
          margin-left: 5px;
        }

        .spark {
          flex: 0 0 auto;
          opacity: 0.72;
        }

        .spark-empty {
          width: 54px;
          height: 24px;
          border-bottom: 1px solid rgba(16,43,70,0.16);
          flex: 0 0 auto;
        }

        .no-data {
          margin: 20px 0 26px;
          border: 1px dashed var(--line-strong);
          border-radius: 8px;
          background: rgba(248,251,255,0.9);
          color: var(--muted);
          font-family: var(--mono);
          padding: 34px 18px;
          text-align: center;
        }

        .no-data-title {
          color: #111111;
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .no-data-text {
          font-size: 12px;
        }

        .footer {
          margin-top: 38px;
          color: #8a929e;
          font-family: var(--mono);
          font-size: 11px;
          text-align: center;
        }

        .theme-dark .metric,
        .theme-dark .info-card,
        .theme-dark .machine-status-card,
        .theme-dark .vcard,
        .theme-dark .process-state {
          background: linear-gradient(180deg, rgba(20,29,42,0.94), rgba(9,13,20,0.96));
          box-shadow: 0 12px 30px rgba(0,0,0,0.22);
        }

        .theme-dark .header {
          background:
            linear-gradient(135deg, rgba(18,28,42,0.98), rgba(9,14,23,0.98));
          border-color: rgba(148,163,184,0.24);
          box-shadow: 0 18px 40px rgba(0,0,0,0.3);
        }

        .theme-dark .header-title {
          color: #f6fbff;
        }

        .theme-dark .field input,
        .theme-dark .field select {
          background: rgba(11,17,27,0.92);
          border-color: rgba(148,163,184,0.22);
          color: #dbe7f6;
        }

        .theme-dark .field select option {
          background: #101722;
          color: #dbe7f6;
        }

        .theme-dark .config-line {
          color: #8fa0b7;
        }

        .theme-dark .content-main {
          background: linear-gradient(180deg, rgba(13,20,31,0.96), rgba(8,12,19,0.98));
          box-shadow: 0 16px 34px rgba(0,0,0,0.24);
        }

        .theme-dark .view-bar {
          background: rgba(14,22,34,0.92);
        }

        .theme-dark .param-table-wrap {
          background: transparent;
          box-shadow: none;
        }

        .theme-dark .metric-value,
        .theme-dark .info-time,
        .theme-dark .msc-title,
        .theme-dark .msc-item strong,
        .theme-dark .vcard-val,
        .theme-dark .no-data-title,
        .theme-dark .state-value,
        .theme-dark .table-value {
          color: #ffffff;
        }

        .theme-dark .param-table th {
          background: #101722;
          color: #8fb1d8;
        }

        .theme-dark .param-table td {
          color: #dbe7f6;
        }

        .theme-dark .param-table tbody tr:hover td {
          background: rgba(34,211,238,0.045);
        }

        .theme-dark .msc-item {
          background: rgba(10,15,23,0.72);
        }

        .theme-dark .tab {
          background: rgba(10,15,23,0.8);
        }

        .theme-dark .tab:hover {
          color: #ffffff;
          background: rgba(20,29,42,0.94);
        }

        .theme-dark .tab.active {
          color: #ffffff;
          background: rgba(20,29,42,0.98);
        }

        .theme-dark .no-data {
          background: rgba(12,17,26,0.76);
        }

        .theme-dark .spark-empty {
          border-bottom-color: rgba(148,163,184,0.16);
        }

        @media (max-width: 1100px) {
          .overview {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .dashboard-content {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .header {
            grid-template-columns: 1fr;
          }

          .header-controls {
            min-width: 0;
            grid-template-columns: 1fr;
          }

          .plc-form {
            grid-template-columns: 1fr 90px;
          }

          .field:first-child,
          .run-btn {
            grid-column: 1 / -1;
          }

          .overview,
          .dashboard-content {
            grid-template-columns: 1fr;
          }

          .view-bar {
            align-items: stretch;
            flex-direction: column;
          }

          .report-btn {
            width: 100%;
          }

          .report-head {
            align-items: stretch;
            flex-direction: column;
          }

          .report-actions {
            justify-content: stretch;
          }

          .report-date,
          .preview-btn,
          .download-btn,
          .close-btn {
            flex: 1 1 145px;
          }

          .report-date input {
            width: 100%;
          }

          .report-body {
            grid-template-columns: 1fr;
          }

          .hist-row {
            grid-template-columns: 1fr 70px;
          }

          .cards-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
          }
        }
      `}</style>

      <div className={`dash theme-${theme}`}>
        <div className="shell">
          <header className="header">
            <div>
              <div className="plant-tag">Production Monitor</div>
              <div className="header-title">
                <span className={`status-dot ${socketConnected ? "" : "off"}`} />
                {machineName} Live Production
              </div>
              <div className="header-sub">
                Real-time machine parameters and latest cycle status
              </div>
            </div>

            <div className="header-controls">
              <div className="plc-form">
                <label className="field">
                  <span>Machine</span>
                  <select value={selectedMachineKey} onChange={(e) => selectMachine(e.target.value)}>
                    {machines.map(machine => {
                      const key = getMachineKey(machine);
                      const label = machine.name || MACHINE_NAMES[machine.ip] || machine.ip;
                      return (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <div className="config-line">
                Last update: {lastTimestamp ? lastTimestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "Waiting for cycle"}
                {selectedMachineStatus.error && <span>{selectedMachineStatus.error}</span>}
                {configMessage && <span>{configMessage}</span>}
              </div>
            </div>
          </header>

          <section className="overview">
            <div className={`process-state ${st.cls}`}>
              <div className="state-top">
                <div className="state-label">Machine State</div>
                <span className="status-chip">{st.label}</span>
              </div>
              <div className="state-value">
                {selectedMachineOnline ? "ONLINE" : socketConnected ? "SERVER READY" : "OFFLINE"}
              </div>
              <div className="state-sub">
                {machineName} | {monitoringRunning ? "RUNNING" : "STOPPED"}
              </div>
            </div>

            <MetricTile label={isLeakTestMachine ? "Part QR Code" : "Part Name"} value={partName || "-"} tone="cyan" />
            <MetricTile
              label={isLeakTestMachine ? "Result" : "Shot Number"}
              value={isLeakTestMachine ? readings.result?.value ?? null : shotNumber}
              tone="cyan"
            />
            <MetricTile
              label={isLeakTestMachine ? "Body Leak" : "OK Shot"}
              value={isLeakTestMachine ? readings.body_leak_value?.value ?? null : highShot}
              tone="green"
            />
            {isLeakTestMachine && (
              <MetricTile
                label="GALL-1 / GALL-2"
                value={[readings.gall_1?.value, readings.gall_2?.value].filter(value => value !== null && value !== undefined).join(" / ") || null}
                tone="amber"
              />
            )}
            <MetricTile label="Cycle Time" value={cycleTime} unit="sec" tone="green" />
            <MetricTile
              label={isLeakTestMachine ? "Cycle End Time" : "Shot Time"}
              value={isLeakTestMachine
                ? (lastTimestamp ? lastTimestamp.toLocaleTimeString() : null)
                : formatTimeOnly(plcShotTime)}
              tone="slate"
            />
            {!isLeakTestMachine && (
              <MetricTile
                label="Shot Date"
                value={shotDate ? formatDateOnly(shotDate) : null}
                tone="slate"
              />
            )}
          </section>

          <section className="dashboard-content">
            <div className="content-main">
              <div className="view-bar">
                <div className="group-tabs">
                  <button
                    className={`tab ${validActiveGroup === null ? "active" : ""}`}
                    style={validActiveGroup === null ? { borderColor: "#e5edf7" } : {}}
                    onClick={() => setActiveGroup(null)}
                  >
                    ALL
                  </button>
                  {availableGroups.map(g => (
                    <button
                      key={g.id}
                      className={`tab ${validActiveGroup === g.id ? "active" : ""}`}
                      style={validActiveGroup === g.id ? { borderColor: g.color, color: g.color } : {}}
                      onClick={() => setActiveGroup(prev => prev === g.id ? null : g.id)}
                    >
                      {g.icon} / {g.label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {Object.keys(readings).length === 0 && (
                <div className="no-data">
                  <div className="no-data-title">Waiting for first production cycle</div>
                  <div className="no-data-text">
                    {selectedPlcConnected
                      ? "PLC is connected. Dashboard will update automatically after cycle completion."
                      : "Connecting to PLC server and waiting for live machine data."}
                  </div>
                </div>
              )}

              {Object.keys(readings).length > 0 && cardGroups.map(group => (
                  <section
                    key={group.id}
                    className="group-section"
                    style={{ "--group-color": group.color }}
                  >
                    <div className="group-header">
                      <span className="group-icon">{group.icon}</span>
                      <span className="group-label">{group.label}</span>
                      <div className="group-line" />
                      <span className="group-count">{group.keys.length} regs</span>
                    </div>

                    <div className="cards-grid">
                      {group.keys.map(({ name, unit, label }) => {
                        const reg = readings[name];
                        return (
                          <ValueCard
                            key={name}
                            name={name}
                            label={label}
                            unit={unit}
                            value={reg?.value ?? null}
                            history={sparklines[name]}
                            accentColor={group.color}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
            </div>
          </section>

        </div>
      </div>
    </>
  );
}

export default function PlcMonitorPage({ onLogout, currentUser }) {
  return (
    <AppLayout onLogout={onLogout} currentUser={currentUser} hideFooter>
      <PLCDashboard />
    </AppLayout>
  );
}
