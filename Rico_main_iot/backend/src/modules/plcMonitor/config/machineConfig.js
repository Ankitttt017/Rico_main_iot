"use strict";

const db = require("../../../config/db");

const DEFAULT_MACHINES = [];
const CONFIG_CACHE_MS = Number(process.env.PLC_MACHINE_CONFIG_CACHE_MS || 60000);
let cachedMachines = null;
let cachedAt = 0;

function normalizeConfiguredMachine(machine = {}, index = 0) {
  const ip = String(machine.ip || machine.ip_address || "").trim();
  const rawKind = String(machine.kind || machine.machine_type || "generic")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "generic";
  const registerConfig = Array.isArray(machine.register_config) ? machine.register_config : null;
  const machineText = [
    machine.name,
    machine.machine_name,
    machine.machine_key,
    machine.machine_code,
  ].join(" ").toLowerCase();
  const registerText = (registerConfig || [])
    .map((item) => String(item?.name || item?.parameter || "").toLowerCase())
    .join(" ");
  const kind = rawKind !== "generic" && rawKind !== "ube"
    ? rawKind
    : machineText.includes("gauge") || registerText.includes("part scan") || registerText.includes("gauge status")
      ? "gauge"
      : machineText.includes("leak")
        ? "leaktest"
        : rawKind;
  const defaultPrefix = kind === "generic" ? "PLC Machine" : kind.toUpperCase();
  const name = String(machine.name || machine.machine_name || ip || `${defaultPrefix}-${index + 1}`).trim();
  const key = String(machine.key || machine.machine_key || machine.machine_code || name || ip)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    id: machine.id || machine.plc_config_id || null,
    machineId: machine.machineId || machine.machine_id || null,
    key: key || `machine-${index + 1}`,
    ip,
    port: Number(machine.port || machine.plc_port || 5002),
    name,
    kind,
    registerConfig,
  };
}

function getMachines() {
  if (process.env.PLC_MACHINES_JSON) {
    try {
      const parsed = JSON.parse(process.env.PLC_MACHINES_JSON);
      if (Array.isArray(parsed) && parsed.length) {
        const machines = parsed
          .map((machine, index) => normalizeConfiguredMachine(machine, index))
          .filter((machine) => machine.ip);

        if (machines.length) return machines;
      }
    } catch (error) {
      console.error("Invalid PLC_MACHINES_JSON:", error.message);
    }
  }
  return DEFAULT_MACHINES;
}

async function getConfiguredMachines(forceRefresh = false) {
  if (process.env.PLC_MACHINES_JSON) return getMachines();
  if (!forceRefresh && cachedMachines && Date.now() - cachedAt < CONFIG_CACHE_MS) return cachedMachines;

  try {
    const existsResult = await db.query(`
      SELECT CASE WHEN OBJECT_ID('dbo.plc_machine_configs', 'U') IS NULL THEN 0 ELSE 1 END AS table_exists
    `);
    const tableExists = Number(existsResult.rows[0]?.table_exists || 0) === 1;
    if (!tableExists) return getMachines();

    const { rows } = await db.query(`
      SELECT pc.id, pc.machine_id, pc.machine_key, pc.machine_name, pc.machine_type,
             pc.ip_address, pc.port, pc.register_config_json
      FROM dbo.plc_machine_configs pc WITH (NOLOCK)
      LEFT JOIN dbo.iot_machines m WITH (NOLOCK) ON m.id = pc.machine_id
      WHERE pc.is_active = 1
        AND (pc.machine_id IS NULL OR m.is_active = 1)
        AND NULLIF(LTRIM(RTRIM(pc.ip_address)), '') IS NOT NULL
      ORDER BY pc.sequence_no, pc.machine_name;
    `);

    const machines = rows
      .map((row, index) => normalizeConfiguredMachine({
        key: row.machine_key,
        id: row.id,
        machine_id: row.machine_id,
        name: row.machine_name,
        machine_type: row.machine_type,
        ip: row.ip_address,
        port: row.port,
        register_config: (() => {
          try {
            return row.register_config_json ? JSON.parse(row.register_config_json) : null;
          } catch {
            return null;
          }
        })(),
      }, index))
      .filter((machine) => machine.ip);

    cachedMachines = machines.length ? machines : [];
    cachedAt = Date.now();
    return cachedMachines;
  } catch (error) {
    console.error("Unable to load configured PLC machines:", error.message);
  }

  return cachedMachines || getMachines();
}

module.exports = {
  DEFAULT_MACHINES,
  normalizeConfiguredMachine,
  getMachines,
  getConfiguredMachines,
};
