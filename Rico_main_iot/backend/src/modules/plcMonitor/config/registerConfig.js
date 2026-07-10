"use strict";

const path = require("path");

const TABLE = "dbo.PlcCycleReadings";
const LEAK_TEST_TABLE = "dbo.Leaktest";
const GAUGE_TABLE = "dbo.Gauge";
const CONNECTION_EVENTS_TABLE = "dbo.PlcConnectionEvents";
const MACHINE_READINGS_TABLE = "dbo.plc_machine_readings";
const MACHINE_READING_VALUES_TABLE = "dbo.plc_machine_reading_values";

const DEVICE_CODE = { M: 0x90, X: 0x9c, Y: 0x9d, D: 0xa8, R: 0xaf };
const CYCLE_START_DEVICE = process.env.PLC_CYCLE_START_DEVICE || "M840";
const CYCLE_END_DEVICE = process.env.PLC_CYCLE_END_DEVICE || "M4598";
const SHOT_DATE_TIME_DEVICES = {
  year: "D2100",
  month: "D2101",
  day: "D2102",
  hour: "D2103",
  minute: "D2104",
  second: "D2105",
};
const UBE_ALLOWED_M_DEVICES = new Set([CYCLE_START_DEVICE, CYCLE_END_DEVICE]);
const UBE_ALLOWED_BIT_DEVICES = new Set([CYCLE_START_DEVICE, CYCLE_END_DEVICE]);
const UBE_CYCLE_END_DELAY_MS = Math.min(
  5000,
  Math.max(500, Number(process.env.PLC_CYCLE_END_DELAY_MS || 1000))
);
const UBE_CYCLE_END_POLL_MS = Number(process.env.PLC_UBE_CYCLE_END_POLL_MS || 50);
const UBE_LIVE_READ_MS = Number(process.env.PLC_UBE_LIVE_READ_MS || 1000);
const PLC_MAX_CONSECUTIVE_READ_FAILURES = Number(process.env.PLC_MAX_CONSECUTIVE_READ_FAILURES || 5);
const PLC_DB_RETRY_MS = Number(process.env.PLC_DB_RETRY_MS || 30000);
const PLC_DB_RETRY_MAX = Number(process.env.PLC_DB_RETRY_MAX || 500);
const PLC_DB_RETRY_BATCH_SIZE = Number(process.env.PLC_DB_RETRY_BATCH_SIZE || 5);
const PLC_PENDING_SAVE_FILE =
  process.env.PLC_PENDING_SAVE_FILE ||
  path.resolve(__dirname, "../../../../plc-pending-ube-saves.json");

const LEAK_TEST_CONTROL = {
  cycleStartDevice: process.env.PLC_LEAK_CYCLE_START_DEVICE || "M110",
  cycleEndDevice: process.env.PLC_LEAK_CYCLE_END_DEVICE || "M300",
};

const GAUGE_CONTROL = {
  cycleStartDevice: process.env.PLC_GAUGE_CYCLE_START_DEVICE || "M120",
  cycleEndDevice: process.env.PLC_GAUGE_CYCLE_END_DEVICE || "M109",
  cycleEndDelayMs: Math.max(0, Number(process.env.PLC_GAUGE_CYCLE_END_DELAY_MS || 300)),
};

const LEAK_DUPLICATE_WINDOW_SEC = Number(process.env.PLC_LEAK_DUPLICATE_WINDOW_SEC || 3);
const LEAK_QR_DUPLICATE_WINDOW_SEC = Number(process.env.PLC_LEAK_QR_DUPLICATE_WINDOW_SEC || 300);
const LEAK_CHANGE_SAVE_ENABLED =
  String(process.env.PLC_LEAK_SAVE_ON_CHANGE || "false").toLowerCase() === "true";
const LEAK_CHANGE_MIN_INTERVAL_MS = Number(process.env.PLC_LEAK_CHANGE_MIN_INTERVAL_MS || 1500);

