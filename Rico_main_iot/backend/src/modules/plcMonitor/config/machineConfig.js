"use strict";

const {
  loadActiveMachineRegisterConfigs,
  plcMachineConfigTableExists,
} = require("../repositories/plcRegisterConfigRepository");

const DEFAULT_MACHINES = [];
const CONFIG_CACHE_MS = Number(process.env.PLC_MACHINE_CONFIG_CACHE_MS || 60000);
let cachedMachines = null;
let cachedAt = 0;

function normalizeMachineKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeConfiguredMachine(machine = {}, index = 0) {
  const ip = String(machine.ip || machine.ip_address || "").trim();
  const rawKind = String(machine.kind || machine.machine_type || "generic")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "generic";
  const registerConfig = Array.isArray(machine.register_config) ? machine.register_config : null;
  const kind = rawKind || "generic";
  const defaultPrefix = kind === "generic" ? "PLC Machine" : kind.toUpperCase();
  const name = String(machine.name || machine.machine_name || ip || `${defaultPrefix}-${index + 1}`).trim();
  const key = normalizeMachineKey(machine.key || machine.machine_key || machine.machine_code || name || ip);

  return {
    id: machine.id || machine.plc_config_id || null,
    machineId: machine.machineId || machine.machine_id || null,
    key: key || `machine-${index + 1}`,
    ip,
    port: Number(machine.port || machine.plc_port || 5002),
    protocol: String(machine.protocol || machine.plc_protocol || "SLMP").trim().toUpperCase(),
    name,
    kind,
    registerConfig,
  };
}

function getMachines() {
  return DEFAULT_MACHINES;
}

async function getConfiguredMachines(forceRefresh = false) {
  if (!forceRefresh && cachedMachines && Date.now() - cachedAt < CONFIG_CACHE_MS) return cachedMachines;

  try {
    if (!(await plcMachineConfigTableExists())) return [];

    const rows = await loadActiveMachineRegisterConfigs();
    const machines = rows
      .map((row, index) => normalizeConfiguredMachine({
        key: row.machineKey,
        id: row.id,
        machine_id: row.machineId,
        name: row.machineName,
        machine_type: row.machineType,
        ip: row.ipAddress,
        port: row.port,
        protocol: row.protocol,
        register_config: row.registers,
      }, index))
      .filter((machine) => machine.ip);

    cachedMachines = machines.length ? machines : [];
    cachedAt = Date.now();
    return cachedMachines;
  } catch (error) {
    console.error("Unable to load configured PLC machines:", error.message);
  }

  return cachedMachines || [];
}

module.exports = {
  DEFAULT_MACHINES,
  normalizeConfiguredMachine,
  getMachines,
  getConfiguredMachines,
};
