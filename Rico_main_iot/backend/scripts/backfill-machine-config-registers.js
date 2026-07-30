"use strict";

process.env.DB_CONNECT_TIMEOUT = process.env.DB_SCHEMA_CONNECT_TIMEOUT || process.env.DB_CONNECT_TIMEOUT || "30000";
process.env.DB_POOL_ACQUIRE_TIMEOUT = process.env.DB_SCHEMA_POOL_ACQUIRE_TIMEOUT || process.env.DB_POOL_ACQUIRE_TIMEOUT || "120000";
process.env.DB_QUERY_TIMEOUT = process.env.DB_SCHEMA_QUERY_TIMEOUT || process.env.DB_QUERY_TIMEOUT || "300000";

const db = require("../src/config/db");

const REPLACE_EXISTING = process.argv.includes("--replace");

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

function parseRegisters(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeRegisters(input) {
  return parseRegisters(input)
    .map((item, index) => {
      const type = normalizeRegisterType(item.type);
      const device = normalizeRegisterAddress(item.device);
      const stringDevice = normalizeRegisterAddress(item.stringDevice || item.string_device);
      const textDevice = stringDevice || (type === "text" ? device : "");

      return {
        name: cleanText(item.name || item.parameter || item.label),
        display_label: cleanText(item.display_label || item.displayLabel || item.label || item.name),
        device: type === "text" ? "" : device,
        stringDevice: textDevice,
        stringLength: cleanInt(item.stringLength ?? item.string_length),
        type,
        scale: cleanNumber(item.scale, 1),
        computed: cleanText(item.computed || item.computed_key) || "",
        group_name: cleanText(item.group_name || item.groupName || item.group || item.category || item.section || item.tab),
        sort_order: cleanInt(item.sort_order ?? item.sortOrder, index + 1),
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

async function insertRegister(machine, register, index) {
  await db.run(`
    INSERT INTO dbo.plc_machine_config_registers
      (machine_config_id, machine_id, machine_key, machine_name, machine_type, ip_address,
       parameter_name, display_label, device, string_device, string_length, data_type,
       scale_factor, unit, group_name, sort_order, computed_key,
       min_value, max_value, warning_min, warning_max, alarm_enabled,
       show_on_monitor, show_to_operator, log_history, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    machine.id,
    machine.machine_id,
    machine.machine_key,
    machine.machine_name,
    machine.machine_type,
    machine.ip_address,
    register.name,
    register.display_label || register.name,
    register.device || "",
    register.stringDevice || "",
    register.stringLength,
    register.type || "int",
    register.scale === "" || register.scale === null || register.scale === undefined ? 1 : Number(register.scale),
    register.unit || "",
    register.group_name || "",
    cleanInt(register.sort_order, index + 1),
    register.computed || "",
    register.min,
    register.max,
    register.warning_min,
    register.warning_max,
    Number(Boolean(register.alarm_enabled)),
    Number(Boolean(register.show_on_monitor)),
    Number(Boolean(register.show_to_operator)),
    Number(Boolean(register.log_history)),
    Number(Boolean(register.enabled)),
  ]);
}

async function backfillMachine(machine) {
  const registers = normalizeRegisters(machine.register_config_json);
  const countResult = await db.query(
    "SELECT COUNT(1) AS total FROM dbo.plc_machine_config_registers WHERE machine_config_id = ?",
    [machine.id]
  );
  const existingCount = Number(countResult.rows[0]?.total || 0);

  if (!registers.length) {
    return { machine, status: "empty-json", inserted: 0, existing: existingCount };
  }

  if (existingCount > 0 && !REPLACE_EXISTING) {
    return { machine, status: "skipped-existing", inserted: 0, existing: existingCount };
  }

  if (existingCount > 0 && REPLACE_EXISTING) {
    await db.run("DELETE FROM dbo.plc_machine_config_registers WHERE machine_config_id = ?", [machine.id]);
  }

  for (const [index, register] of registers.entries()) {
    await insertRegister(machine, register, index);
  }

  return {
    machine,
    status: existingCount > 0 ? "replaced" : "inserted",
    inserted: registers.length,
    existing: existingCount,
  };
}

async function main() {
  await db.initializeSchema();
  if (!(await tableExists("dbo.plc_machine_configs"))) {
    throw new Error("dbo.plc_machine_configs table not found");
  }
  if (!(await tableExists("dbo.plc_machine_config_registers"))) {
    throw new Error("dbo.plc_machine_config_registers table not found");
  }

  const { rows: machines } = await db.query(`
    SELECT id, machine_id, machine_key, machine_name, machine_type, ip_address, register_config_json
    FROM dbo.plc_machine_configs
    WHERE register_config_json IS NOT NULL
    ORDER BY id
  `);

  const results = [];
  for (const machine of machines) {
    results.push(await backfillMachine(machine));
  }

  const summary = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    acc.insertedRows += result.inserted;
    return acc;
  }, { insertedRows: 0 });

  console.log(`Machine config register backfill complete. Replace existing: ${REPLACE_EXISTING ? "yes" : "no"}`);
  console.log(`Machines checked: ${results.length}`);
  console.log(`Rows inserted: ${summary.insertedRows}`);
  console.log(`Inserted machines: ${summary.inserted || 0}`);
  console.log(`Replaced machines: ${summary.replaced || 0}`);
  console.log(`Skipped existing machines: ${summary["skipped-existing"] || 0}`);
  console.log(`Empty JSON machines: ${summary["empty-json"] || 0}`);

  for (const result of results) {
    console.log([
      result.status,
      result.machine.id,
      result.machine.machine_name,
      result.machine.ip_address,
      `inserted=${result.inserted}`,
      `existing=${result.existing}`,
    ].join(" | "));
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.pool.close();
    } catch {
      // Ignore close failures during failed startup.
    }
  });
