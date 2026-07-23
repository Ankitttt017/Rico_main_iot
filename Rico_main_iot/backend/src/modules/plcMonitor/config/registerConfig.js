"use strict";

const path = require("path");

const TABLE = "dbo.PlcCycleReadings";
const LEAK_TEST_TABLE = "dbo.Leaktest";
const GAUGE_TABLE = "dbo.Gauge";
const CONNECTION_EVENTS_TABLE = "dbo.PlcConnectionEvents";
const MACHINE_READINGS_TABLE = "dbo.plc_machine_readings";
const MACHINE_READING_VALUES_TABLE = "dbo.plc_machine_reading_values";

const DEVICE_CODE = { M: 0x90, X: 0x9c, Y: 0x9d, D: 0xa8, R: 0xaf };
const UBE_CYCLE_END_DELAY_MS = Math.min(
  5000,
  Math.max(500, Number(process.env.PLC_UBE_CYCLE_END_DELAY_MS || process.env.PLC_CYCLE_END_DELAY_MS || 2000))
);
const UBE_CYCLE_END_POLL_MS = Number(process.env.PLC_UBE_CYCLE_END_POLL_MS || 20);
const UBE_LIVE_READ_MS = Number(process.env.PLC_UBE_LIVE_READ_MS || 1000);
const PLC_MAX_CONSECUTIVE_READ_FAILURES = Number(process.env.PLC_MAX_CONSECUTIVE_READ_FAILURES || 5);
const PLC_DB_RETRY_MS = Number(process.env.PLC_DB_RETRY_MS || 30000);
const PLC_DB_RETRY_MAX = Number(process.env.PLC_DB_RETRY_MAX || 500);
const PLC_DB_RETRY_BATCH_SIZE = Number(process.env.PLC_DB_RETRY_BATCH_SIZE || 5);
const PLC_PENDING_SAVE_FILE =
  process.env.PLC_PENDING_SAVE_FILE ||
  path.resolve(__dirname, "../../../../plc-pending-ube-saves.json");

const GAUGE_CONTROL = {
  cycleEndDelayMs: Math.max(0, Number(process.env.PLC_GAUGE_CYCLE_END_DELAY_MS || 300)),
};

const LEAK_DUPLICATE_WINDOW_SEC = Number(process.env.PLC_LEAK_DUPLICATE_WINDOW_SEC || 3);
const LEAK_QR_DUPLICATE_WINDOW_SEC = Number(process.env.PLC_LEAK_QR_DUPLICATE_WINDOW_SEC || 300);
const LEAK_CHANGE_SAVE_ENABLED =
  String(process.env.PLC_LEAK_SAVE_ON_CHANGE || "false").toLowerCase() === "true";
const LEAK_CHANGE_MIN_INTERVAL_MS = Number(process.env.PLC_LEAK_CHANGE_MIN_INTERVAL_MS || 1500);

const PLC_READ_TIMEOUT_MS = Number(process.env.PLC_READ_TIMEOUT_MS || 8000);
const PLC_RECONNECT_AFTER_TIMEOUT_MS = Number(process.env.PLC_RECONNECT_AFTER_TIMEOUT_MS || 500);

