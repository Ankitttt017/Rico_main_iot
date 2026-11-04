"use strict";

// QUAD shot -> PlcCycleReadings readings, compared with what the direct PLC reader stored
// for the same shot (UBE 850T-02, shot 4474, 23 Oct 2026, PlcCycleReadings id 54117).

const test = require("node:test");
const assert = require("node:assert/strict");
const sample = require("./fixtures/quad_sample_shot.json");
const registerConfig = require("./fixtures/ube_850t_02_register_config.json");
const { parseQuadTelemetry } = require("../src/modules/plcMonitor/services/quadPayloadMapper");
const { buildUbeReadingsFromQuad } = require("../src/modules/plcMonitor/services/plcMonitorService");

const machine = {
  key: "192.168.117.201",
  ip: "192.168.117.201",
  port: 5002,
  name: "UBE 850T-2",
  kind: "ube",
  registerConfig,
};

const DIRECT_ROW_SHOT_4474 = {
  part_name: "OPK12-S17",
  shot_number: 4474,
  shot_status: 1,
  cycle_time: 70.7,
  die_close_core_in_time: 4.4,
  pouring_time: 4.5,
  shot_fwd_time: 2.1,
  curing_time: 13.7,
  die_open_core_out_time: 4.2,
  ejector_time: 4.1,
  extract_time: 10.9,
  spray_time: 26.4,
  v1_speed: 0.28,
  v2_speed: 0.31,
  v3_speed: 3.34,
  v4_speed: 3.48,
  accel_point: 268,
  deaccel_point: 713,
  intensification_time: 72,
  biscuit_thickness: 24,
  metal_pressure: 67,
  clamp_tonnage_he_low_pct: 104,
  clamp_tonnage_op_up_pct: 94,
  clamp_tonnage_op_low_pct: 102,
  clamp_tonnage_he_up_pct: 107,
  clamp_force_pct: 104,
  clamp_tonnage: 884,
  shot_acc_pressure: 14.05,
  intensification_acc_pressure: 13.27,
  jet_cooling_pressure: 0,
  vacuum_pressure: 0,
  cooling_water_mov: 23.1,
  cooling_water_sta: 27.1,
  furnace_metal_temp: 651,
  fixed_die_temp_f1: 0,
  fix_1_flow: 0,
  vacuum_pressure_mmhg: 0,
  average_die_clamp_tonnage_count: 296,
  time_for_stroke: 22,
  stroke: 750,
  die_close_core_in_time_upper_limit: 999.9,
  die_close_core_in_time_lower_limit: 0,
  v1_speed_upper_limit: 0.35,
  v1_speed_lower_limit: 0.25,
  v4_speed_upper_limit: 3.8,
  v4_speed_lower_limit: 3.2,
  metal_pressure_upper_limit: 75,
  metal_pressure_lower_limit: 63,
  cooling_water_sta_upper_limit: 999.9,
  biscuit_thickness_upper_limit: 30,
  biscuit_thickness_lower_limit: 17,
  clamp_tonnage_he_low_pct_upper_limit: 106,
  clamp_tonnage_he_low_pct_lower_limit: 94,
  vacuum_pressure_upper_limit: 999,
  shot_date: "2026-10-23",
  production_date: "2026-10-23",
  shot_datetime: "2026-10-23 12:52:51",
  shot_year: "26",
  shot_month: "10",
  shot_day: "23",
  shot_hour: "12",
  shot_minute: "52",
  shot_second: "51",
  "Shot Time": "12:52:51",
};

test("QUAD shot produces the same values the direct PLC reader stored", () => {
  const { readings, partName, shotDateTime } = buildUbeReadingsFromQuad(machine, parseQuadTelemetry(sample));
  assert.equal(partName, "OPK12-S17");
  assert.equal(shotDateTime, "2026-10-23 12:52:51");
  for (const [column, expected] of Object.entries(DIRECT_ROW_SHOT_4474)) {
    assert.deepEqual(readings[column], expected, column);
  }
  assert.equal(readings.cycle_end_time, "2026-10-23T07:22:51.000Z");
  assert.equal(readings.cycle_start_time, "2026-10-23T07:22:51.000Z");
  assert.equal(readings.metal_injection_datetime, "2026-10-23 12:52:51");
});

test("registers QUAD does not read stay empty (no invented values)", () => {
  const { readings } = buildUbeReadingsFromQuad(machine, parseQuadTelemetry(sample));
  assert.equal(readings.ok_shot, null); // D947 is not in the QUAD payload
  assert.equal(readings.ng_counter, null); // D955 is not in the QUAD payload
  assert.equal(readings.plant_temperature, undefined);
});

test("old backlog shots (value == raw_value) are scaled from raw_value", () => {
  const message = structuredClone(sample);
  message.payload.CYCLE_TIME.value = 707; // QUAD before 21 Oct 2026 sent unscaled values
  const { readings } = buildUbeReadingsFromQuad(machine, parseQuadTelemetry(message));
  assert.equal(readings.cycle_time, 70.7);
});

