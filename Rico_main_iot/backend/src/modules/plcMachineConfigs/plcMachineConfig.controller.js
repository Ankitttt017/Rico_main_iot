"use strict";

const net = require("net");
const db = require("../../config/db");

let schemaReadyPromise = null;

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanInt(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function cleanNumber(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return !["0", "false", "no", "n", "off"].includes(String(value).trim().toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDeadlockError(error = {}) {
  const message = String(error.message || error.originalError?.message || "").toLowerCase();
  return error.number === 1205 || (error.code === "EREQUEST" && message.includes("deadlock")) || message.includes("deadlocked");
}

async function withDeadlockRetry(operation, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isDeadlockError(error) || attempt === attempts) throw error;
      await sleep(150 * attempt);
    }
  }
  throw lastError;
}

function normalizeRegisterType(value) {
  const normalized = String(value || "int").trim().toLowerCase().replace(/[\s/_-]+/g, "");
  if (["text", "string", "ascii", "stringascii", "char", "chars"].includes(normalized)) return "text";
  if (["decimal", "dec", "scaled", "scaledd", "decscaled", "decscaledd"].includes(normalized)) return "decimal";
  if (["boolean", "bool", "bit", "mbit"].includes(normalized)) return normalized === "boolean" ? "bool" : normalized;
  if (["uint16", "uint32", "dword", "real32", "int"].includes(normalized)) return normalized;
  if (["int16", "word"].includes(normalized)) return "int";
  return "int";
}

function normalizeScaleOperation(rawOp) {
  const op = String(rawOp || "").trim().toLowerCase();
  if (
    op === "/" ||
    op === "divide" ||
    op === "devide" ||
    op.includes("div") ||
    op.includes("slash") ||
    op.includes("by")
  ) {
    return "divide";
  }
  if (
    op === "+" ||
    op === "add" ||
    op.includes("plus") ||
    op.includes("sum")
  ) {
    return "add";
  }
  if (
    op === "-" ||
    op === "subtract" ||
    op.includes("sub") ||
    op.includes("min")
  ) {
    return "subtract";
  }
  return "multiply";
}

