"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildMachineReadingValueRows,
  buildMachineReadingValueInserts,
} = require("../src/modules/plcMonitor/services/plcMonitorService");

const machine = {
  registerConfig: [{ name: "cycle_time", label: "Cycle Time", type: "decimal", unit: "sec" }],
};

test("builds one row per reading with the same values as the old per-value INSERT", () => {
  const rows = buildMachineReadingValueRows(machine, 42, {
    cycle_time: 70.7,
    part_name: "OPK12-S17",
    shot_status: 1,
    empty_text: "",
    missing: null,
    flag: true,
    skipped: undefined,
  });
  assert.deepEqual(rows, [
    [42, "cycle_time", "Cycle Time", "decimal", "sec", 70.7, "70.7", null, "70.7"],
    [42, "part_name", "part_name", null, "", null, "OPK12-S17", null, "OPK12-S17"],
    [42, "shot_status", "shot_status", null, "", 1, "1", null, "1"],
    [42, "empty_text", "empty_text", null, "", null, "", null, ""],
    [42, "missing", "missing", null, "", 0, null, null, null],
    [42, "flag", "flag", null, "", 1, "true", 1, "true"],
  ]);
});

test("one INSERT carries every row, with matching placeholders and parameters", () => {
  const rows = Array.from({ length: 150 }, (_, index) => [1, `p${index}`, `P${index}`, null, "", index, String(index), null, String(index)]);
  const statements = buildMachineReadingValueInserts(rows);
  assert.equal(statements.length, 1);
  assert.equal((statements[0].sql.match(/\?/g) || []).length, statements[0].params.length);
  assert.equal(statements[0].params.length, 150 * 9);
  assert.deepEqual(statements[0].params.slice(9, 18), rows[1]);
});

test("large readings are split below the SQL Server 2100-parameter limit", () => {
  const rows = Array.from({ length: 450 }, () => [1, "k", "k", null, "", 1, "1", null, "1"]);
  const statements = buildMachineReadingValueInserts(rows);
  assert.equal(statements.length, 3);
  for (const statement of statements) {
    assert.ok(statement.params.length <= 2100);
    assert.equal((statement.sql.match(/\?/g) || []).length, statement.params.length);
  }
  assert.equal(statements.reduce((sum, statement) => sum + statement.params.length, 0), 450 * 9);
});

test("no readings means no INSERT", () => {
  assert.deepEqual(buildMachineReadingValueInserts([]), []);
});