test("shots before 06:00 belong to the previous production day", () => {
  const message = structuredClone(sample);
  message.acquired_at = "2026-10-23T23:00:05+00:00"; // 04:30:05 IST on 24 Oct
  message.shot.shot_time = "2026-10-24 04:30:05";
  const { readings } = buildUbeReadingsFromQuad(machine, parseQuadTelemetry(message));
  assert.equal(readings.shot_datetime, "2026-10-24 04:30:05");
  assert.equal(readings.shot_date, "2026-10-23");
});

test("falls back to the PLC shot time when acquired_at is missing", () => {
  const message = structuredClone(sample);
  delete message.acquired_at;
  const { readings } = buildUbeReadingsFromQuad(machine, parseQuadTelemetry(message));
  assert.equal(readings.shot_datetime, "2026-10-23 12:52:51");
  assert.equal(readings.cycle_end_time, "2026-10-23T07:22:51.000Z");
});

// UBE 850T-02 shot 4549, 4 Nov 2026: the PLC/HMI time is 12:05:30, QUAD read it 60 s later.
test("shot time is the PLC/HMI shot time, not the time QUAD read the shot", () => {
  const message = structuredClone(sample);
  message.shot.shot_time = "2026-11-04 12:05:30";
  message.acquired_at = "2026-11-04T06:36:30.140708+00:00"; // 12:06:30 IST
  const { readings, shotDateTime } = buildUbeReadingsFromQuad(machine, parseQuadTelemetry(message));
  assert.equal(shotDateTime, "2026-11-04 12:05:30");
  assert.equal(readings.shot_time, "12:05:30");
  assert.equal(readings.cycle_end_time, "2026-11-04T06:35:30.000Z");
});

test("the PLC time is used even when it is far from acquired_at", () => {
  const message = structuredClone(sample);
  message.shot.shot_time = "2026-10-23 11:00:00"; // almost 2 h before acquired_at
  assert.equal(buildUbeReadingsFromQuad(machine, parseQuadTelemetry(message)).shotDateTime, "2026-10-23 11:00:00");
});

test("acquired_at is used only when the message has no readable PLC time", () => {
  const unreadable = structuredClone(sample);
  unreadable.shot.shot_time = "not a time";
  assert.equal(buildUbeReadingsFromQuad(machine, parseQuadTelemetry(unreadable)).shotDateTime, "2026-10-23 12:52:51");
});

function shotFrom(rawByDevice) {
  return { acquiredAt: new Date("2026-10-28T07:00:00Z"), partName: "", rawByDevice: new Map(Object.entries(rawByDevice)), textByDevice: new Map() };
}

test("limits are read from each register's own Min/Max PLC address", () => {
  const ube1250 = {
    ...machine,
    registerConfig: [
      { name: "CYCLE TIME sec.", device: "D1556", minDevice: "D781", maxDevice: "D754", type: "decimal", op: "*", scale: 0.1, enabled: true },
      { name: "Shot Size", device: "D2151", minDevice: "D866", maxDevice: "D839", type: "decimal", op: "*", scale: 1, enabled: true },
    ],
  };
  const { readings } = buildUbeReadingsFromQuad(ube1250, shotFrom({ D1556: 779, D781: 700, D754: 900, D2151: 12, D866: 10, D839: 14, D4269: 55 }));
  assert.equal(readings.cycle_time, 77.9);
  assert.equal(readings.cycle_time_lower_limit, 70);
  assert.equal(readings.cycle_time_upper_limit, 90);
  assert.equal(readings["Shot Size_lower_limit"], 10);
  assert.equal(readings["Shot Size_upper_limit"], 14);
});

test("no limit is read for a register without Min/Max addresses", () => {
  const noLimits = { ...machine, registerConfig: registerConfig.map((item) => ({ ...item, minDevice: "", maxDevice: "" })) };
  const { readings } = buildUbeReadingsFromQuad(noLimits, shotFrom({ D4269: 55, D4319: 30 }));
  assert.equal(readings.die_close_core_in_time_upper_limit, undefined);
  assert.equal(readings.die_close_core_in_time_lower_limit, undefined);
});

test("PLC shot-time registers come from the machine's own SHOT HOUR/MINUTE/SECOND registers", () => {
  const ube1250 = {
    ...machine,
    registerConfig: [
      { name: "SHOT HOUR", device: "D2403", type: "int", scale: 1, enabled: true },
      { name: "SHOT MINUTE", device: "D2404", type: "int", scale: 1, enabled: true },
      { name: "SHOT SECOND", device: "D2405", type: "int", scale: 1, enabled: true },
    ],
  };
  // 850T addresses carry other values here; only D2403-D2405 belong to this machine.
  const { readings } = buildUbeReadingsFromQuad(ube1250, shotFrom({ D2403: 12, D2404: 29, D2405: 58, D2103: 1, D2104: 2, D2105: 3 }));
  assert.equal(readings.metal_injection_datetime, "2026-10-28 12:29:58");
});
