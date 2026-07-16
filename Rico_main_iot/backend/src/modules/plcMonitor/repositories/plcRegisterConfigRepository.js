"use strict";

const db = require("../../../config/db");

function parseRegisterConfig(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeRegister(register = {}, index = 0) {
  const name = String(register.name || register.parameter || register.label || "").trim();
  const device = String(register.device || "").trim().toUpperCase();
  const stringDevice = String(register.stringDevice || register.string_device || "").trim().toUpperCase();
  const stringLength = register.stringLength ?? register.string_length ?? "";

  return {
    ...register,
    id: String(register.id || name || device || stringDevice || `register-${index + 1}`).trim(),
    name,
    device,
    stringDevice,
    stringLength,
    type: String(register.type || register.readMethod || register.read_method || "int").trim().toLowerCase(),
    scale: register.scale === "" || register.scale === null || register.scale === undefined
      ? 1
      : Number(register.scale),
    enabled: register.enabled === undefined ? true : Boolean(register.enabled),
  };
}

function normalizePlcRegister(row = {}, index = 0) {
  const profileKey = String(row.profile_key || "").trim().toUpperCase();
  const parameterName = String(row.parameter_name || row.display_label || "").trim();
  const ubeOverrides = profileKey === "UBE_850T"
    ? {
        "SHOT TIME": { device: "D2103-D2105", data_type: "text", scale_factor: 1, unit: "" },
        "CLAMP FORCE (%)": { device: "D6918", data_type: "decimal", scale_factor: 0.1, unit: "%" },
        "CLAMP TONNAGE (T)": { device: "D6920", data_type: "decimal", scale_factor: 0.01, unit: "T" },
      }
    : {};
  const override = ubeOverrides[parameterName] || {};

  return normalizeRegister({
    id: row.id ? `plc-register-${row.id}` : `profile-register-${index + 1}`,
    name: parameterName,
    label: row.display_label,
    device: override.device || row.device,
    type: override.data_type || row.data_type || row.device_type || "int",
    scale: override.scale_factor ?? row.scale_factor,
    unit: override.unit ?? row.unit ?? "",
    group_name: row.group_name || "",
    sort_order: row.sort_order,
    stringLength: row.string_length || "",
    computed: row.computed_key || "",
    enabled: row.is_active === undefined ? true : Boolean(row.is_active),
    show_on_monitor: row.show_live === undefined ? true : Boolean(row.show_live),
    log_history: row.save_db === undefined ? true : Boolean(row.save_db),
  }, index);
}

function registerDedupKey(register = {}) {
  const name = String(register.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  const device = String(register.device || register.stringDevice || "").trim().toUpperCase();
  return device ? `device:${device}` : "";
}

function mergeRegisters(primary = [], fallback = []) {
  const merged = [];
  const seen = new Set();

  for (const register of [...primary, ...fallback]) {
    const key = registerDedupKey(register);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(register);
  }

  return merged;
}

function profileKeysForMachine(row = {}) {
  const machineText = [
    row.machine_type,
    row.machine_name,
    row.machine_key,
  ].join(" ").toLowerCase();
  const keys = [];

  if (machineText.includes("ube")) keys.push("UBE_850T");
  if (row.machine_key) keys.push(String(row.machine_key).trim());
  if (row.machine_type) keys.push(String(row.machine_type).trim());

  return Array.from(new Set(keys.filter(Boolean)));
}

function normalizeMachineRegisterConfig(row = {}, profileRegistersByKey = new Map()) {
  const configuredRegisters = parseRegisterConfig(row.register_config_json)
    .map((register, index) => normalizeRegister(register, index))
    .filter((register) => register.enabled !== false);
  const profileRegisters = profileKeysForMachine(row)
    .flatMap((key) => profileRegistersByKey.get(String(key).trim().toUpperCase()) || []);
  const registers = mergeRegisters(configuredRegisters, profileRegisters);

  return {
    id: row.id || null,
    machineId: row.machine_id || null,
    machineKey: row.machine_key || null,
    machineName: row.machine_name || null,
    machineType: row.machine_type || "generic",
    ipAddress: row.ip_address || null,
    port: row.port || null,
    protocol: row.protocol || "SLMP",
    registers,
  };
}

async function plcMachineConfigTableExists() {
  const { rows } = await db.query(`
    SELECT CASE WHEN OBJECT_ID('dbo.plc_machine_configs', 'U') IS NULL THEN 0 ELSE 1 END AS table_exists
  `);
  return Number(rows[0]?.table_exists || 0) === 1;
}

async function plcRegistersTableExists() {
  const { rows } = await db.query(`
    SELECT CASE WHEN OBJECT_ID('dbo.plc_registers', 'U') IS NULL THEN 0 ELSE 1 END AS table_exists
  `);
  return Number(rows[0]?.table_exists || 0) === 1;
}

async function loadProfileRegistersByKey() {
  if (!(await plcRegistersTableExists())) return new Map();

  const { rows } = await db.query(`
    SELECT id, profile_key, parameter_name, display_label, device, device_type,
           data_type, scale_factor, unit, group_name, sort_order, string_length,
           computed_key, show_live, save_db, is_active
    FROM dbo.plc_registers WITH (NOLOCK)
    WHERE is_active = 1
    ORDER BY profile_key, sort_order, id;
  `);

  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.profile_key || "").trim().toUpperCase();
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(normalizePlcRegister(row, list.length));
    grouped.set(key, list);
  }
  return grouped;
}

