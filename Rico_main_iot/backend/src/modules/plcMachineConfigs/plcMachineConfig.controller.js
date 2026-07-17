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

function normalizeRegisterType(value) {
  const normalized = String(value || "int").trim().toLowerCase().replace(/[\s/_-]+/g, "");
  if (["text", "string", "ascii", "stringascii", "char", "chars"].includes(normalized)) return "text";
  if (["decimal", "dec", "scaled", "scaledd", "decscaled", "decscaledd"].includes(normalized)) return "decimal";
  if (["boolean", "bool", "bit", "mbit"].includes(normalized)) return normalized === "boolean" ? "bool" : normalized;
  if (["uint16", "uint32", "dword", "real32", "int"].includes(normalized)) return normalized;
  if (["int16", "word"].includes(normalized)) return "int";
  return "int";
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

function normalizeRegistersForMachineType(registers = [], type = "generic") {
  if (!Array.isArray(registers)) return registers;
  return registers;
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
  let registerConfig = null;
  try {
    registerConfig = row.register_config_json ? JSON.parse(row.register_config_json) : null;
  } catch {
    registerConfig = null;
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
      const type = normalizeRegisterType(item.type);
      const device = normalizeRegisterAddress(item.device);
      const stringDevice = normalizeRegisterAddress(item.stringDevice || item.string_device);
      const textDevice = stringDevice || (type === "text" ? device : "");

      return {
        id: cleanText(item.id) || `${cleanText(item.name) || "register"}-${index}`,
        name: cleanText(item.name),
        device: type === "text" ? "" : device,
        stringDevice: textDevice,
        stringLength: cleanInt(item.stringLength ?? item.string_length, ""),
        type,
        scale: item.scale === "" || item.scale === null || item.scale === undefined ? 1 : Number(item.scale),
        computed: cleanText(item.computed) || "",
        enabled: cleanBool(item.enabled, true),
        min: cleanNumber(item.min ?? item.minimum),
        max: cleanNumber(item.max ?? item.maximum),
        warning_min: cleanNumber(item.warning_min ?? item.warningMin),
        warning_max: cleanNumber(item.warning_max ?? item.warningMax),
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
    await db.run(update.sql, update.params);
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

    await db.run(`
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
    ]);
    if (payload.machine_id) {
      await db.run(`
        UPDATE dbo.iot_machines
        SET name = ?, ip_address = ?, port = ?, protocol = ?
        WHERE id = ?
      `, [payload.machine_name, payload.ip_address, String(payload.port), payload.protocol, payload.machine_id]);
    }
    await syncMachineNameReferences({
      ip: payload.ip_address,
      machineKey: payload.machine_key,
      machineName: payload.machine_name,
    });
    return id;
  }

  const result = await db.run(`
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
  ]);
  if (payload.machine_id) {
    await db.run(`
      UPDATE dbo.iot_machines
      SET name = ?, ip_address = ?, port = ?, protocol = ?
      WHERE id = ?
    `, [payload.machine_name, payload.ip_address, String(payload.port), payload.protocol, payload.machine_id]);
  }
  await syncMachineNameReferences({
    ip: payload.ip_address,
    machineKey: payload.machine_key,
    machineName: payload.machine_name,
  });
  return result.rows[0]?.id;
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
    res.json({
      success: true,
      data: rows.map(normalizeMachine),
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
};