const PLC_READ_TIMEOUT_MS = Number(process.env.PLC_READ_TIMEOUT_MS || 8000);
const PLC_RECONNECT_AFTER_TIMEOUT_MS = Number(process.env.PLC_RECONNECT_AFTER_TIMEOUT_MS || 500);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PARAMETERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const EXCEL_PARAMETERS = [
  { name: "Sr. No", type: "int", computed: "serial" },
  { name: "Cycle End", device: "M4598", type: "int" },
  { name: "SHOT TIME", type: "text", computed: "shotTime" },
  { name: "SHOT NO.", device: "D1120", type: "int" },
  { name: "CYCLE TIME sec.", device: "D1127", type: "decimal", scale: 0.1 },
  { name: "HIGH SHOT COUNT", device: "D947", type: "int" },
  { name: "NG COUNTER", device: "D955", type: "int" },
  { name: "DIE-CLOSE CORE IN TIME sec", device: "D1128", type: "decimal", scale: 0.1 },
  { name: "POURING TIME sec", device: "D1129", type: "decimal", scale: 0.1 },
  { name: "SHOT FWD TIME sec", device: "D1130", type: "decimal", scale: 0.1 },
  { name: "CURING TIME sec", device: "D1137", type: "decimal", scale: 0.1 },
  { name: "DIE OPEN CORE OUT TIME sec", device: "D1132", type: "decimal", scale: 0.1 },
  { name: "EJECTOR TIME sec", device: "D1133", type: "decimal", scale: 0.1 },
  { name: "EXTRACT TIME sec", device: "D1134", type: "decimal", scale: 0.1 },
  { name: "SPRAY TIME sec", device: "D1135", type: "decimal", scale: 0.1 },
  { name: "V1 m/sec", device: "D6900", type: "decimal", scale: 0.01 },
  { name: "V2 m/sec", device: "D6902", type: "decimal", scale: 0.01 },
  { name: "V3 m/sec", device: "D6904", type: "decimal", scale: 0.01 },
  { name: "V4 m/sec", device: "D6906", type: "decimal", scale: 0.01 },
  { name: "METAL PRESS. Mpa", device: "D6912", type: "decimal", scale: 0.1 },
  { name: "FURNACE METAL TEMP. C", device: "D6934", type: "decimal", scale: 1 },
  { name: "COOLING WATER FLOW RATE (MOV.) L/min", device: "D6930", type: "decimal", scale: 0.1 },
  { name: "COOLING WATER FLOW RATE (STA.) L/min", device: "D6932", type: "decimal", scale: 0.1 },
  { name: "ACCEL. POINT mm", device: "D6908", type: "decimal", scale: 1 },
  { name: "DEACEL. POINT mm", device: "D6910", type: "decimal", scale: 1 },
  { name: "INTEN. TIME msec", device: "D6914", type: "decimal", scale: 1 },
  { name: "BISCUIT THICKNESS mm", device: "D6916", type: "decimal", scale: 1 },
  { name: "JET COOLING PRESSURE kgf/cm2", device: "D6954", type: "decimal", scale: 0.1 },
  { name: "CLAMP TONNAGE(HE.LOW) %", device: "D6918", type: "decimal", scale: 1 },
  { name: "CLAMP TONNAGE(HE.LOW) MN", device: "D6920", type: "decimal", scale: 0.01 },
  { name: "CLAMP TONNAGE(OP.UP) %", device: "D6922", type: "decimal", scale: 1 },
  { name: "CLAMP TONNAGE(OP.LOW) %", device: "D6924", type: "decimal", scale: 1 },
  { name: "CLAMP TONNAGE(HE.UP) %", device: "D6926", type: "decimal", scale: 1 },
  { name: "VACUUM PRESSURE mbar", device: "D6928", type: "decimal", scale: 1 },
  { name: "Cycle Start", device: "M840", type: "int" },
  { name: "CLAMP FORCE (%)", device: "D6918", type: "decimal", scale: 0.1 },
  { name: "CLAMP TONNAGE (T)", device: "D6920", type: "decimal", scale: 0.01 },
  { name: "SHOT ACC. PRESSURE", device: "D1700", type: "decimal", scale: 0.01 },
  { name: "INTENSIFICATION ACC. PRESSURE", device: "D1701", type: "decimal", scale: 0.01 },
  { name: "Fixed Die Temp (F-1)", device: "D1400", type: "decimal", scale: 1 },
  { name: "Fixed Die Temp (F-2)", device: "D1401", type: "decimal", scale: 1 },
  { name: "Moving Die Temp (M-1)", device: "D1402", type: "decimal", scale: 1 },
  { name: "Moving Die Temp (M-2)", device: "D1403", type: "decimal", scale: 1 },
  { name: "Slide Temp -1 (S-1)", device: "D1404", type: "decimal", scale: 1 },
  { name: "FIX. 1 Flow (Lpm)", device: "D1410", type: "decimal", scale: 0.1 },
  { name: "FIX. 2 Flow (Lpm)", device: "D1411", type: "decimal", scale: 0.1 },
  { name: "FIX. 3 Flow (Lpm)", device: "D1412", type: "decimal", scale: 0.1 },
  { name: "Mov. 1 Flow (Lpm)", device: "D1413", type: "decimal", scale: 0.1 },
  { name: "Mov. 2 Flow (Lpm)", device: "D1414", type: "decimal", scale: 0.1 },
  { name: "Mov. 3 Flow (Lpm)", device: "D1415", type: "decimal", scale: 0.1 },
  { name: "Vacuum pressure (mmHg)", device: "D1416", type: "decimal", scale: 1 },
  { name: "AVERAGE DIE CLAMP TONNAGE COUNT", device: "D7472", type: "int" },
  { name: "Time for stroke(ms)", device: "D10470", type: "int" },
  { name: "Stroke (mm)", device: "D10356", type: "decimal", scale: 1 },
  { name: "Shot Status", device: "D1301", type: "int" },
];

