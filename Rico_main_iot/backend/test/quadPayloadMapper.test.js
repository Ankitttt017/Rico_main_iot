"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sample = require("./fixtures/quad_sample_shot.json");
const {
  QuadMessageError,
  parseQuadTelemetry,
  parseQuadStatus,
  getQuadRawValue,
  toUnsignedWord,
} = require("../src/modules/plcMonitor/services/quadPayloadMapper");

test("parses the identity and raw register values of a QUAD shot", () => {
  const telemetry = parseQuadTelemetry(Buffer.from(JSON.stringify(sample)));
  assert.equal(telemetry.eventUuid, sample.event_uuid);
  assert.equal(telemetry.machineId, "UBE-850T-02");
  assert.equal(telemetry.acquiredAt.toISOString(), "2026-10-23T07:22:51.634Z");
  assert.equal(telemetry.partName, "OPK12-S17");
  assert.equal(telemetry.rawByDevice.get("D1120"), 4474);
  assert.equal(telemetry.rawByDevice.get("D1127"), 707); // raw, not scaled
  assert.equal(telemetry.rawByDevice.get("D1301"), 1);
  assert.equal(telemetry.rawByDevice.get("M4598"), 1);
  assert.equal(telemetry.textByDevice.get("D100"), "OPK12-S17");
  assert.equal(telemetry.rawByDevice.has("CALC"), false);
});

test("BAD points become null and CALC tags are ignored", () => {
  const message = structuredClone(sample);
  message.payload.CYCLE_TIME = { ...message.payload.CYCLE_TIME, quality: "BAD", value: null, raw_value: null };
  const telemetry = parseQuadTelemetry(message);
  assert.equal(telemetry.rawByDevice.get("D1127"), null);
  assert.equal(getQuadRawValue(telemetry, { device: "D1127" }), null);
});

test("negative int16 words are read as the unsigned PLC value", () => {
  assert.equal(toUnsignedWord(-1), 65535);
  assert.equal(toUnsignedWord(-25536), 40000);
  assert.equal(toUnsignedWord(4474), 4474);
  const message = structuredClone(sample);
  message.payload.SHOT_NO = { ...message.payload.SHOT_NO, value: -25536, raw_value: -25536 };
  assert.equal(parseQuadTelemetry(message).rawByDevice.get("D1120"), 40000);
});

test("string registers are matched on their start device", () => {
  const telemetry = parseQuadTelemetry(sample);
  assert.equal(getQuadRawValue(telemetry, { stringDevice: "D100-D110" }), "OPK12-S17");
  assert.equal(getQuadRawValue(telemetry, { device: "D9999" }), null);
});

test("rejects messages that cannot be acknowledged or mapped", () => {
  assert.throws(() => parseQuadTelemetry("{not json"), QuadMessageError);
  assert.throws(() => parseQuadTelemetry({ machine_id: "X", payload: {} }), QuadMessageError);
  assert.throws(() => parseQuadTelemetry({ event_uuid: "u1", payload: {} }), QuadMessageError);
  assert.throws(() => parseQuadTelemetry({ event_uuid: "u1", machine_id: "X" }), QuadMessageError);
});

test("parses gateway status messages", () => {
  assert.deepEqual(parseQuadStatus('{"status":"online","gateway_id":"QUAD-01"}'), { online: true, gatewayId: "QUAD-01" });
  assert.deepEqual(parseQuadStatus(Buffer.from('{"status":"OFFLINE"}')), { online: false, gatewayId: null });
  assert.equal(parseQuadStatus('{"status":"rebooting"}'), null);
});
