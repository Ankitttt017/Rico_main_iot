"use strict";

const path = require("path");

const TABLE = "dbo.PlcCycleReadings";
const LEAK_TEST_TABLE = "dbo.Leaktest";
const CONNECTION_EVENTS_TABLE = "dbo.PlcConnectionEvents";

const DEVICE_CODE = { M: 0x90, D: 0xa8, R: 0xaf };
const CYCLE_START_DEVICE = process.env.PLC_CYCLE_START_DEVICE || "";
const CYCLE_END_DEVICE = process.env.PLC_CYCLE_END_DEVICE || "";
const SHOT_DATE_TIME_DEVICES = {};
const UBE_ALLOWED_M_DEVICES = new Set([CYCLE_START_DEVICE, CYCLE_END_DEVICE]);
const UBE_CYCLE_END_DELAY_MS = Math.min(
  5000,
  Math.max(500, Number(process.env.PLC_CYCLE_END_DELAY_MS || 1000))
);
const UBE_CYCLE_END_POLL_MS = Number(process.env.PLC_UBE_CYCLE_END_POLL_MS || 200);
const UBE_LIVE_READ_MS = Number(process.env.PLC_UBE_LIVE_READ_MS || 1000);
const PLC_MAX_CONSECUTIVE_READ_FAILURES = Number(process.env.PLC_MAX_CONSECUTIVE_READ_FAILURES || 5);
const PLC_DB_RETRY_MS = Number(process.env.PLC_DB_RETRY_MS || 30000);
const PLC_DB_RETRY_MAX = Number(process.env.PLC_DB_RETRY_MAX || 500);
const PLC_DB_RETRY_BATCH_SIZE = Number(process.env.PLC_DB_RETRY_BATCH_SIZE || 5);
const PLC_PENDING_SAVE_FILE =
  process.env.PLC_PENDING_SAVE_FILE ||
  path.resolve(__dirname, "../../../../plc-pending-ube-saves.json");

const LEAK_TEST_CONTROL = {
  cycleStartDevice: process.env.PLC_LEAK_CYCLE_START_DEVICE || "",
  cycleEndDevice: process.env.PLC_LEAK_CYCLE_END_DEVICE || "",
};

const LEAK_DUPLICATE_WINDOW_SEC = Number(process.env.PLC_LEAK_DUPLICATE_WINDOW_SEC || 3);
const LEAK_QR_DUPLICATE_WINDOW_SEC = Number(process.env.PLC_LEAK_QR_DUPLICATE_WINDOW_SEC || 300);
const LEAK_CHANGE_SAVE_ENABLED =
  String(process.env.PLC_LEAK_SAVE_ON_CHANGE || "true").toLowerCase() !== "false";
const LEAK_CHANGE_MIN_INTERVAL_MS = Number(process.env.PLC_LEAK_CHANGE_MIN_INTERVAL_MS || 1500);

const PLC_READ_TIMEOUT_MS = Number(process.env.PLC_READ_TIMEOUT_MS || 8000);
const PLC_RECONNECT_AFTER_TIMEOUT_MS = Number(process.env.PLC_RECONNECT_AFTER_TIMEOUT_MS || 500);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PARAMETERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const EXCEL_PARAMETERS = [];
const UBE_LIMIT_STATUS_PARAMETERS = [];
const LEAK_TEST_PARAMETERS = [];
const UBE_READ_PARAMETERS = [];

const ALL_PARAMETERS = [...EXCEL_PARAMETERS, ...UBE_LIMIT_STATUS_PARAMETERS, ...LEAK_TEST_PARAMETERS];
const PARAMETER_BY_NAME = new Map(ALL_PARAMETERS.map((p) => [p.name, p]));

const LEGACY_COLUMNS_BY_PARAMETER = {};

const DUPLICATE_SOURCE_COLUMNS = new Set(Object.keys(LEGACY_COLUMNS_BY_PARAMETER));

const DROPPED_READING_COLUMNS = new Set();

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

const REPORT_COLUMNS = [];

const LEAK_ONLY_REPORT_KEYS = new Set();

const UBE_REPORT_COLUMNS = REPORT_COLUMNS.filter(([key]) => !LEAK_ONLY_REPORT_KEYS.has(key));

const LEAK_REPORT_COLUMNS = [];

const EXTRA_READING_COLUMNS = [
  ["machine_key", "NVARCHAR(80)"],
  ["shot_date", "DATE"],
  ["shot_time", "TIME(0)"],
  ["shot_datetime", "DATETIME2(0)"],
  ["shot_year", "NVARCHAR(2)"],
  ["shot_month", "NVARCHAR(2)"],
  ["shot_day", "NVARCHAR(2)"],
  ["shot_hour", "NVARCHAR(2)"],
  ["shot_minute", "NVARCHAR(2)"],
  ["shot_second", "NVARCHAR(2)"],
  ["shot_number", "INT"],
  ["ok_shot", "INT"],
  ["ng_counter", "INT"],
  ["cycle_start_time", "DATETIME2(3)"],
  ["cycle_end_time", "DATETIME2(3)"],
  ["cycle_duration", "DECIMAL(18,2)"],
  ["actual_cycle_time", "DECIMAL(18,2)"],
  ["plc_cycle_time", "DECIMAL(18,2)"],
  ["minor_stoppage_machine", "DECIMAL(18,2)"],
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

const UBE_CLIENT_READING_NAMES = new Set();

const LEAK_CLIENT_READING_NAMES = new Set();

module.exports = {
  TABLE,
  LEAK_TEST_TABLE,
  CONNECTION_EVENTS_TABLE,
  DEVICE_CODE,
  CYCLE_START_DEVICE,
  CYCLE_END_DEVICE,
  SHOT_DATE_TIME_DEVICES,
  UBE_ALLOWED_M_DEVICES,
  UBE_CYCLE_END_DELAY_MS,
  UBE_CYCLE_END_POLL_MS,
  UBE_LIVE_READ_MS,
  PLC_MAX_CONSECUTIVE_READ_FAILURES,
  PLC_DB_RETRY_MS,
  PLC_DB_RETRY_MAX,
  PLC_DB_RETRY_BATCH_SIZE,
  PLC_PENDING_SAVE_FILE,
  LEAK_TEST_CONTROL,
  LEAK_DUPLICATE_WINDOW_SEC,
  LEAK_QR_DUPLICATE_WINDOW_SEC,
  LEAK_CHANGE_SAVE_ENABLED,
  LEAK_CHANGE_MIN_INTERVAL_MS,
  PLC_READ_TIMEOUT_MS,
  PLC_RECONNECT_AFTER_TIMEOUT_MS,
  EXCEL_PARAMETERS: [],
  UBE_LIMIT_STATUS_PARAMETERS: [],
  LEAK_TEST_PARAMETERS: [],
  UBE_READ_PARAMETERS: [],
  ALL_PARAMETERS: [],
  PARAMETER_BY_NAME: new Map(),
  LEGACY_COLUMNS_BY_PARAMETER: {},
  DUPLICATE_SOURCE_COLUMNS: new Set(),
  DROPPED_READING_COLUMNS: new Set(),
  LIVE_READING_METADATA_COLUMNS,
  REPORT_COLUMNS: [],
  LEAK_ONLY_REPORT_KEYS,
  UBE_REPORT_COLUMNS: [],
  LEAK_REPORT_COLUMNS: [],
  EXTRA_READING_COLUMNS,
  TWO_DIGIT_READING_COLUMNS,
  M_BIT_DURATION_COLUMNS,
  UBE_CLIENT_READING_NAMES: new Set(),
  LEAK_CLIENT_READING_NAMES: new Set(),
};