const LEGACY_COLUMNS_BY_PARAMETER = {
  "SHOT NO.": "shot_number",
  "CYCLE TIME sec.": "cycle_time",
  "HIGH SHOT COUNT": "ok_shot",
  "NG COUNTER": "ng_counter",
  "DIE-CLOSE CORE IN TIME sec": "die_close_core_in_time",
  "DIE-CLOSE CORE IN TIME Upper Limit sec": "die_close_core_in_time_upper_limit",
  "DIE-CLOSE CORE IN TIME Lower Limit sec": "die_close_core_in_time_lower_limit",
  "POURING TIME sec": "pouring_time",
  "POURING TIME Upper Limit sec": "pouring_time_upper_limit",
  "POURING TIME Lower Limit sec": "pouring_time_lower_limit",
  "SHOT FWD TIME sec": "shot_fwd_time",
  "SHOT FWD TIME Upper Limit sec": "shot_fwd_time_upper_limit",
  "SHOT FWD TIME Lower Limit sec": "shot_fwd_time_lower_limit",
  "CURING TIME sec": "curing_time",
  "CURING TIME Upper Limit sec": "curing_time_upper_limit",
  "CURING TIME Lower Limit sec": "curing_time_lower_limit",
  "DIE OPEN CORE OUT TIME sec": "die_open_core_out_time",
  "DIE OPEN CORE OUT TIME Upper Limit sec": "die_open_core_out_time_upper_limit",
  "DIE OPEN CORE OUT TIME Lower Limit sec": "die_open_core_out_time_lower_limit",
  "EJECTOR TIME sec": "ejector_time",
  "EJECTOR TIME Upper Limit sec": "ejector_time_upper_limit",
  "EJECTOR TIME Lower Limit sec": "ejector_time_lower_limit",
  "EXTRACT TIME sec": "extract_time",
  "EXTRACT TIME Upper Limit sec": "extract_time_upper_limit",
  "EXTRACT TIME Lower Limit sec": "extract_time_lower_limit",
  "SPRAY TIME sec": "spray_time",
  "SPRAY TIME Upper Limit sec": "spray_time_upper_limit",
  "SPRAY TIME Lower Limit sec": "spray_time_lower_limit",
  "V1 m/sec": "v1_speed",
  "V1 Upper Limit m/sec": "v1_speed_upper_limit",
  "V1 Lower Limit m/sec": "v1_speed_lower_limit",
  "V2 m/sec": "v2_speed",
  "V2 Upper Limit m/sec": "v2_speed_upper_limit",
  "V2 Lower Limit m/sec": "v2_speed_lower_limit",
  "V3 m/sec": "v3_speed",
  "V3 Upper Limit m/sec": "v3_speed_upper_limit",
  "V3 Lower Limit m/sec": "v3_speed_lower_limit",
  "V4 m/sec": "v4_speed",
  "V4 Upper Limit m/sec": "v4_speed_upper_limit",
  "V4 Lower Limit m/sec": "v4_speed_lower_limit",
  "METAL PRESS. Mpa": "metal_pressure",
  "METAL PRESS. Upper Limit Mpa": "metal_pressure_upper_limit",
  "METAL PRESS. Lower Limit Mpa": "metal_pressure_lower_limit",
  "FURNACE METAL TEMP. C": "furnace_metal_temp",
  "FURNACE METAL TEMP. Upper Limit C": "furnace_metal_temp_upper_limit",
  "FURNACE METAL TEMP. Lower Limit C": "furnace_metal_temp_lower_limit",
  "COOLING WATER FLOW RATE (MOV.) L/min": "cooling_water_mov",
  "COOLING WATER FLOW RATE (MOV.) Upper Limit L/min": "cooling_water_mov_upper_limit",
  "COOLING WATER FLOW RATE (MOV.) Lower Limit L/min": "cooling_water_mov_lower_limit",
  "COOLING WATER FLOW RATE (STA.) L/min": "cooling_water_sta",
  "COOLING WATER FLOW RATE (STA.) Upper Limit L/min": "cooling_water_sta_upper_limit",
  "COOLING WATER FLOW RATE (STA.) Lower Limit L/min": "cooling_water_sta_lower_limit",
  "ACCEL. POINT mm": "accel_point",
  "ACCEL. POINT Upper Limit mm": "accel_point_upper_limit",
  "ACCEL. POINT Lower Limit mm": "accel_point_lower_limit",
  "DEACEL. POINT mm": "deaccel_point",
  "DEACEL. POINT Upper Limit mm": "deaccel_point_upper_limit",
  "DEACEL. POINT Lower Limit mm": "deaccel_point_lower_limit",
  "INTEN. TIME msec": "intensification_time",
  "INTEN. TIME Upper Limit msec": "intensification_time_upper_limit",
  "INTEN. TIME Lower Limit msec": "intensification_time_lower_limit",
  "BISCUIT THICKNESS mm": "biscuit_thickness",
  "BISCUIT THICKNESS Upper Limit mm": "biscuit_thickness_upper_limit",
  "BISCUIT THICKNESS Lower Limit mm": "biscuit_thickness_lower_limit",
  "JET COOLING PRESSURE kgf/cm2": "jet_cooling_pressure",
  "JET COOLING PRESSURE Upper Limit kgf/cm2": "jet_cooling_pressure_upper_limit",
  "JET COOLING PRESSURE Lower Limit kgf/cm2": "jet_cooling_pressure_lower_limit",
  "CLAMP TONNAGE(HE.LOW) %": "clamp_tonnage_he_low_pct",
  "CLAMP TONNAGE(HE.LOW) Upper Limit %": "clamp_tonnage_he_low_pct_upper_limit",
  "CLAMP TONNAGE(HE.LOW) Lower Limit %": "clamp_tonnage_he_low_pct_lower_limit",
  "CLAMP TONNAGE(HE.LOW) MN": "clamp_tonnage_he_low_mn",
  "CLAMP TONNAGE(HE.LOW) Upper Limit MN": "clamp_tonnage_he_low_mn_upper_limit",
  "CLAMP TONNAGE(HE.LOW) Lower Limit MN": "clamp_tonnage_he_low_mn_lower_limit",
  "CLAMP TONNAGE(OP.UP) %": "clamp_tonnage_op_up_pct",
  "CLAMP TONNAGE(OP.UP) Upper Limit %": "clamp_tonnage_op_up_pct_upper_limit",
  "CLAMP TONNAGE(OP.UP) Lower Limit %": "clamp_tonnage_op_up_pct_lower_limit",
  "CLAMP TONNAGE(OP.LOW) %": "clamp_tonnage_op_low_pct",
  "CLAMP TONNAGE(OP.LOW) Upper Limit %": "clamp_tonnage_op_low_pct_upper_limit",
  "CLAMP TONNAGE(OP.LOW) Lower Limit %": "clamp_tonnage_op_low_pct_lower_limit",
  "CLAMP TONNAGE(HE.UP) %": "clamp_tonnage_he_up_pct",
  "CLAMP TONNAGE(HE.UP) Upper Limit %": "clamp_tonnage_he_up_pct_upper_limit",
  "CLAMP TONNAGE(HE.UP) Lower Limit %": "clamp_tonnage_he_up_pct_lower_limit",
  "VACUUM PRESSURE mbar": "vacuum_pressure",
  "VACUUM PRESSURE Upper Limit mbar": "vacuum_pressure_upper_limit",
  "VACUUM PRESSURE Lower Limit mbar": "vacuum_pressure_lower_limit",
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

const INTEGER_PARAMETER_NAMES = new Set([
  "Sr. No",
  "SHOT NO.",
  "HIGH SHOT COUNT",
  "NG COUNTER",
  "AVERAGE DIE CLAMP TONNAGE COUNT",
  "Shot Status",
  "Cycle End",
  "shot_number",
  "Counter",
  "ok_shot",
  "ng_counter",
]);

const TEXT_PARAMETER_NAMES = new Set([
  "SHOT TIME",
  "part_name",
  "part_qr_code",
  "scan_data",
  "result",
  "status",
  "running_mode",
  "machine",
  "ip",
]);

const REAL32_PARAMETER_NAMES = new Set([
  "body_leak_value",
  "gall_1",
  "gall_2",
]);

function parameterMetadata(name) {
  if (TEXT_PARAMETER_NAMES.has(name)) return { name, type: "text" };
  if (INTEGER_PARAMETER_NAMES.has(name)) return { name, type: "int" };
  if (REAL32_PARAMETER_NAMES.has(name)) return { name, type: "real32" };
  return { name, type: "decimal" };
}

const PARAMETER_BY_NAME = new Map(
  Array.from(new Set([
    ...Object.keys(LEGACY_COLUMNS_BY_PARAMETER),
    ...Object.values(LEGACY_COLUMNS_BY_PARAMETER),
    ...INTEGER_PARAMETER_NAMES,
    ...TEXT_PARAMETER_NAMES,
    ...REAL32_PARAMETER_NAMES,
    "manual",
    "dry",
    "wey",
    "both",
    "cycle_time",
    "plant_temperature",
    "plant_humidity",
  ])).map((name) => [name, parameterMetadata(name)])
);

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
  ["die_close_core_in_time_upper_limit", "DECIMAL(18,2)"],
  ["die_close_core_in_time_lower_limit", "DECIMAL(18,2)"],
  ["pouring_time_upper_limit", "DECIMAL(18,2)"],
  ["pouring_time_lower_limit", "DECIMAL(18,2)"],
  ["shot_fwd_time_upper_limit", "DECIMAL(18,2)"],
  ["shot_fwd_time_lower_limit", "DECIMAL(18,2)"],
  ["curing_time_upper_limit", "DECIMAL(18,2)"],
  ["curing_time_lower_limit", "DECIMAL(18,2)"],
  ["die_open_core_out_time_upper_limit", "DECIMAL(18,2)"],
  ["die_open_core_out_time_lower_limit", "DECIMAL(18,2)"],
  ["ejector_time_upper_limit", "DECIMAL(18,2)"],
  ["ejector_time_lower_limit", "DECIMAL(18,2)"],
  ["extract_time_upper_limit", "DECIMAL(18,2)"],
  ["extract_time_lower_limit", "DECIMAL(18,2)"],
  ["spray_time_upper_limit", "DECIMAL(18,2)"],
  ["spray_time_lower_limit", "DECIMAL(18,2)"],
  ["v1_speed_upper_limit", "DECIMAL(18,2)"],
  ["v1_speed_lower_limit", "DECIMAL(18,2)"],
  ["v2_speed_upper_limit", "DECIMAL(18,2)"],
  ["v2_speed_lower_limit", "DECIMAL(18,2)"],
  ["v3_speed_upper_limit", "DECIMAL(18,2)"],
  ["v3_speed_lower_limit", "DECIMAL(18,2)"],
  ["v4_speed_upper_limit", "DECIMAL(18,2)"],
  ["v4_speed_lower_limit", "DECIMAL(18,2)"],
  ["metal_pressure_upper_limit", "DECIMAL(18,2)"],
  ["metal_pressure_lower_limit", "DECIMAL(18,2)"],
  ["furnace_metal_temp_upper_limit", "DECIMAL(18,2)"],
  ["furnace_metal_temp_lower_limit", "DECIMAL(18,2)"],
  ["cooling_water_mov_upper_limit", "DECIMAL(18,2)"],
  ["cooling_water_mov_lower_limit", "DECIMAL(18,2)"],
  ["cooling_water_sta_upper_limit", "DECIMAL(18,2)"],
  ["cooling_water_sta_lower_limit", "DECIMAL(18,2)"],
  ["accel_point_upper_limit", "DECIMAL(18,2)"],
  ["accel_point_lower_limit", "DECIMAL(18,2)"],
  ["deaccel_point_upper_limit", "DECIMAL(18,2)"],
  ["deaccel_point_lower_limit", "DECIMAL(18,2)"],
  ["intensification_time_upper_limit", "DECIMAL(18,2)"],
  ["intensification_time_lower_limit", "DECIMAL(18,2)"],
  ["biscuit_thickness_upper_limit", "DECIMAL(18,2)"],
  ["biscuit_thickness_lower_limit", "DECIMAL(18,2)"],
  ["jet_cooling_pressure_upper_limit", "DECIMAL(18,2)"],
  ["jet_cooling_pressure_lower_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_he_low_pct_upper_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_he_low_pct_lower_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_he_low_mn_upper_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_he_low_mn_lower_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_op_up_pct_upper_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_op_up_pct_lower_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_op_low_pct_upper_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_op_low_pct_lower_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_he_up_pct_upper_limit", "DECIMAL(18,2)"],
  ["clamp_tonnage_he_up_pct_lower_limit", "DECIMAL(18,2)"],
  ["vacuum_pressure_upper_limit", "DECIMAL(18,2)"],
  ["vacuum_pressure_lower_limit", "DECIMAL(18,2)"],
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
  "shot_time",
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
  ...Object.keys(LEGACY_COLUMNS_BY_PARAMETER),
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
  UBE_CYCLE_END_DELAY_MS,
  UBE_CYCLE_END_POLL_MS,
  UBE_LIVE_READ_MS,
  PLC_MAX_CONSECUTIVE_READ_FAILURES,
  PLC_DB_RETRY_MS,
  PLC_DB_RETRY_MAX,
  PLC_DB_RETRY_BATCH_SIZE,
  PLC_PENDING_SAVE_FILE,
  GAUGE_CONTROL,
  LEAK_DUPLICATE_WINDOW_SEC,
  LEAK_QR_DUPLICATE_WINDOW_SEC,
  LEAK_CHANGE_SAVE_ENABLED,
  LEAK_CHANGE_MIN_INTERVAL_MS,
  PLC_READ_TIMEOUT_MS,
  PLC_RECONNECT_AFTER_TIMEOUT_MS,
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
