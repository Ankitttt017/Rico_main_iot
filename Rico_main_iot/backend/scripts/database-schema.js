"use strict";

const db = require("../src/config/db");

const REQUIRED_COLUMNS = {
  iot_plants: ["id", "code", "name", "location", "is_active", "created_at", "updated_at"],
  iot_departments: ["id", "code", "name", "plant_code", "description", "is_active"],
  line_master: ["line_id", "line_code", "line_name", "plant", "plant_code", "division", "is_active"],
  iot_parts: ["id", "material_code", "description", "plant_code", "cycle_time_sec", "box_quantity", "status"],
  iot_part_plants: ["id", "part_code", "plant_code", "storage_location", "unit_of_measure"],
  iot_operations: ["id", "part_code", "sr_no", "name", "type", "label", "rework"],
  iot_machines: ["id", "machine_code", "name", "plant_code", "line_id", "ip_address", "port", "protocol", "is_active"],
  iot_machine_status: ["id", "machine_id", "status", "part_code", "operation_no", "updated_at"],
  iot_machine_operations: ["id", "machine_id", "part_code", "operation_id", "operation_no", "is_primary", "is_active"],
  iot_process_flow_diagrams: ["id", "part_code", "file_name", "file_path"],
  iot_inspection_sheets: ["id", "part_code", "file_name", "file_path"],
  iot_control_plan_charts: ["id", "part_code", "file_name", "file_path"],
  app_users: ["id", "username", "role", "password_hash", "permissions_json", "is_active"],
  audit_log: ["id", "action", "performed_by", "timestamp"],
  plc_machine_configs: ["id", "machine_key", "machine_name", "machine_type", "ip_address", "port", "protocol"],
  PlcCycleReadings: [
    "id", "recorded_at", "created_at", "machine_key", "machine_name", "plc_ip", "plc_port", "part_name",
    "shot_year", "shot_month", "shot_day", "shot_date", "shot_hour", "shot_minute", "shot_second", "shot_datetime",
    "Counter", "raw_readings_json", "shot_number", "ok_shot", "ng_counter",
    "cycle_start_time", "cycle_end_time", "minor_stoppage_machine", "cycle_time", "minor_stoppage", "cycle_end", "Cycle Start",
    "die_close_core_in_time", "pouring_time", "shot_fwd_time", "curing_time", "die_open_core_out_time",
    "ejector_time", "extract_time", "spray_time", "v1_speed", "v2_speed", "v3_speed", "v4_speed",
    "metal_pressure", "furnace_metal_temp", "cooling_water_mov", "cooling_water_sta", "accel_point", "deaccel_point",
    "intensification_time", "biscuit_thickness", "jet_cooling_pressure", "clamp_tonnage_he_low_pct",
    "clamp_tonnage_he_low_mn", "clamp_tonnage_op_up_pct", "clamp_tonnage_op_low_pct", "clamp_tonnage_he_up_pct",
    "vacuum_pressure", "clamp_force_pct", "clamp_tonnage", "shot_acc_pressure", "intensification_acc_pressure",
    "fixed_die_temp_f1", "fixed_die_temp_f2", "moving_die_temp_m1", "moving_die_temp_m2", "slide_temp_s1",
    "fix_1_flow", "fix_2_flow", "fix_3_flow", "mov_1_flow", "mov_2_flow", "mov_3_flow",
    "vacuum_pressure_mmhg", "average_die_clamp_tonnage_count", "time_for_stroke", "stroke", "shot_status",
  ],
  PlcConnectionEvents: ["id", "plc_ip", "event_type", "started_at", "ended_at"],
  Leaktest: ["Id", "PLC_IP", "Status", "Cycle_End_Time", "Result"],
  workstation_downtime_events: ["id", "machine_key", "reason", "status", "started_at"],
};

const REQUIRED_TABLES = [
  ...Object.keys(REQUIRED_COLUMNS),
  "iot_materials",
  "iot_parts_master_raw",
  "iot_machine_master_raw",
];

const REQUIRED_INDEXES = [
  "ux_iot_departments_code_plant",
  "ux_iot_part_plants_part_plant",
  "idx_iot_operations_part",
  "idx_iot_machines_plant",
  "idx_iot_machine_status_machine_updated",
  "IX_PlcCycleReadings_machine_shot_date_number",
  "IX_PlcCycleReadings_ip_shot_date_number",
  "IX_PlcConnectionEvents_started_at_desc",
  "IX_Leaktest_ip_cycle_end_desc",
];

async function verifySchema() {
  const [{ rows: databaseRows }, { rows: columnRows }, { rows: indexRows }] = await Promise.all([
    db.query("SELECT DB_NAME() AS database_name"),
    db.query(`
      SELECT t.name AS table_name, c.name AS column_name
      FROM sys.tables t
      INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
      INNER JOIN sys.columns c ON c.object_id = t.object_id
      WHERE s.name = 'dbo'
    `),
    db.query(`
      SELECT i.name AS index_name
      FROM sys.indexes i
      INNER JOIN sys.tables t ON t.object_id = i.object_id
      INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
      WHERE s.name = 'dbo' AND i.name IS NOT NULL
    `),
  ]);

  const columnsByTable = new Map();
  for (const row of columnRows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
    columnsByTable.get(row.table_name).add(row.column_name);
  }

  const missingTables = REQUIRED_TABLES.filter((table) => !columnsByTable.has(table));
  const missingColumns = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const actual = columnsByTable.get(table);
    if (!actual) continue;
    for (const column of columns) {
      if (!actual.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }

  const actualIndexes = new Set(indexRows.map((row) => row.index_name));
  const missingIndexes = REQUIRED_INDEXES.filter((index) => !actualIndexes.has(index));
  const databaseName = databaseRows[0]?.database_name || "unknown";

  if (missingTables.length || missingColumns.length || missingIndexes.length) {
    console.error(`Schema verification failed for database ${databaseName}.`);
    if (missingTables.length) console.error(`Missing tables: ${missingTables.join(", ")}`);
    if (missingColumns.length) console.error(`Missing columns: ${missingColumns.join(", ")}`);
    if (missingIndexes.length) console.error(`Missing indexes: ${missingIndexes.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Schema verification passed for database ${databaseName}.`);
  console.log(`Verified ${REQUIRED_TABLES.length} tables and ${REQUIRED_INDEXES.length} indexes.`);
}

async function main() {
  if (process.argv.includes("--init")) {
    console.log("Applying database schema...");
    await db.initializeSchema();
    console.log("Database schema applied.");
  }
  await verifySchema();
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
      // The pool may not have opened when configuration failed.
    }
  });