function normalizeRegisterAddress(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidIpv4(value) {
  const parts = String(value || "").trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function machineKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalMachineKeyFor({ ip, type, inputKey, name }) {
  const cleanIp = cleanText(ip);
  const normalizedType = normalizeMachineType(type);
  if (cleanIp && normalizedType === "ube") return cleanIp;
  return machineKey(inputKey || name || cleanIp);
}

function normalizeMachineType(value) {
  return String(value || "generic")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "generic";
}

const DEFAULT_UBE_REGISTERS = [
  {"name":"Sr. No","type":"int","computed":"serial","enabled":true,"show_on_monitor":false,"log_history":true,"group":"Production","unit":""},
  {"name":"Part Name","stringDevice":"D100-D110","stringLength":11,"type":"text","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Production","unit":""},
  {"name":"SHOT TIME","type":"text","computed":"shotTime","enabled":true,"show_on_monitor":true,"log_history":true,"group":"Production","unit":""},
  {"name":"SHOT NO.","device":"D1120","type":"int","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Production","unit":""},
  {"name":"CYCLE TIME sec.","device":"D1127","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Production","unit":"sec"},
  {"name":"HIGH SHOT COUNT","device":"D947","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Production","unit":""},
  {"name":"NG COUNTER","device":"D955","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Production","unit":""},
  {"name":"DIE-CLOSE CORE IN TIME sec","device":"D1128","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"POURING TIME sec","device":"D1129","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"SHOT FWD TIME sec","device":"D1130","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"CURING TIME sec","device":"D1137","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"DIE OPEN CORE OUT TIME sec","device":"D1132","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"EJECTOR TIME sec","device":"D1133","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"EXTRACT TIME sec","device":"D1134","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"SPRAY TIME sec","device":"D1135","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"V1 m/sec","device":"D6900","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"m/sec"},
  {"name":"V2 m/sec","device":"D6902","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"m/sec"},
  {"name":"V3 m/sec","device":"D6904","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"m/sec"},
  {"name":"V4 m/sec","device":"D6906","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"m/sec"},
  {"name":"ACCEL. POINT mm","device":"D6908","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"mm"},
  {"name":"DEACEL. POINT mm","device":"D6910","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"mm"},
  {"name":"INTEN. TIME msec","device":"D6914","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"msec"},
  {"name":"BISCUIT THICKNESS mm","device":"D6916","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"mm"},
  {"name":"METAL PRESS. Mpa","device":"D6912","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"MPa"},
  {"name":"CLAMP TONNAGE(HE.LOW) %","device":"D6918","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP TONNAGE(HE.LOW) MN","device":"D6920","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"MN"},
  {"name":"CLAMP TONNAGE(OP.UP) %","device":"D6922","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP TONNAGE(OP.LOW) %","device":"D6924","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP TONNAGE(HE.UP) %","device":"D6926","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP FORCE (%)","device":"D1044","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP TONNAGE (T)","device":"D1045","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"T"},
  {"name":"SHOT ACC. PRESSURE","device":"D1700","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"MPa"},
  {"name":"INTENSIFICATION ACC. PRESSURE","device":"D1701","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"MPa"},
  {"name":"JET COOLING PRESSURE kgf/cm2","device":"D6954","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"kgf/cm2"},
  {"name":"VACUUM PRESSURE mbar","device":"D6928","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"mbar"},
  {"name":"COOLING WATER FLOW RATE (MOV.) L/min","device":"D6930","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"L/min"},
  {"name":"COOLING WATER FLOW RATE (STA.) L/min","device":"D6932","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"L/min"},
  {"name":"FURNACE METAL TEMP. C","device":"D6934","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Fixed Die Temp (F-1)","device":"D1400","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Fixed Die Temp (F-2)","device":"D1401","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Moving Die Temp (M-1)","device":"D1402","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Moving Die Temp (M-2)","device":"D1403","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Slide Temp -1 (S-1)","device":"D1404","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"FIX. 1 Flow (Lpm)","device":"D1410","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"FIX. 2 Flow (Lpm)","device":"D1411","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"FIX. 3 Flow (Lpm)","device":"D1412","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"Mov. 1 Flow (Lpm)","device":"D1413","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"Mov. 2 Flow (Lpm)","device":"D1414","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"Mov. 3 Flow (Lpm)","device":"D1415","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"Vacuum pressure (mmHg)","device":"D1416","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"mmHg"},
  {"name":"Cycle Start","device":"M840","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":""},
  {"name":"Cycle End","device":"M4598","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":""},
  {"name":"AVERAGE DIE CLAMP TONNAGE COUNT","device":"D7472","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":""},
  {"name":"Time for stroke(ms)","device":"D10470","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":"ms"},
  {"name":"Stroke (mm)","device":"D10356","type":"decimal","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":"mm"},
  {"name":"Shot Status","device":"D1301","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":""}
];

const UBE_KNOWN_SCALE_MAP = new Map([
  ["cycle_time_sec", 0.1],
  ["die_close_core_in_time_sec", 0.1],
  ["pouring_time_sec", 0.1],
  ["shot_fwd_time_sec", 0.1],
  ["curing_time_sec", 0.1],
  ["die_open_core_out_time_sec", 0.1],
  ["ejector_time_sec", 0.1],
  ["extract_time_sec", 0.1],
  ["spray_time_sec", 0.1],
  ["v1_m_sec", 0.01],
  ["v2_m_sec", 0.01],
  ["v3_m_sec", 0.01],
  ["v4_m_sec", 0.01],
  ["biscuit_thickness_mm", 0.1],
  ["metal_press_mpa", 0.1],
  ["clamp_tonnage_he_low_mn", 0.01],
  ["shot_acc_pressure", 0.01],
  ["intensification_acc_pressure", 0.01],
  ["jet_cooling_pressure_kgf_cm2", 0.1],
  ["cooling_water_flow_rate_mov_l_min", 0.1],
  ["cooling_water_flow_rate_sta_l_min", 0.1],
  ["fix_1_flow_lpm", 0.1],
  ["fix_2_flow_lpm", 0.1],
  ["fix_3_flow_lpm", 0.1],
  ["mov_1_flow_lpm", 0.1],
  ["mov_2_flow_lpm", 0.1],
  ["mov_3_flow_lpm", 0.1],
]);

function getKnownUbeScale(name) {
  const norm = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return UBE_KNOWN_SCALE_MAP.get(norm) ?? null;
}

const UBE_PART_NAME_REGISTER = {
  id: "part-name-d100",
  name: "Part Name",
  device: "",
  stringDevice: "D100-D110",
  stringLength: 11,
  type: "text",
  scale: 1,
  computed: "",
  enabled: true,
  min: null,
  max: null,
  warning_min: null,
  warning_max: null,
  unit: "",
  show_on_monitor: true,
  show_to_operator: false,
  log_history: true,
  alarm_enabled: false,
};

function isUbePartNameRegister(register = {}) {
  const name = String(register.name || register.parameter || register.label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return [
    "part_name",
    "part",
    "part_no",
    "part_number",
    "part_code",
    "model_name",
    "model_code",
    "die_name",
    "die_no",
    "die_number",
    "die_code",
    "current_part",
    "current_part_name",
    "current_die",
    "current_die_name",
  ].includes(name);
}

function withUbePartNameRegister(registers = []) {
  const list = Array.isArray(registers) ? registers : [];
  if (list.some(isUbePartNameRegister)) return list;
  return [UBE_PART_NAME_REGISTER, ...list];
}

function normalizeRegistersForMachineType(registers = [], type = "generic") {
  if (!Array.isArray(registers)) return registers;
  if (normalizeMachineType(type) === "ube") return withUbePartNameRegister(registers);
  return registers;
}

function normalizeRegisterRow(row = {}) {
  const name = cleanText(row.parameter_name);
  const knownScale = getKnownUbeScale(name);

  let type = normalizeRegisterType(row.data_type);
  if (knownScale !== null && knownScale !== 1 && (type === "int" || !row.data_type)) {
    type = "decimal";
  }

  let scale = cleanNumber(row.scale_factor, null);
  if ((scale === null || scale === 1) && knownScale !== null) {
    scale = knownScale;
  } else if (scale === null) {
    scale = 1;
  }

  return {
    id: `${cleanInt(row.machine_config_id, 0)}-${cleanInt(row.sort_order, 0)}-${cleanInt(row.id, 0)}`,
    name,
    display_label: cleanText(row.display_label || row.parameter_name),
    device: normalizeRegisterAddress(row.device),
    stringDevice: normalizeRegisterAddress(row.string_device),
    stringLength: cleanInt(row.string_length, ""),
    type,
    scale,
    scaleOperation: normalizeScaleOperation(row.scale_operation || row.scaleOperation || "multiply"),
    computed: cleanText(row.computed_key) || "",
    group_name: cleanText(row.group_name) || "",
    sort_order: cleanInt(row.sort_order, 0),
    enabled: row.is_active === undefined ? true : Boolean(row.is_active),
    min: cleanNumber(row.min_value),
    max: cleanNumber(row.max_value),
    warning_min: cleanNumber(row.warning_min),
    warning_max: cleanNumber(row.warning_max),
    minDevice: normalizeRegisterAddress(row.min_device),
    maxDevice: normalizeRegisterAddress(row.max_device),
    alarmDevice: normalizeRegisterAddress(row.alarm_device),
    unit: cleanText(row.unit) || "",
    show_on_monitor: row.show_on_monitor === undefined ? true : Boolean(row.show_on_monitor),
    show_to_operator: row.show_to_operator === undefined ? false : Boolean(row.show_to_operator),
    log_history: row.log_history === undefined ? true : Boolean(row.log_history),
    alarm_enabled: row.alarm_enabled === undefined ? false : Boolean(row.alarm_enabled),
  };
}

function inferMachineType(input = {}) {
  const explicit = normalizeMachineType(input.machine_type);
  return explicit || "generic";
}

function protocolType(value) {
  const compact = String(value || "SLMP").trim().toUpperCase().replace(/[\s/_-]+/g, "");
  if (compact === "GENERICTCPTEXT" || compact === "TCPTEXT") return "GENERIC_TCP_TEXT";
  if (compact === "MODBUSTCP" || compact === "TCPMODBUS") return "MODBUS_TCP";
  return "SLMP";
}

async function uniqueMachineKey(baseKey, excludeId = null) {
  const base = machineKey(baseKey);
  if (!base) return null;

  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const params = excludeId ? [candidate, excludeId] : [candidate];
    const where = excludeId ? "machine_key = ? AND id <> ?" : "machine_key = ?";
    const { rows } = await db.query(
      `SELECT TOP 1 id FROM dbo.plc_machine_configs WHERE ${where}`,
      params
    );
    if (!rows.length) return candidate;
  }

  throw new Error("Unable to create a unique machine key. Please use a different machine name.");
}

async function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await db.run(`
        IF OBJECT_ID('dbo.plc_machine_configs', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.plc_machine_configs (
            id INT IDENTITY(1,1) PRIMARY KEY,
            machine_key NVARCHAR(80) NOT NULL UNIQUE,
            machine_name NVARCHAR(160) NOT NULL,
          machine_type NVARCHAR(40) NOT NULL DEFAULT 'generic',
            plant_code NVARCHAR(40) NULL,
            ip_address VARCHAR(50) NOT NULL,
            port INT NOT NULL DEFAULT 5002,
            protocol NVARCHAR(30) NOT NULL DEFAULT 'SLMP',
            sequence_no INT NULL,
            is_active BIT NOT NULL DEFAULT 1,
            register_config_json NVARCHAR(MAX) NULL,
            notes NVARCHAR(500) NULL,
            created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
        END;
      `);
        await db.run(`
          IF OBJECT_ID(N'dbo.alarms', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.alarms (
              id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_alarms PRIMARY KEY,
              machine_config_id INT NULL,
              machine_id BIGINT NULL,
              machine_key NVARCHAR(80) NULL,
              machine_name NVARCHAR(160) NULL,
              ip_address VARCHAR(50) NULL,
              parameter_name NVARCHAR(200) NULL,
              alarm_device NVARCHAR(80) NULL,
              alarm_enabled BIT NOT NULL CONSTRAINT DF_alarms_alarm_enabled DEFAULT 0,
              created_at DATETIME2(3) NOT NULL CONSTRAINT DF_alarms_created DEFAULT SYSUTCDATETIME(),
              updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_alarms_updated DEFAULT SYSUTCDATETIME()
            );
          END;
        `);
      await db.run(`
        IF COL_LENGTH('dbo.plc_machine_configs', 'register_config_json') IS NULL
        BEGIN
          ALTER TABLE dbo.plc_machine_configs ADD register_config_json NVARCHAR(MAX) NULL;
        END;
        IF COL_LENGTH('dbo.plc_machine_configs', 'machine_type') IS NULL
        BEGIN
          ALTER TABLE dbo.plc_machine_configs ADD machine_type NVARCHAR(40) NULL;
          UPDATE dbo.plc_machine_configs SET machine_type = 'generic' WHERE machine_type IS NULL;
        END;
        IF COL_LENGTH('dbo.plc_machine_configs', 'machine_id') IS NULL
        BEGIN
          ALTER TABLE dbo.plc_machine_configs ADD machine_id BIGINT NULL;
        END;
        IF COL_LENGTH('dbo.plc_machine_configs', 'plant_code') IS NULL
        BEGIN
          ALTER TABLE dbo.plc_machine_configs ADD plant_code NVARCHAR(40) NULL;
        END;
      `);
      await db.run(`
        IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM sys.indexes
             WHERE [name] = N'IX_plc_machine_configs_ip_address'
               AND object_id = OBJECT_ID(N'dbo.plc_machine_configs')
           )
          CREATE INDEX IX_plc_machine_configs_ip_address
            ON dbo.plc_machine_configs (ip_address);
      `);
      await db.run(`
        IF OBJECT_ID(N'dbo.plc_machine_config_registers', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.plc_machine_config_registers (
            id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plc_machine_config_registers PRIMARY KEY,
            machine_config_id INT NOT NULL,
            machine_id BIGINT NULL,
            machine_key NVARCHAR(80) NULL,
            machine_name NVARCHAR(160) NULL,
            machine_type NVARCHAR(40) NULL,
            ip_address VARCHAR(50) NULL,
            parameter_name NVARCHAR(200) NOT NULL,
            display_label NVARCHAR(200) NULL,
            device NVARCHAR(80) NULL,
            string_device NVARCHAR(80) NULL,
            string_length INT NULL,
            data_type NVARCHAR(40) NOT NULL CONSTRAINT DF_plc_machine_config_registers_data_type DEFAULT N'int',
            scale_factor DECIMAL(18,6) NOT NULL CONSTRAINT DF_plc_machine_config_registers_scale DEFAULT 1,
            unit NVARCHAR(40) NULL,
            group_name NVARCHAR(80) NULL,
            sort_order INT NOT NULL CONSTRAINT DF_plc_machine_config_registers_sort DEFAULT 0,
            computed_key NVARCHAR(80) NULL,
            min_value DECIMAL(18,4) NULL,
            max_value DECIMAL(18,4) NULL,
            min_device NVARCHAR(80) NULL,
            max_device NVARCHAR(80) NULL,
            alarm_device NVARCHAR(80) NULL,
            warning_min DECIMAL(18,4) NULL,
            warning_max DECIMAL(18,4) NULL,
            alarm_enabled BIT NOT NULL CONSTRAINT DF_plc_machine_config_registers_alarm DEFAULT 0,
            show_on_monitor BIT NOT NULL CONSTRAINT DF_plc_machine_config_registers_monitor DEFAULT 1,
            show_to_operator BIT NOT NULL CONSTRAINT DF_plc_machine_config_registers_operator DEFAULT 0,
            log_history BIT NOT NULL CONSTRAINT DF_plc_machine_config_registers_history DEFAULT 1,
            is_active BIT NOT NULL CONSTRAINT DF_plc_machine_config_registers_active DEFAULT 1,
            created_at DATETIME2(3) NOT NULL CONSTRAINT DF_plc_machine_config_registers_created DEFAULT SYSUTCDATETIME(),
            updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_plc_machine_config_registers_updated DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_plc_machine_config_registers_config
              FOREIGN KEY (machine_config_id) REFERENCES dbo.plc_machine_configs(id) ON DELETE CASCADE
          );
        END;
      `);
      await db.run(`
        IF COL_LENGTH('dbo.plc_machine_config_registers', 'min_device') IS NULL
          ALTER TABLE dbo.plc_machine_config_registers ADD min_device NVARCHAR(80) NULL;
        IF COL_LENGTH('dbo.plc_machine_config_registers', 'max_device') IS NULL
          ALTER TABLE dbo.plc_machine_config_registers ADD max_device NVARCHAR(80) NULL;
        IF COL_LENGTH('dbo.plc_machine_config_registers', 'alarm_device') IS NULL
          ALTER TABLE dbo.plc_machine_config_registers ADD alarm_device NVARCHAR(80) NULL;
        IF COL_LENGTH('dbo.plc_machine_config_registers', 'scale_factor') IS NULL
          ALTER TABLE dbo.plc_machine_config_registers ADD scale_factor DECIMAL(18,6) NOT NULL CONSTRAINT DF_plc_machine_config_registers_scale DEFAULT 1;
        IF COL_LENGTH('dbo.plc_machine_config_registers', 'scale_operation') IS NULL
          ALTER TABLE dbo.plc_machine_config_registers ADD scale_operation NVARCHAR(16) NOT NULL CONSTRAINT DF_plc_machine_config_registers_scale_op DEFAULT N'multiply';

        IF OBJECT_ID(N'dbo.ube_set_parameters', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.ube_set_parameters (
            id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ube_set_parameters PRIMARY KEY,
            machine_config_id INT NOT NULL,
            machine_id BIGINT NULL,
            machine_key NVARCHAR(80) NULL,
            machine_name NVARCHAR(160) NULL,
            ip_address VARCHAR(50) NULL,
            parameter_name NVARCHAR(200) NOT NULL,
            value_device NVARCHAR(80) NULL,
            min_device NVARCHAR(80) NULL,
            max_device NVARCHAR(80) NULL,
            alarm_device NVARCHAR(80) NULL,
            alarm_enabled BIT NOT NULL CONSTRAINT DF_ube_set_parameters_alarm DEFAULT 0,
            sort_order INT NOT NULL CONSTRAINT DF_ube_set_parameters_sort DEFAULT 0,
            is_active BIT NOT NULL CONSTRAINT DF_ube_set_parameters_active DEFAULT 1,
            created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ube_set_parameters_created DEFAULT SYSUTCDATETIME(),
            updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_ube_set_parameters_updated DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_ube_set_parameters_config
              FOREIGN KEY (machine_config_id) REFERENCES dbo.plc_machine_configs(id) ON DELETE CASCADE
          );
        END;
      `);
      await db.run(`
        IF OBJECT_ID(N'dbo.plc_machine_config_registers', N'U') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM sys.indexes
             WHERE [name] = N'IX_plc_machine_config_registers_machine_active'
               AND object_id = OBJECT_ID(N'dbo.plc_machine_config_registers')
           )
          CREATE INDEX IX_plc_machine_config_registers_machine_active
            ON dbo.plc_machine_config_registers (machine_config_id, is_active, sort_order, id);

        IF OBJECT_ID(N'dbo.plc_machine_config_registers', N'U') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM sys.indexes
             WHERE [name] = N'IX_plc_machine_config_registers_ip'
               AND object_id = OBJECT_ID(N'dbo.plc_machine_config_registers')
           )
          CREATE INDEX IX_plc_machine_config_registers_ip
            ON dbo.plc_machine_config_registers (ip_address, is_active, sort_order, id);
      `);
      await db.run(`
        IF OBJECT_ID(N'dbo.plc_machine_readings', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.plc_machine_readings (
            id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plc_machine_readings PRIMARY KEY,
            recorded_at DATETIME2(3) NOT NULL CONSTRAINT DF_plc_machine_readings_recorded_at DEFAULT SYSUTCDATETIME(),
            machine_config_id INT NULL,
            machine_key NVARCHAR(80) NOT NULL,
            machine_name NVARCHAR(160) NULL,
            machine_type NVARCHAR(40) NULL,
            plc_ip NVARCHAR(45) NULL,
            plc_port INT NULL,
            part_name NVARCHAR(160) NULL,
            event_time DATETIME2(3) NULL,
            raw_readings_json NVARCHAR(MAX) NULL,
            created_at DATETIME2(3) NOT NULL CONSTRAINT DF_plc_machine_readings_created_at DEFAULT SYSUTCDATETIME()
          );
        END;

        IF OBJECT_ID(N'dbo.plc_machine_reading_values', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.plc_machine_reading_values (
            id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plc_machine_reading_values PRIMARY KEY,
            reading_id BIGINT NOT NULL,
            parameter_key NVARCHAR(160) NOT NULL,
            parameter_label NVARCHAR(200) NULL, 
            parameter_type NVARCHAR(40) NULL,
            parameter_unit NVARCHAR(40) NULL,
            numeric_value DECIMAL(18,4) NULL,
            text_value NVARCHAR(MAX) NULL,
            bool_value BIT NULL,
            raw_value NVARCHAR(MAX) NULL,
            created_at DATETIME2(3) NOT NULL CONSTRAINT DF_plc_machine_reading_values_created_at DEFAULT SYSUTCDATETIME()
          );
        END;
      `);
      await db.run(`
        IF OBJECT_ID(N'dbo.plc_machine_readings', N'U') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM sys.indexes
             WHERE [name] = N'IX_plc_machine_readings_machine_recorded_desc'
               AND object_id = OBJECT_ID(N'dbo.plc_machine_readings')
           )
          CREATE INDEX IX_plc_machine_readings_machine_recorded_desc
            ON dbo.plc_machine_readings (machine_key, recorded_at DESC, id DESC);

        IF OBJECT_ID(N'dbo.plc_machine_reading_values', N'U') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM sys.indexes
             WHERE [name] = N'IX_plc_machine_reading_values_reading_parameter'
               AND object_id = OBJECT_ID(N'dbo.plc_machine_reading_values')
           )
          CREATE INDEX IX_plc_machine_reading_values_reading_parameter
            ON dbo.plc_machine_reading_values (reading_id, parameter_key);
      `);
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

function normalizeMachine(row = {}) {
  let registerConfig = Array.isArray(row.register_config_rows) && row.register_config_rows.length
    ? row.register_config_rows
    : null;
  if (!registerConfig) {
    try {
      registerConfig = row.register_config_json ? JSON.parse(row.register_config_json) : null;
    } catch {
      registerConfig = null;
    }
  }
  const machineType = inferMachineType({ ...row, register_config: registerConfig });
  const normalizedRegisterConfig = normalizeRegistersForMachineType(registerConfig, machineType);
  return {
    id: row.id || null,
    machine_id: row.machine_id || null,
    machine_key: row.machine_key,
    machine_name: row.machine_name,
    machine_type: machineType,
    plant_code: row.plant_code || null,
    ip_address: row.ip_address,
    port: Number(row.port || 5002),
    protocol: row.protocol || "SLMP",
    sequence_no: row.sequence_no ?? null,
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    register_config: Array.isArray(normalizedRegisterConfig) ? normalizedRegisterConfig : null,
    machine_code: row.machine_code || null,
    asset_machine_name: row.asset_machine_name || null,
    line_id: row.line_id || null,
    notes: row.notes || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function registersForType(_type = "generic") {
  return [];
}

function normalizeRegisters(input) {
  if (!Array.isArray(input)) return null;
  return input
    .map((item, index) => {
      const name = cleanText(item.name);
      const knownScale = getKnownUbeScale(name);

      let type = normalizeRegisterType(item.type);
      if (knownScale !== null && knownScale !== 1 && (type === "int" || !item.type)) {
        type = "decimal";
      }

      const device = normalizeRegisterAddress(item.device);
      const stringDevice = normalizeRegisterAddress(item.stringDevice || item.string_device);
      const textDevice = stringDevice || (type === "text" ? device : "");

      let scale = item.scale === "" || item.scale === null || item.scale === undefined
        ? (item.scale_factor === undefined || item.scale_factor === null ? 1 : Number(item.scale_factor))
        : Number(item.scale);
      if (Number.isNaN(scale)) scale = 1;

      return {
        id: cleanText(item.id) || `${name || "register"}-${index}`,
        name,
        display_label: cleanText(item.display_label || item.displayLabel || item.label),
        device: type === "text" ? "" : device,
        stringDevice: textDevice,
        stringLength: cleanInt(item.stringLength ?? item.string_length, ""),
        type,
        scale,
        scaleOperation: normalizeScaleOperation(item.scaleOperation || item.scale_operation || "multiply"),
        computed: cleanText(item.computed) || "",
        group_name: cleanText(item.group_name || item.groupName || item.group || item.category || item.section || item.tab),
        sort_order: cleanInt(item.sort_order ?? item.sortOrder, index + 1),
        enabled: cleanBool(item.enabled, true),
        min: cleanNumber(item.min ?? item.minimum),
        max: cleanNumber(item.max ?? item.maximum),
        warning_min: cleanNumber(item.warning_min ?? item.warningMin),
        warning_max: cleanNumber(item.warning_max ?? item.warningMax),
        minDevice: normalizeRegisterAddress(item.minDevice || item.min_device || item.min_address),
        maxDevice: normalizeRegisterAddress(item.maxDevice || item.max_device || item.max_address),
        alarmDevice: normalizeRegisterAddress(item.alarmDevice || item.alarm_device || item.alarm_address),
        unit: cleanText(item.unit) || "",
        show_on_monitor: cleanBool(item.show_on_monitor ?? item.showOnMonitor, true),
        show_to_operator: cleanBool(item.show_to_operator ?? item.showToOperator, false),
        log_history: cleanBool(item.log_history ?? item.logHistory, true),
        alarm_enabled: cleanBool(item.alarm_enabled ?? item.alarmEnabled, false),
      };
    })
    .filter((item) => item.name && (item.computed || item.device || item.stringDevice));
}

async function tableExists(tableName) {
  const { rows } = await db.query(
    "SELECT CASE WHEN OBJECT_ID(?, 'U') IS NULL THEN 0 ELSE 1 END AS table_exists",
    [tableName]
  );
  return Number(rows[0]?.table_exists || 0) === 1;
}

async function syncMachineConfigRegisters(machineConfigId, payload = {}, registers = []) {
  const id = cleanInt(machineConfigId);
  if (!id || !Array.isArray(registers)) return;
  if (!(await tableExists("dbo.plc_machine_config_registers"))) return;

  await withDeadlockRetry(() => db.run(
    "DELETE FROM dbo.plc_machine_config_registers WHERE machine_config_id = ?",
    [id]
  ));

  for (const [index, register] of registers.entries()) {
    await withDeadlockRetry(() => db.run(`
      INSERT INTO dbo.plc_machine_config_registers
        (machine_config_id, machine_id, machine_key, machine_name, machine_type, ip_address,
         parameter_name, display_label, device, string_device, string_length, data_type,
         scale_factor, scale_operation, unit, group_name, sort_order, computed_key,
         min_value, max_value, min_device, max_device, alarm_device, warning_min, warning_max, alarm_enabled,
         show_on_monitor, show_to_operator, log_history, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      payload.machine_id,
      payload.machine_key,
      payload.machine_name,
      payload.machine_type,
      payload.ip_address,
      register.name,
      register.display_label || register.name,
      register.device || "",
      register.stringDevice || register.string_device || "",
      cleanInt(register.stringLength ?? register.string_length),
      register.type || "int",
      register.scale === "" || register.scale === null || register.scale === undefined ? 1 : Number(register.scale),
      normalizeScaleOperation(register.scaleOperation || register.scale_operation || "multiply"),
      register.unit || "",
      register.group_name || register.group || "",
      cleanInt(register.sort_order ?? register.sortOrder, index + 1),
      register.computed || "",
      register.min ?? null,
      register.max ?? null,
      register.minDevice || register.min_device || "",
      register.maxDevice || register.max_device || "",
      register.alarmDevice || register.alarm_device || "",
      register.warning_min ?? null,
      register.warning_max ?? null,
      Number(Boolean(register.alarm_enabled ?? register.alarmEnabled)),
      register.show_on_monitor === undefined ? 1 : Number(Boolean(register.show_on_monitor)),
      register.show_to_operator === undefined ? 0 : Number(Boolean(register.show_to_operator)),
      register.log_history === undefined ? 1 : Number(Boolean(register.log_history)),
      register.enabled === undefined ? 1 : Number(Boolean(register.enabled)),
    ]));
  }

  if (normalizeMachineType(payload.machine_type) === "ube" && await tableExists("dbo.ube_set_parameters")) {
    await withDeadlockRetry(() => db.run(
      "DELETE FROM dbo.ube_set_parameters WHERE machine_config_id = ?",
      [id]
    ));
    for (const [index, register] of registers.entries()) {
      await withDeadlockRetry(() => db.run(`
        INSERT INTO dbo.ube_set_parameters
          (machine_config_id, machine_id, machine_key, machine_name, ip_address,
           parameter_name, value_device, min_device, max_device, alarm_device,
           alarm_enabled, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        payload.machine_id,
        payload.machine_key,
        payload.machine_name,
        payload.ip_address,
        register.name,
        register.device || register.stringDevice || register.string_device || "",
        register.minDevice || register.min_device || "",
        register.maxDevice || register.max_device || "",
        register.alarmDevice || register.alarm_device || "",
        Number(Boolean(register.alarm_enabled ?? register.alarmEnabled)),
        cleanInt(register.sort_order ?? register.sortOrder, index + 1),
        register.enabled === undefined ? 1 : Number(Boolean(register.enabled)),
      ]));
    }
  }
  // Sync alarm entries into dbo.alarms (new table)
  if (await tableExists("dbo.alarms")) {
    await withDeadlockRetry(() => db.run(
      "DELETE FROM dbo.alarms WHERE machine_config_id = ?",
      [id]
    ));
    for (const [index, register] of registers.entries()) {
      const alarmDev = register.alarmDevice || register.alarm_device || "";
      const alarmEnabled = Number(Boolean(register.alarm_enabled ?? register.alarmEnabled));
      if (!alarmDev && !alarmEnabled) continue;
      await withDeadlockRetry(() => db.run(`
        INSERT INTO dbo.alarms
          (machine_config_id, machine_id, machine_key, machine_name, ip_address, parameter_name, alarm_device, alarm_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        payload.machine_id,
        payload.machine_key,
        payload.machine_name,
        payload.ip_address,
        register.name || register.parameter || "",
        alarmDev,
        alarmEnabled,
      ]));
    }
  }
}

async function getRegisterConfigsByMachineIds(machineConfigIds = []) {
  const ids = [...new Set(machineConfigIds.map((id) => cleanInt(id)).filter(Boolean))];
  const grouped = new Map();
  if (!ids.length || !(await tableExists("dbo.plc_machine_config_registers"))) return grouped;

  const placeholders = ids.map(() => "?").join(", ");
  const { rows } = await db.query(`
    SELECT
      id,
      machine_config_id,
      parameter_name,
      display_label,
      device,
      string_device,
      string_length,
      data_type,
      scale_factor,
      scale_operation,
      unit,
      group_name,
      sort_order,
      computed_key,
      min_value,
      max_value,
      min_device,
      max_device,
      alarm_device,
      warning_min,
      warning_max,
      alarm_enabled,
      show_on_monitor,
      show_to_operator,
      log_history,
      is_active
    FROM dbo.plc_machine_config_registers
    WHERE machine_config_id IN (${placeholders})
      AND is_active = 1
    ORDER BY machine_config_id, sort_order, id
  `, ids);

  rows.forEach((row) => {
    const machineConfigId = cleanInt(row.machine_config_id);
    if (!grouped.has(machineConfigId)) grouped.set(machineConfigId, []);
    grouped.get(machineConfigId).push(normalizeRegisterRow(row));
  });
  return grouped;
}

async function syncMachineNameReferences({ ip, machineKey, machineName }) {
  const cleanIp = cleanText(ip);
  const cleanKey = cleanText(machineKey);
  const cleanName = cleanText(machineName);
  if (!cleanName || (!cleanIp && !cleanKey)) return;

  const updates = [
    {
      table: "dbo.Leaktest",
      sql: "UPDATE dbo.Leaktest SET Machine = ? WHERE PLC_IP = ?",
      params: [cleanName, cleanIp],
      enabled: Boolean(cleanIp),
    },
    {
      table: "dbo.Gauge",
      sql: "UPDATE dbo.Gauge SET Machine_Name = ? WHERE PLC_IP = ? OR Machine_Key = ?",
      params: [cleanName, cleanIp, cleanKey],
      enabled: Boolean(cleanIp || cleanKey),
    },
    {
      table: "dbo.PlcCycleReadings",
      sql: "UPDATE dbo.PlcCycleReadings SET machine_name = ? WHERE plc_ip = ? OR machine_key = ?",
      params: [cleanName, cleanIp, cleanKey],
      enabled: Boolean(cleanIp || cleanKey),
    },
    {
      table: "dbo.PlcConnectionEvents",
      sql: "UPDATE dbo.PlcConnectionEvents SET machine_name = ? WHERE plc_ip = ? OR machine_key = ?",
      params: [cleanName, cleanIp, cleanKey],
      enabled: Boolean(cleanIp || cleanKey),
    },
    {
      table: "dbo.plc_machine_readings",
      sql: "UPDATE dbo.plc_machine_readings SET machine_name = ? WHERE plc_ip = ? OR machine_key = ?",
      params: [cleanName, cleanIp, cleanKey],
      enabled: Boolean(cleanIp || cleanKey),
    },
  ];

  for (const update of updates) {
    if (!update.enabled || !(await tableExists(update.table))) continue;
    try {
      await withDeadlockRetry(() => db.run(update.sql, update.params));
    } catch (error) {
      console.warn(`Machine reference sync skipped for ${update.table}: ${error.message}`);
    }
  }
}

async function saveMachineRecord(input = {}) {
  const name = cleanText(input.machine_name || input.name);
  if (!name) throw new Error("Machine name is required");
  const ip = cleanText(input.ip_address || input.ip);
  if (!ip || !isValidIpv4(ip)) throw new Error("Valid PLC IP address is required");
  let id = cleanInt(input.id);
  const hasRegisterConfigInput = Object.prototype.hasOwnProperty.call(input, "register_config");
  const registerConfig = hasRegisterConfigInput ? normalizeRegisters(input.register_config) || [] : null;
  const type = inferMachineType({ ...input, ip_address: ip, register_config: registerConfig });
  const existingByIp = await db.query(
    "SELECT TOP 1 id, register_config_json FROM dbo.plc_machine_configs WHERE ip_address = ? AND (? IS NULL OR id <> ?) ORDER BY id",
    [ip, id, id]
  );
  if (existingByIp.rows.length) {
    if (id) throw new Error(`PLC IP ${ip} is already assigned to another machine config.`);
    id = existingByIp.rows[0].id;
  }
  let existingRegisterConfigJson = existingByIp.rows[0]?.register_config_json || null;
  if (!existingRegisterConfigJson && id) {
    const existingById = await db.query(
      "SELECT TOP 1 register_config_json FROM dbo.plc_machine_configs WHERE id = ?",
      [id]
    );
    existingRegisterConfigJson = existingById.rows[0]?.register_config_json || null;
  }
  const normalizedRegisterConfig = hasRegisterConfigInput
    ? normalizeRegistersForMachineType(registerConfig, type)
    : null;
  const stableBaseKey = canonicalMachineKeyFor({
    ip,
    type,
    inputKey: input.machine_key,
    name,
  });
  const key = type === "ube"
    ? stableBaseKey
    : await uniqueMachineKey(stableBaseKey, id);
  if (!key) throw new Error("Machine key is required");
  const payload = {
    machine_key: key,
    machine_id: cleanInt(input.machine_id),
    machine_name: name,
    machine_type: type,
    plant_code: cleanText(input.plant_code),
    ip_address: ip,
    port: cleanInt(input.port, 5002),
    protocol: protocolType(input.protocol),
    sequence_no: cleanInt(input.sequence_no),
    is_active: input.is_active === undefined ? 1 : Number(Boolean(input.is_active)),
    register_config_json: hasRegisterConfigInput
      ? JSON.stringify(normalizedRegisterConfig)
      : existingRegisterConfigJson,
    notes: cleanText(input.notes),
  };

  if (id) {
    const { rows } = await db.query(
      "SELECT TOP 1 id FROM dbo.plc_machine_configs WHERE id = ?",
      [id]
    );
    if (!rows.length) throw new Error("Machine config not found");

    await withDeadlockRetry(() => db.run(`
      UPDATE dbo.plc_machine_configs
      SET machine_id = ?, machine_key = ?, machine_name = ?, machine_type = ?, plant_code = ?, ip_address = ?, port = ?,
          protocol = ?, sequence_no = ?, is_active = ?,
          register_config_json = ?, notes = ?, updated_at = SYSUTCDATETIME()
      WHERE id = ?
    `, [
      payload.machine_id,
      payload.machine_key,
      payload.machine_name,
      payload.machine_type,
      payload.plant_code,
      payload.ip_address,
      payload.port,
      payload.protocol,
      payload.sequence_no,
      payload.is_active,
      payload.register_config_json,
      payload.notes,
      id,
    ]));
    if (payload.machine_id) {
      await withDeadlockRetry(() => db.run(`
        UPDATE dbo.iot_machines
        SET name = ?, ip_address = ?, port = ?, protocol = ?
        WHERE id = ?
      `, [payload.machine_name, payload.ip_address, String(payload.port), payload.protocol, payload.machine_id]));
    }
    const registersToSync = hasRegisterConfigInput
      ? (normalizedRegisterConfig || [])
      : [];
    await syncMachineConfigRegisters(id, payload, registersToSync);
    await syncMachineNameReferences({
      ip: payload.ip_address,
      machineKey: payload.machine_key,
      machineName: payload.machine_name,
    });
    return id;
  }

  const result = await withDeadlockRetry(() => db.run(`
    INSERT INTO dbo.plc_machine_configs
      (machine_id, machine_key, machine_name, machine_type, plant_code, ip_address, port, protocol,
       sequence_no, is_active, register_config_json, notes)
    OUTPUT INSERTED.id
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.machine_id,
    payload.machine_key,
    payload.machine_name,
    payload.machine_type,
    payload.plant_code,
    payload.ip_address,
    payload.port,
    payload.protocol,
    payload.sequence_no,
    payload.is_active,
    payload.register_config_json,
    payload.notes,
  ]));
  const insertedId = result.rows[0]?.id;
  if (payload.machine_id) {
    await withDeadlockRetry(() => db.run(`
      UPDATE dbo.iot_machines
      SET name = ?, ip_address = ?, port = ?, protocol = ?
      WHERE id = ?
    `, [payload.machine_name, payload.ip_address, String(payload.port), payload.protocol, payload.machine_id]));
  }
  const insertedRegisters = hasRegisterConfigInput
    ? (normalizedRegisterConfig || [])
    : [];
  await syncMachineConfigRegisters(insertedId, payload, insertedRegisters);
  await syncMachineNameReferences({
    ip: payload.ip_address,
    machineKey: payload.machine_key,
    machineName: payload.machine_name,
  });
  return insertedId;
}

async function listMachines(_req, res) {
  try {
    await ensureSchema();
    const { rows } = await db.query(`
      SELECT
        pc.id,
        pc.machine_id,
        pc.machine_key,
        pc.machine_name,
        pc.machine_type,
        pc.ip_address,
        pc.port,
        pc.protocol,
        pc.sequence_no,
        pc.is_active,
        pc.register_config_json,
        pc.notes,
        pc.created_at,
        pc.updated_at,
        m.machine_code,
        m.name AS asset_machine_name,
        m.line_id,
        COALESCE(m.plant_code, pc.plant_code) AS plant_code
      FROM dbo.plc_machine_configs pc
      LEFT JOIN dbo.iot_machines m ON m.id = pc.machine_id
      ORDER BY sequence_no, machine_name
    `);
    const registerConfigs = await getRegisterConfigsByMachineIds(rows.map((row) => row.id));
    res.json({
      success: true,
      data: rows.map((row) => normalizeMachine({
        ...row,
        register_config_rows: registerConfigs.get(cleanInt(row.id)) || [],
      })),
      default_registers: registersForType("generic"),
      default_registers_by_type: {
        generic: registersForType("generic"),
        ube: registersForType("ube"),
        leaktest: registersForType("leaktest"),
        gauge: registersForType("gauge"),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function saveMachine(req, res) {
  try {
    await ensureSchema();
    const id = await saveMachineRecord(req.body || {});
    res.json({ success: true, id });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function deleteMachine(req, res) {
  try {
    await ensureSchema();
    const id = cleanInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Valid machine id is required" });

    const { rows } = await db.query(
      "SELECT TOP 1 id, machine_name FROM dbo.plc_machine_configs WHERE id = ?",
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Machine config not found" });

    await db.run("DELETE FROM dbo.plc_machine_configs WHERE id = ?", [id]);
    res.json({ success: true, message: "Machine config deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function testConnection(req, res) {
  const ip = cleanText(req.body.ip_address || req.body.ip);
  const port = cleanInt(req.body.port, 5002);
  if (!ip || !isValidIpv4(ip)) return res.status(400).json({ success: false, message: "Valid PLC IP address is required" });

  const socket = new net.Socket();
  const startedAt = Date.now();
  const timeoutMs = cleanInt(req.body.timeout_ms, 5000);
  let settled = false;

  const finish = (status, payload) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    res.status(status).json(payload);
  };

  socket.setTimeout(timeoutMs);
  socket.once("connect", () => finish(200, {
    success: true,
    connected: true,
    latency_ms: Date.now() - startedAt,
    message: "PLC TCP connection successful",
  }));
  socket.once("timeout", () => finish(408, {
    success: false,
    connected: false,
    message: `PLC connection timeout after ${timeoutMs}ms`,
  }));
  socket.once("error", (error) => finish(502, {
    success: false,
    connected: false,
    message: error.message,
  }));
  socket.connect(port, ip);
}

module.exports = {
  ensureSchema,
  listMachines,
  normalizeMachineType,
  saveMachine,
  deleteMachine,
  testConnection,
  DEFAULT_UBE_REGISTERS,
  getKnownUbeScale,
};
