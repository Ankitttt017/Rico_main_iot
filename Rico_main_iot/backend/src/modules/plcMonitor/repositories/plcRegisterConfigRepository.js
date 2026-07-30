"use strict";

const db = require("../../../config/db");

const UBE_PART_NAME_REGISTER = {
  id: "part-name-d100",
  name: "Part Name",
  device: "",
  stringDevice: "D100-D110",
  stringLength: 11,
  type: "text",
  scale: 1,
  enabled: true,
  unit: "",
  group: "Production",
  show_on_monitor: true,
  log_history: true,
};

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

function normalizeMachineConfigRegister(row = {}, index = 0) {
  return normalizeRegister({
    id: row.id ? `machine-config-register-${row.id}` : `machine-config-register-${index + 1}`,
    name: row.parameter_name || row.display_label,
    label: row.display_label,
    device: row.device,
    stringDevice: row.string_device,
    stringLength: row.string_length || "",
    type: row.data_type || "int",
    scale: row.scale_factor,
    unit: row.unit || "",
    group_name: row.group_name || "",
    sort_order: row.sort_order,
    computed: row.computed_key || "",
    enabled: row.is_active === undefined ? true : Boolean(row.is_active),
    min: row.min_value ?? null,
    max: row.max_value ?? null,
    warning_min: row.warning_min ?? null,
    warning_max: row.warning_max ?? null,
    show_on_monitor: row.show_on_monitor === undefined ? true : Boolean(row.show_on_monitor),
    show_to_operator: row.show_to_operator === undefined ? false : Boolean(row.show_to_operator),
    log_history: row.log_history === undefined ? true : Boolean(row.log_history),
    alarm_enabled: row.alarm_enabled === undefined ? false : Boolean(row.alarm_enabled),
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

function hasUbePartNameRegister(registers = []) {
  return registers.some((register) => {
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
  });
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

function normalizeMachineRegisterConfig(row = {}, profileRegistersByKey = new Map(), machineConfigRegisters = []) {
  const tableRegisters = Array.isArray(machineConfigRegisters)
    ? machineConfigRegisters.map((register, index) => normalizeMachineConfigRegister(register, index))
      .filter((register) => register.enabled !== false)
    : [];
  const jsonRegisters = parseRegisterConfig(row.register_config_json)
    .map((register, index) => normalizeRegister(register, index))
    .filter((register) => register.enabled !== false);
  const profileRegisters = profileKeysForMachine(row)
    .flatMap((key) => profileRegistersByKey.get(String(key).trim().toUpperCase()) || []);
  const registers = tableRegisters.length ? tableRegisters : mergeRegisters(jsonRegisters, profileRegisters);
  const finalRegisters = String(row.machine_type || "").trim().toLowerCase() === "ube" && !hasUbePartNameRegister(registers)
    ? [normalizeRegister(UBE_PART_NAME_REGISTER), ...registers]
    : registers;

  return {
    id: row.id || null,
    machineId: row.machine_id || null,
    machineKey: row.machine_key || null,
    machineName: row.machine_name || null,
    machineType: row.machine_type || "generic",
    ipAddress: row.ip_address || null,
    port: row.port || null,
    protocol: row.protocol || "SLMP",
    registers: finalRegisters,
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

async function plcMachineConfigRegistersTableExists() {
  const { rows } = await db.query(`
    SELECT CASE WHEN OBJECT_ID('dbo.plc_machine_config_registers', 'U') IS NULL THEN 0 ELSE 1 END AS table_exists
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

async function loadMachineConfigRegistersByConfigIds(machineConfigIds = []) {
  const ids = [...new Set(machineConfigIds.map((id) => Number.parseInt(id, 10)).filter(Number.isFinite))];
  const grouped = new Map();
  if (!ids.length || !(await plcMachineConfigRegistersTableExists())) return grouped;

  const placeholders = ids.map(() => "?").join(", ");
  const { rows } = await db.query(`
    SELECT id, machine_config_id, parameter_name, display_label, device,
           string_device, string_length, data_type, scale_factor, unit,
           group_name, sort_order, computed_key, min_value, max_value,
           warning_min, warning_max, alarm_enabled, show_on_monitor,
           show_to_operator, log_history, is_active
    FROM dbo.plc_machine_config_registers WITH (NOLOCK)
    WHERE machine_config_id IN (${placeholders})
      AND is_active = 1
    ORDER BY machine_config_id, sort_order, id;
  `, ids);

  for (const row of rows) {
    const machineConfigId = Number.parseInt(row.machine_config_id, 10);
    if (!Number.isFinite(machineConfigId)) continue;
    const list = grouped.get(machineConfigId) || [];
    list.push(row);
    grouped.set(machineConfigId, list);
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

  const machineRegistersByConfigId = await loadMachineConfigRegistersByConfigIds(rows.map((row) => row.id));
  return rows.map((row) => normalizeMachineRegisterConfig(
    row,
    profileRegistersByKey,
    machineRegistersByConfigId.get(Number.parseInt(row.id, 10)) || []
  ));
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

  if (!rows[0]) return null;
  const machineRegistersByConfigId = await loadMachineConfigRegistersByConfigIds([rows[0].id]);
  return normalizeMachineRegisterConfig(
    rows[0],
    profileRegistersByKey,
    machineRegistersByConfigId.get(Number.parseInt(rows[0].id, 10)) || []
  );
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

  if (!rows[0]) return null;
  const machineRegistersByConfigId = await loadMachineConfigRegistersByConfigIds([rows[0].id]);
  return normalizeMachineRegisterConfig(
    rows[0],
    profileRegistersByKey,
    machineRegistersByConfigId.get(Number.parseInt(rows[0].id, 10)) || []
  );
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