const UBE_LIMIT_STATUS_PARAMETERS = [];

const PLANT_ENVIRONMENT_PARAMETERS = [
  { name: "plant_temperature", type: "decimal" },
  { name: "plant_humidity", type: "decimal" },
];

const LEAK_TEST_PARAMETERS = [
  {
    name: "part_qr_code",
    type: "text",
    stringDevice: process.env.PLC_LEAK_SCAN_DEVICE || "D301",
    stringLength: Number(process.env.PLC_LEAK_SCAN_LENGTH || 14),
  },
  { name: "body_leak_value", device: process.env.PLC_LEAK_BODY_VALUE_DEVICE || "D2258", type: "real32" },
  { name: "gall_1", device: process.env.PLC_LEAK_GALL_1_DEVICE || "D2254", type: "real32" },
  { name: "gall_2", device: process.env.PLC_LEAK_GALL_2_DEVICE || "D2256", type: "real32" },
  {
    name: "result",
    type: "text",
    stringDevice: process.env.PLC_LEAK_RESULT_DEVICE || "R2250",
    stringLength: Number(process.env.PLC_LEAK_RESULT_LENGTH || 1),
  },
  {
    name: "auto_bit",
    device: process.env.PLC_LEAK_AUTO_MODE_DEVICE || "M101",
    type: "int",
    hidden: true,
  },
  { name: "manual", device: process.env.PLC_LEAK_MANUAL_MODE_DEVICE || "M102", type: "int" },
  { name: "dry", device: process.env.PLC_LEAK_DRY_MODE_DEVICE || "M190", type: "int" },
  { name: "wey", device: process.env.PLC_LEAK_WEY_MODE_DEVICE || "M191", type: "int" },
  { name: "both", device: process.env.PLC_LEAK_BOTH_MODE_DEVICE || "M192", type: "int" },
  {
    name: "cycle_time",
    device: process.env.PLC_LEAK_CYCLE_TIME_DEVICE || "D6010",
    type: "decimal",
    scale: Number(process.env.PLC_LEAK_CYCLE_TIME_SCALE || 1),
  },
];

const UBE_READ_PARAMETERS = [...EXCEL_PARAMETERS, ...UBE_LIMIT_STATUS_PARAMETERS].filter((parameter) => {
  if (parameter.computed) return true;
  if (!parameter.device) return true;
  if (parameter.device.startsWith("D")) return true;
  return ["M", "X", "Y"].includes(parameter.device[0]) && UBE_ALLOWED_BIT_DEVICES.has(parameter.device);
});

