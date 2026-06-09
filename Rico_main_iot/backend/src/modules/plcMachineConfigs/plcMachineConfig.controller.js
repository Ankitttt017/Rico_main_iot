"use strict";

const net = require("net");
const db = require("../../config/db");
const { LEAK_TEST_PARAMETERS, UBE_READ_PARAMETERS } = require("../plcMonitor/config/registerConfig");

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

function machineType(value) {
  const type = String(value || "ube").trim().toLowerCase();
  return type === "leaktest" ? "leaktest" : "ube";
}

function protocolType(value) {
  const compact = String(value || "SLMP").trim().toUpperCase().replace(/[\s/_-]+/g, "");
  if (compact === "GENERICTCPTEXT" || compact === "TCPTEXT") return "GENERIC_TCP_TEXT";
  if (compact === "MODBUSTCP" || compact === "TCPMODBUS") return "MODBUS_TCP";
  return "SLMP";
}

function profileForType(type) {
  return type === "leaktest" ? "LEAK_TEST" : "UBE_850T";
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
            machine_type NVARCHAR(40) NOT NULL DEFAULT 'ube',
            ip_address VARCHAR(50) NOT NULL,
            port INT NOT NULL DEFAULT 5002,
            protocol NVARCHAR(30) NOT NULL DEFAULT 'SLMP',
            register_profile_key NVARCHAR(80) NOT NULL DEFAULT 'UBE_850T',
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
  return {
    id: row.id || null,
    machine_key: row.machine_key,
    machine_name: row.machine_name,
    machine_type: row.machine_type || "ube",
    ip_address: row.ip_address,
    port: Number(row.port || 5002),
    protocol: row.protocol || "SLMP",
    register_profile_key: row.register_profile_key || "UBE_850T",
    sequence_no: row.sequence_no ?? null,
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    register_config: Array.isArray(registerConfig) ? registerConfig : null,
    notes: row.notes || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function registersForType(type = "ube") {
  return (type === "leaktest" ? LEAK_TEST_PARAMETERS : UBE_READ_PARAMETERS)
    .filter((parameter) => !parameter.hidden)
    .map((parameter, index) => ({
      id: `${parameter.name}-${index}`,
      name: parameter.name,
      device: parameter.device || "",
      stringDevice: parameter.stringDevice || "",
      stringLength: parameter.stringLength || "",
      type: parameter.type || "int",
      scale: parameter.scale ?? 1,
      computed: parameter.computed || "",
      enabled: true,
    }));
}

function normalizeRegisters(input) {
  if (!Array.isArray(input)) return null;
  return input
    .map((item, index) => ({
      id: cleanText(item.id) || `${cleanText(item.name) || "register"}-${index}`,
      name: cleanText(item.name),
      device: cleanText(item.device) || "",
      stringDevice: cleanText(item.stringDevice) || "",
      stringLength: cleanInt(item.stringLength, ""),
      type: cleanText(item.type) || "int",
      scale: item.scale === "" || item.scale === null || item.scale === undefined ? 1 : Number(item.scale),
      computed: cleanText(item.computed) || "",
      enabled: item.enabled === undefined ? true : Boolean(item.enabled),
    }))
    .filter((item) => item.name && (item.computed || item.device || item.stringDevice));
}

async function saveMachineRecord(input = {}) {
  const name = cleanText(input.machine_name || input.name);
  if (!name) throw new Error("Machine name is required");
  const ip = cleanText(input.ip_address || input.ip);
  if (!ip || !isValidIpv4(ip)) throw new Error("Valid PLC IP address is required");
  const id = cleanInt(input.id);
  const key = await uniqueMachineKey(input.machine_key || name, id);
  if (!key) throw new Error("Machine key is required");
  const type = machineType(input.machine_type);
  const profile = cleanText(input.register_profile_key) || profileForType(type);

  const payload = {
    machine_key: key,
    machine_name: name,
    machine_type: type,
    ip_address: ip,
    port: cleanInt(input.port, 5002),
    protocol: protocolType(input.protocol),
    register_profile_key: profile,
    sequence_no: cleanInt(input.sequence_no),
    is_active: input.is_active === undefined ? 1 : Number(Boolean(input.is_active)),
    register_config_json: JSON.stringify(normalizeRegisters(input.register_config) || registersForType(type)),
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
      SET machine_key = ?, machine_name = ?, machine_type = ?, ip_address = ?, port = ?,
          protocol = ?, register_profile_key = ?, sequence_no = ?, is_active = ?,
          register_config_json = ?, notes = ?, updated_at = SYSUTCDATETIME()
      WHERE id = ?
    `, [
      payload.machine_key,
      payload.machine_name,
      payload.machine_type,
      payload.ip_address,
      payload.port,
      payload.protocol,
      payload.register_profile_key,
      payload.sequence_no,
      payload.is_active,
      payload.register_config_json,
      payload.notes,
      id,
    ]);
    return id;
  }

  const result = await db.run(`
    INSERT INTO dbo.plc_machine_configs
      (machine_key, machine_name, machine_type, ip_address, port, protocol,
       register_profile_key, sequence_no, is_active, register_config_json, notes)
    OUTPUT INSERTED.id
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.machine_key,
    payload.machine_name,
    payload.machine_type,
    payload.ip_address,
    payload.port,
    payload.protocol,
    payload.register_profile_key,
    payload.sequence_no,
    payload.is_active,
    payload.register_config_json,
    payload.notes,
  ]);
  return result.rows[0]?.id;
}

async function listMachines(_req, res) {
  try {
    await ensureSchema();
    const { rows } = await db.query(`
      SELECT *
      FROM dbo.plc_machine_configs
      ORDER BY sequence_no, machine_name
    `);
    res.json({
      success: true,
      data: rows.map(normalizeMachine),
      default_registers: registersForType("ube"),
      default_registers_by_type: {
        ube: registersForType("ube"),
        leaktest: registersForType("leaktest"),
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
  saveMachine,
  deleteMachine,
  testConnection,
};
