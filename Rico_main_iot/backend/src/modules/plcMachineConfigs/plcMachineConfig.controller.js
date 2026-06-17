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

function templateKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
            plant_code NVARCHAR(40) NULL,
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
        IF OBJECT_ID('dbo.plc_register_templates', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.plc_register_templates (
            id INT IDENTITY(1,1) PRIMARY KEY,
            template_key NVARCHAR(80) NOT NULL UNIQUE,
            template_name NVARCHAR(160) NOT NULL,
            machine_type NVARCHAR(40) NOT NULL DEFAULT 'ube',
            register_config_json NVARCHAR(MAX) NOT NULL,
            notes NVARCHAR(500) NULL,
            is_active BIT NOT NULL DEFAULT 1,
            is_system BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
        END;
      `);
      if (String(process.env.PLC_SEED_SYSTEM_TEMPLATES || "false").toLowerCase() === "true") {
        await seedDefaultTemplates();
      }
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
    machine_id: row.machine_id || null,
    machine_key: row.machine_key,
    machine_name: row.machine_name,
    machine_type: row.machine_type || "ube",
    plant_code: row.plant_code || null,
    ip_address: row.ip_address,
    port: Number(row.port || 5002),
    protocol: row.protocol || "SLMP",
    register_profile_key: row.register_profile_key || "UBE_850T",
    sequence_no: row.sequence_no ?? null,
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    register_config: Array.isArray(registerConfig) ? registerConfig : null,
    machine_code: row.machine_code || null,
    asset_machine_name: row.asset_machine_name || null,
    line_id: row.line_id || null,
    notes: row.notes || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function systemTemplates() {
  return [
    {
      template_key: "UBE_850T",
      template_name: "UBE 850T Die Casting",
      machine_type: "ube",
      notes: "System default UBE die casting register map.",
      register_config: registersForType("ube"),
      is_system: 1,
    },
    {
      template_key: "LEAK_TEST",
      template_name: "Leak Test",
      machine_type: "leaktest",
      notes: "System default leak test register map.",
      register_config: registersForType("leaktest"),
      is_system: 1,
    },
  ];
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
      min: null,
      max: null,
      warning_min: null,
      warning_max: null,
      unit: parameter.unit || "",
      show_on_monitor: true,
      show_to_operator: false,
      log_history: true,
      alarm_enabled: false,
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
    }))
    .filter((item) => item.name && (item.computed || item.device || item.stringDevice));
}

function normalizeTemplate(row = {}) {
  let registers = [];
  try {
    registers = row.register_config_json ? JSON.parse(row.register_config_json) : [];
  } catch {
    registers = [];
  }
  return {
    id: row.id,
    template_key: row.template_key,
    template_name: row.template_name,
    machine_type: machineType(row.machine_type),
    register_config: Array.isArray(registers) ? registers : [],
    notes: row.notes || "",
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    is_system: Boolean(row.is_system),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function seedDefaultTemplates() {
  for (const template of systemTemplates()) {
    const normalized = normalizeRegisters(template.register_config) || [];
    await db.run(`
      IF NOT EXISTS (SELECT 1 FROM dbo.plc_register_templates WHERE template_key = ?)
      BEGIN
        INSERT INTO dbo.plc_register_templates
          (template_key, template_name, machine_type, register_config_json, notes, is_active, is_system)
        VALUES (?, ?, ?, ?, ?, 1, 1)
      END
    `, [
      template.template_key,
      template.template_key,
      template.template_name,
      template.machine_type,
      JSON.stringify(normalized),
      template.notes,
    ]);
  }
}

async function getTemplatesByType() {
  await ensureSchema();
  const { rows } = await db.query(`
    SELECT *
    FROM dbo.plc_register_templates
    WHERE is_active = 1
    ORDER BY is_system DESC, template_name
  `);
  const templates = rows.map(normalizeTemplate);
  const byType = { ube: [], leaktest: [] };
  templates.forEach((template) => {
    const type = machineType(template.machine_type);
    byType[type] = byType[type] || [];
    byType[type].push(template);
  });
  return { templates, byType };
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
  const profile = templateKey(input.register_profile_key) || profileForType(type);
  const { templates } = await getTemplatesByType();
  const selectedTemplate = templates.find((template) => template.template_key === profile);
  const fallbackRegisters = selectedTemplate?.register_config?.length
    ? selectedTemplate.register_config
    : registersForType(type);

  const payload = {
    machine_key: key,
    machine_id: cleanInt(input.machine_id),
    machine_name: name,
    machine_type: type,
    plant_code: cleanText(input.plant_code),
    ip_address: ip,
    port: cleanInt(input.port, 5002),
    protocol: protocolType(input.protocol),
    register_profile_key: profile,
    sequence_no: cleanInt(input.sequence_no),
    is_active: input.is_active === undefined ? 1 : Number(Boolean(input.is_active)),
    register_config_json: JSON.stringify(normalizeRegisters(input.register_config) || fallbackRegisters),
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
          protocol = ?, register_profile_key = ?, sequence_no = ?, is_active = ?,
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
      payload.register_profile_key,
      payload.sequence_no,
      payload.is_active,
      payload.register_config_json,
      payload.notes,
      id,
    ]);
    if (payload.machine_id) {
      await db.run(`
        UPDATE dbo.iot_machines
        SET ip_address = ?, port = ?, protocol = ?
        WHERE id = ?
      `, [payload.ip_address, String(payload.port), payload.protocol, payload.machine_id]);
    }
    return id;
  }

  const result = await db.run(`
    INSERT INTO dbo.plc_machine_configs
      (machine_id, machine_key, machine_name, machine_type, plant_code, ip_address, port, protocol,
       register_profile_key, sequence_no, is_active, register_config_json, notes)
    OUTPUT INSERTED.id
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.machine_id,
    payload.machine_key,
    payload.machine_name,
    payload.machine_type,
    payload.plant_code,
    payload.ip_address,
    payload.port,
    payload.protocol,
    payload.register_profile_key,
    payload.sequence_no,
    payload.is_active,
    payload.register_config_json,
    payload.notes,
  ]);
  if (payload.machine_id) {
    await db.run(`
      UPDATE dbo.iot_machines
      SET ip_address = ?, port = ?, protocol = ?
      WHERE id = ?
    `, [payload.ip_address, String(payload.port), payload.protocol, payload.machine_id]);
  }
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
        pc.register_profile_key,
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
    const { templates, byType } = await getTemplatesByType();
    res.json({
      success: true,
      data: rows.map(normalizeMachine),
      default_registers: byType.ube?.[0]?.register_config || registersForType("ube"),
      default_registers_by_type: {
        ube: byType.ube?.[0]?.register_config || registersForType("ube"),
        leaktest: byType.leaktest?.[0]?.register_config || registersForType("leaktest"),
      },
      register_templates: templates,
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

async function listTemplates(_req, res) {
  try {
    await ensureSchema();
    const { templates } = await getTemplatesByType();
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function saveTemplate(req, res) {
  try {
    await ensureSchema();
    const input = req.body || {};
    const name = cleanText(input.template_name || input.name);
    if (!name) return res.status(400).json({ success: false, message: "Template name is required" });
    const key = templateKey(input.template_key || name);
    if (!key) return res.status(400).json({ success: false, message: "Template key is required" });
    const type = machineType(input.machine_type);
    const registers = normalizeRegisters(input.register_config);
    if (!registers?.length) return res.status(400).json({ success: false, message: "At least one valid register is required" });

    const existing = await db.query(
      "SELECT TOP 1 id FROM dbo.plc_register_templates WHERE template_key = ?",
      [key]
    );
    if (existing.rows.length) {
      await db.run(`
        UPDATE dbo.plc_register_templates
        SET template_name = ?, machine_type = ?, register_config_json = ?, notes = ?,
            is_active = 1, updated_at = SYSUTCDATETIME()
        WHERE template_key = ?
      `, [name, type, JSON.stringify(registers), cleanText(input.notes), key]);
      return res.json({ success: true, id: existing.rows[0].id, template_key: key });
    }

    const result = await db.run(`
      INSERT INTO dbo.plc_register_templates
        (template_key, template_name, machine_type, register_config_json, notes, is_active, is_system)
      OUTPUT INSERTED.id
      VALUES (?, ?, ?, ?, ?, 1, 0)
    `, [key, name, type, JSON.stringify(registers), cleanText(input.notes)]);
    res.status(201).json({ success: true, id: result.rows[0]?.id, template_key: key });
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
  listTemplates,
  saveMachine,
  saveTemplate,
  deleteMachine,
  testConnection,
};