const ALL_PARAMETERS = [
  ...EXCEL_PARAMETERS,
  ...UBE_LIMIT_STATUS_PARAMETERS,
  ...LEAK_TEST_PARAMETERS,
  ...PLANT_ENVIRONMENT_PARAMETERS,
];
const PARAMETER_BY_NAME = new Map(ALL_PARAMETERS.map((p) => [p.name, p]));

const LEGACY_COLUMNS_BY_PARAMETER = {
  "SHOT NO.": "shot_number",
  "CYCLE TIME sec.": "cycle_time",
  "HIGH SHOT COUNT": "ok_shot",
  "NG COUNTER": "ng_counter",
  "DIE-CLOSE CORE IN TIME sec": "die_close_core_in_time",
  "POURING TIME sec": "pouring_time",
  "SHOT FWD TIME sec": "shot_fwd_time",
  "CURING TIME sec": "curing_time",
  "DIE OPEN CORE OUT TIME sec": "die_open_core_out_time",
  "EJECTOR TIME sec": "ejector_time",
  "EXTRACT TIME sec": "extract_time",
  "SPRAY TIME sec": "spray_time",
  "V1 m/sec": "v1_speed",
  "V2 m/sec": "v2_speed",
  "V3 m/sec": "v3_speed",
  "V4 m/sec": "v4_speed",
  "METAL PRESS. Mpa": "metal_pressure",
  "FURNACE METAL TEMP. C": "furnace_metal_temp",
  "COOLING WATER FLOW RATE (MOV.) L/min": "cooling_water_mov",
  "COOLING WATER FLOW RATE (STA.) L/min": "cooling_water_sta",
  "ACCEL. POINT mm": "accel_point",
  "DEACEL. POINT mm": "deaccel_point",
  "INTEN. TIME msec": "intensification_time",
  "BISCUIT THICKNESS mm": "biscuit_thickness",
  "JET COOLING PRESSURE kgf/cm2": "jet_cooling_pressure",
  "CLAMP TONNAGE(HE.LOW) %": "clamp_tonnage_he_low_pct",
  "CLAMP TONNAGE(HE.LOW) MN": "clamp_tonnage_he_low_mn",
  "CLAMP TONNAGE(OP.UP) %": "clamp_tonnage_op_up_pct",
  "CLAMP TONNAGE(OP.LOW) %": "clamp_tonnage_op_low_pct",
  "CLAMP TONNAGE(HE.UP) %": "clamp_tonnage_he_up_pct",
  "VACUUM PRESSURE mbar": "vacuum_pressure",
  "CLAMP FORCE (%)": "clamp_force_pct",
  "CLAMP TONNAGE (T)": "clamp_tonnage",
  "SHOT ACC. PRESSURE": "shot_acc_pressure",
  "INTENSIFICATION ACC. PRESSURE": "intensification_acc_pressure",
  "Fixed Die Temp (F-1)": "fixed_die_temp_f1",
  "Fixed Die Temp (F-2)": "fixed_die_temp_f2",
  "Moving Die Temp (M-1)": "moving_die_temp_m1",
  "Moving Die Temp (M-2)": "moving_die_temp_m2",
  "Slide Temp -1 (S-1)": "slide_temp_s1",
  "FIX. 1 Flow (Lpm)": "fix_1_flow",
  "FIX. 2 Flow (Lpm)": "fix_2_flow",
  "FIX. 3 Flow (Lpm)": "fix_3_flow",
  "Mov. 1 Flow (Lpm)": "mov_1_flow",
  "Mov. 2 Flow (Lpm)": "mov_2_flow",
  "Mov. 3 Flow (Lpm)": "mov_3_flow",
  "Vacuum pressure (mmHg)": "vacuum_pressure_mmhg",
  "Vacuum pressure (mbar)": "vacuum_pressure_mmhg",
  "AVERAGE DIE CLAMP TONNAGE COUNT": "average_die_clamp_tonnage_count",
  "Time for stroke(ms)": "time_for_stroke",
  "Stroke (mm)": "stroke",
  "Shot Status": "shot_status",
  "Cycle End": "cycle_end",
};