async function loadActiveMachineRegisterConfigs() {
  if (!(await plcMachineConfigTableExists())) return [];
  const profileRegistersByKey = await loadProfileRegistersByKey();

  const { rows } = await db.query(`
    SELECT pc.id, pc.machine_id, pc.machine_key, pc.machine_name, pc.machine_type,
           pc.ip_address, pc.port, pc.protocol, pc.register_config_json
    FROM dbo.plc_machine_configs pc WITH (NOLOCK)
    LEFT JOIN dbo.iot_machines m WITH (NOLOCK) ON m.id = pc.machine_id
    WHERE pc.is_active = 1
      AND (pc.machine_id IS NULL OR m.is_active = 1)
      AND NULLIF(LTRIM(RTRIM(pc.ip_address)), '') IS NOT NULL
    ORDER BY pc.sequence_no, pc.machine_name;
  `);

  return rows.map((row) => normalizeMachineRegisterConfig(row, profileRegistersByKey));
}

async function loadRegisterConfigByMachineId(machineId) {
  if (!(await plcMachineConfigTableExists())) return null;
  const profileRegistersByKey = await loadProfileRegistersByKey();

  const { rows } = await db.query(`
    SELECT TOP 1 pc.id, pc.machine_id, pc.machine_key, pc.machine_name, pc.machine_type,
           pc.ip_address, pc.port, pc.protocol, pc.register_config_json
    FROM dbo.plc_machine_configs pc WITH (NOLOCK)
    LEFT JOIN dbo.iot_machines m WITH (NOLOCK) ON m.id = pc.machine_id
    WHERE pc.is_active = 1
      AND pc.machine_id = ?
      AND (pc.machine_id IS NULL OR m.is_active = 1)
    ORDER BY pc.sequence_no, pc.machine_name;
  `, [machineId]);

  return rows[0] ? normalizeMachineRegisterConfig(rows[0], profileRegistersByKey) : null;
}

async function loadRegisterConfigByMachineKey(machineKey) {
  const key = String(machineKey || "").trim();
  if (!key) return null;
  if (!(await plcMachineConfigTableExists())) return null;
  const profileRegistersByKey = await loadProfileRegistersByKey();

  const { rows } = await db.query(`
    SELECT TOP 1 pc.id, pc.machine_id, pc.machine_key, pc.machine_name, pc.machine_type,
           pc.ip_address, pc.port, pc.protocol, pc.register_config_json
    FROM dbo.plc_machine_configs pc WITH (NOLOCK)
    LEFT JOIN dbo.iot_machines m WITH (NOLOCK) ON m.id = pc.machine_id
    WHERE pc.is_active = 1
      AND (pc.machine_key = ? OR pc.ip_address = ?)
      AND (pc.machine_id IS NULL OR m.is_active = 1)
    ORDER BY pc.sequence_no, pc.machine_name;
  `, [key, key]);

  return rows[0] ? normalizeMachineRegisterConfig(rows[0], profileRegistersByKey) : null;
}

module.exports = {
  parseRegisterConfig,
  normalizeRegister,
  normalizeMachineRegisterConfig,
  plcMachineConfigTableExists,
  plcRegistersTableExists,
  loadProfileRegistersByKey,
  loadActiveMachineRegisterConfigs,
  loadRegisterConfigByMachineId,
  loadRegisterConfigByMachineKey,
};
