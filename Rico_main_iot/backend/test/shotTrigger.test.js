"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createShotFallbackTimer } = require("../src/modules/plcMonitor/services/plcMonitorService");
const { ubeShotTriggerWarnings } = require("../src/modules/plcMachineConfigs/plcMachineConfig.controller");

test("fallback waits the default time before anything is known", () => {
  assert.equal(createShotFallbackTimer({ defaultMs: 58000 }).timeoutMs(), 58000);
});

test("fallback follows the machine's last PLC cycle time before any gap is learned", () => {
  const ube850 = createShotFallbackTimer();
  ube850.recordCycleTime(68);
  assert.equal(ube850.timeoutMs(), 57800); // the old fixed 58 s

  const longCycle = createShotFallbackTimer();
  longCycle.recordCycleTime(120);
  assert.equal(longCycle.timeoutMs(), 102000); // a 120 s machine is not read at 58 s, mid-cycle
});

test("fallback learns the injection-to-cycle-end gap from the machine's own shots", () => {
  const ube1250 = createShotFallbackTimer();
  ube1250.recordCycleTime(79);
  ube1250.recordCycleEndGap(61000);
  ube1250.recordCycleEndGap(62500);
  assert.equal(ube1250.timeoutMs(), 67500); // longest gap + 5 s margin, under one cycle (75 s)
});

test("fallback stays under one cycle so the next injection does not overwrite the shot", () => {
  const timer = createShotFallbackTimer();
  timer.recordCycleTime(60);
  timer.recordCycleEndGap(55000);
  assert.equal(timer.timeoutMs(), 57000); // 95% of 60 s, not 55 + 5 = 60 s
});

test("bad timing values are ignored", () => {
  const timer = createShotFallbackTimer({ defaultMs: 58000 });
  timer.recordCycleTime(null);
  timer.recordCycleTime("");
  timer.recordCycleTime(0);
  timer.recordCycleEndGap(NaN);
  timer.recordCycleEndGap(1200);
  assert.equal(timer.timeoutMs(), 58000);
});

test("saving a UBE machine without SHOT NO. or Cycle End returns warnings", () => {
  const warnings = ubeShotTriggerWarnings({
    machine_type: "ube",
    register_config: [{ name: "CYCLE TIME sec.", device: "D1556" }],
  });
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /SHOT NO\./);
  assert.match(warnings[1], /Cycle End/);
});

test("a UBE machine with its own SHOT NO. and Cycle End saves without warnings", () => {
  assert.deepEqual(ubeShotTriggerWarnings({
    machine_type: "ube",
    register_config: [
      { name: "SHOT NO.", device: "D1536" },
      { name: "Cycle End", device: "M841" },
    ],
  }), []);
});

test("non-UBE machines and status-only saves get no shot warnings", () => {
  assert.deepEqual(ubeShotTriggerWarnings({ machine_type: "leaktest", register_config: [] }), []);
  assert.deepEqual(ubeShotTriggerWarnings({ machine_type: "ube", is_active: false }), []);
});