const DUPLICATE_SOURCE_COLUMNS = new Set(Object.keys(LEGACY_COLUMNS_BY_PARAMETER));

const DROPPED_READING_COLUMNS = new Set([
  ...DUPLICATE_SOURCE_COLUMNS,
  "Counter",
  "counter",
  "HIGH SHOT COUNT value",
  "NG COUNTER",
  "NG COUNTER value",
  "high_shot_count",
  "high_shot",
  "off_shot",
  "ng_shot",
  "manual_mode",
  "shot_uid",
  "Sr. No",
  "SHOT TIME",
  "shot_time",
  "cycletime EndDateTime",
  "SHOT FWD TIME sec value",
  "AUTO/OK-step value (sec)",
  "AUTO/ROBOT/OK-step value (sec)",
  ...EXCEL_PARAMETERS.filter((p) => ["M", "X", "Y"].includes(p.device?.[0])).map((p) => `${p.name} duration (sec)`),
  ...LEAK_TEST_PARAMETERS.filter((p) => p.device?.startsWith("M")).map((p) => `${p.name} duration (sec)`),
]);

const LIVE_READING_METADATA_COLUMNS = new Set([
  "id",
  "rn",
  "recorded_at",
  "created_at",
  "machine_key",
  "machine_name",
  "machine_type",
  "plc_ip",
  "plc_port",
  "part_name",
  "raw_readings_json",
  "is_online",
  "has_data",
  "error",
]);

const UBE_LEGACY_REPORT_COLUMNS = Array.from(new Set(Object.values(LEGACY_COLUMNS_BY_PARAMETER)))
  .filter((name) => name !== "shot_number")
  .flatMap((name) => {
    const columns = [[name, name]];
    if (name === "vacuum_pressure") {
      columns.push(
        ["plant_temperature", "Plant Temperature (C)"],
        ["plant_humidity", "Plant Humidity (%)"]
      );
    }
    return columns;
  });

const REPORT_COLUMNS = [
  ["machine_name", "Machine"],
  ["part_name", "Part Name"],
  ["part_qr_code", "Part QR Code"],
  ["shot_datetime", "Shot Date Time"],
  ["shot_date_full", "Shot Date"],
  ["shot_number", "Shot Number"],
  ["ok_shot", "OK Shot"],
  ...UBE_LEGACY_REPORT_COLUMNS,
  ...EXCEL_PARAMETERS.filter((p) => !p.hidden && !DROPPED_READING_COLUMNS.has(p.name)).map((p) => [p.name, p.name]),
  ...LEAK_TEST_PARAMETERS.filter((p) => !p.hidden && p.name !== "part_qr_code").map((p) => [p.name, p.name]),
];

const LEAK_ONLY_REPORT_KEYS = new Set([
  "part_qr_code",
  "body_leak_value",
  "gall_1",
  "gall_2",
  "result",
  "manual",
  "dry",
  "wey",
  "both",
  "cycle_end_time",
  "status",
  "machine",
  "ip",
]);

const UBE_REPORT_COLUMNS = REPORT_COLUMNS.filter(([key]) => !LEAK_ONLY_REPORT_KEYS.has(key));

const LEAK_REPORT_COLUMNS = [
  ["machine_name", "Machine"],
  ["plc_ip", "PLC IP"],
  ["cycle_end_time", "Cycle End Time"],
  ["part_qr_code", "Part QR Code"],
  ["result", "Result"],
  ["body_leak_value", "Body Leak Value"],
  ["gall_1", "GALL-1"],
  ["gall_2", "GALL-2"],
  ["cycle_time", "Cycle Time"],
  ["running_mode", "Running Mode"],
  ["manual", "Manual"],
  ["dry", "Dry"],
  ["wey", "Wey"],
  ["both", "Both"],
];

const EXTRA_READING_COLUMNS = [
  ["machine_key", "NVARCHAR(80)"],
  ["shot_date", "DATE"],
  ["shot_datetime", "DATETIME2(0)"],
  ["shot_year", "NVARCHAR(2)"],
  ["shot_month", "NVARCHAR(2)"],
  ["shot_day", "NVARCHAR(2)"],
  ["shot_hour", "NVARCHAR(2)"],
  ["shot_minute", "NVARCHAR(2)"],
  ["shot_second", "NVARCHAR(2)"],
  ["shot_number", "INT"],
  ["Counter", "INT"],
  ["ok_shot", "INT"],
  ["ng_counter", "INT"],
  ["cycle_start_time", "DATETIME2(3)"],
  ["cycle_end_time", "DATETIME2(3)"],
  ["plant_temperature", "DECIMAL(18,2)"],
  ["plant_humidity", "DECIMAL(18,2)"],
];

const TWO_DIGIT_READING_COLUMNS = new Set([
  "shot_year",
  "shot_month",
  "shot_day",
  "shot_hour",
  "shot_minute",
  "shot_second",
]);

const M_BIT_DURATION_COLUMNS = [];

const UBE_CLIENT_READING_NAMES = new Set([
  "shot_year",
  "shot_month",
  "shot_day",
  "shot_date",
  "shot_datetime",
  "shot_hour",
  "shot_minute",
  "shot_second",
  "shot_number",
  "Counter",
  "ok_shot",
  "ng_counter",
  "part_name",
  "cycle_time",
  "cycle_start_time",
  "cycle_end_time",
  "plant_temperature",
  "plant_humidity",
  ...EXCEL_PARAMETERS.map((p) => p.name),
  ...Object.values(LEGACY_COLUMNS_BY_PARAMETER),
]);

const LEAK_CLIENT_READING_NAMES = new Set([
  "machine",
  "ip",
  "status",
  "cycle_end_time",
  "part_qr_code",
  "scan_data",
  "result",
  "body_leak_value",
  "gall_1",
  "gall_2",
  "cycle_time",
  "running_mode",
  "manual",
  "dry",
  "wey",
  "both",
]);

module.exports = {
  TABLE,
  LEAK_TEST_TABLE,
  GAUGE_TABLE,
  CONNECTION_EVENTS_TABLE,
  MACHINE_READINGS_TABLE,
  MACHINE_READING_VALUES_TABLE,
  DEVICE_CODE,
  CYCLE_START_DEVICE,
  CYCLE_END_DEVICE,
  SHOT_DATE_TIME_DEVICES,
  UBE_ALLOWED_M_DEVICES,
  UBE_ALLOWED_BIT_DEVICES,
  UBE_CYCLE_END_DELAY_MS,
  UBE_CYCLE_END_POLL_MS,
  UBE_LIVE_READ_MS,
  PLC_MAX_CONSECUTIVE_READ_FAILURES,
  PLC_DB_RETRY_MS,
  PLC_DB_RETRY_MAX,
  PLC_DB_RETRY_BATCH_SIZE,
  PLC_PENDING_SAVE_FILE,
  LEAK_TEST_CONTROL,
  GAUGE_CONTROL,
  LEAK_DUPLICATE_WINDOW_SEC,
  LEAK_QR_DUPLICATE_WINDOW_SEC,
  LEAK_CHANGE_SAVE_ENABLED,
  LEAK_CHANGE_MIN_INTERVAL_MS,
  PLC_READ_TIMEOUT_MS,
  PLC_RECONNECT_AFTER_TIMEOUT_MS,
  EXCEL_PARAMETERS,
  UBE_LIMIT_STATUS_PARAMETERS,
  PLANT_ENVIRONMENT_PARAMETERS,
  LEAK_TEST_PARAMETERS,
  UBE_READ_PARAMETERS,
  ALL_PARAMETERS,
  PARAMETER_BY_NAME,
  LEGACY_COLUMNS_BY_PARAMETER,
  DUPLICATE_SOURCE_COLUMNS,
  DROPPED_READING_COLUMNS,
  LIVE_READING_METADATA_COLUMNS,
  REPORT_COLUMNS,
  LEAK_ONLY_REPORT_KEYS,
  UBE_REPORT_COLUMNS,
  LEAK_REPORT_COLUMNS,
  EXTRA_READING_COLUMNS,
  TWO_DIGIT_READING_COLUMNS,
  M_BIT_DURATION_COLUMNS,
  UBE_CLIENT_READING_NAMES,
  LEAK_CLIENT_READING_NAMES,
};


