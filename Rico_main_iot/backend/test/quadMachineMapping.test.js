"use strict";

// Which machine a QUAD message belongs to: gateway_ip -> Machine Config QUAD IP,
// otherwise topic machine_id -> QUAD_MACHINES (QUAD-01 on UBE 850T-02 sends no gateway_ip yet).

process.env.MQTT_URL = "mqtt://127.0.0.1:1883";
process.env.QUAD_MACHINES = "192.168.117.201=UBE-850T-02";

const test = require("node:test");
const assert = require("node:assert/strict");
const sample = require("./fixtures/quad_sample_shot.json");
const {
  findQuadMachine,
  getQuadMachineId,
  isQuadMachine,
  isQuadIngestEnabled,
} = require("../src/modules/plcMonitor/config/quadConfig");
const { parseQuadTelemetry, parseQuadStatus, parseGatewayIp } = require("../src/modules/plcMonitor/services/quadPayloadMapper");
const { normalizeConfiguredMachine } = require("../src/modules/plcMonitor/config/machineConfig");

const ube1 = { key: "192.168.117.200", ip: "192.168.117.200", name: "UBE 850T-01", dataSource: "QUAD", quadIp: "192.168.117.73" };
const ube2 = { key: "192.168.117.201", ip: "192.168.117.201", name: "UBE 850T-02", dataSource: "PLC", quadIp: null };
const ube3 = { key: "192.168.117.202", ip: "192.168.117.202", name: "UBE 850T-03", dataSource: "PLC", quadIp: "192.168.117.74" };
const machines = [ube1, ube2, ube3];

test("Data Source QUAD with a QUAD IP stops direct polling for that machine", () => {
  assert.equal(isQuadMachine(ube1), true);
  assert.equal(getQuadMachineId(ube1), "192.168.117.73");
});

test("a QUAD IP alone does nothing while Data Source is PLC", () => {
  assert.equal(isQuadMachine(ube3), false);
  assert.equal(findQuadMachine(machines, { machineId: "UBE-850T-03", gatewayIp: "192.168.117.74" }), null);
});

test("Data Source QUAD without a QUAD IP keeps the direct connection", () => {
  assert.equal(isQuadMachine({ ...ube1, quadIp: "" }), false);
});

test("QUAD_MACHINES machines stay on QUAD (UBE 850T-02 / QUAD-01)", () => {
  assert.equal(isQuadMachine(ube2), true);
  assert.equal(getQuadMachineId(ube2), "UBE-850T-02");
});

test("a message with gateway_ip goes to the machine with that QUAD IP", () => {
  assert.equal(findQuadMachine(machines, { machineId: "UBE-850T-01", gatewayIp: "192.168.117.73" }), ube1);
});

test("the topic machine_id does not matter when gateway_ip is present", () => {
  assert.equal(findQuadMachine(machines, { machineId: "anything", gatewayIp: "192.168.117.73" }), ube1);
});

test("an unknown QUAD IP is never saved under the QUAD_MACHINES machine with the same machine_id", () => {
  // e.g. a new Pi whose machine.json was copied from QUAD-01
  assert.equal(findQuadMachine(machines, { machineId: "UBE-850T-02", gatewayIp: "192.168.117.99" }), null);
});

test("a message without gateway_ip is matched by topic machine_id through QUAD_MACHINES only", () => {
  assert.equal(findQuadMachine(machines, { machineId: "UBE-850T-02" }), ube2);
  assert.equal(findQuadMachine(machines, { machineId: "ube-850t-02" }), ube2);
  assert.equal(findQuadMachine(machines, { machineId: "UBE-850T-01" }), null);
});

test("gateway_ip is read from telemetry and status messages", () => {
  const message = { ...structuredClone(sample), gateway_ip: " 192.168.117.73 " };
  assert.equal(parseQuadTelemetry(message).gatewayIp, "192.168.117.73");
  assert.equal(parseQuadTelemetry(sample).gatewayIp, null);
  assert.deepEqual(
    parseQuadStatus('{"status":"offline","gateway_id":"QUAD-02","gateway_ip":"192.168.117.73"}'),
    { online: false, gatewayId: "QUAD-02", gatewayIp: "192.168.117.73" }
  );
  assert.equal(parseQuadStatus('{"status":"online","gateway_id":"QUAD-01"}').gatewayIp, null);
});

test("an invalid gateway_ip is ignored", () => {
  for (const value of ["", "abc", "192.168.117", "192.168.117.300", null, undefined]) {
    assert.equal(parseGatewayIp(value), null, String(value));
  }
});

test("Machine Config columns reach the monitor's machine object", () => {
  const machine = normalizeConfiguredMachine({ key: "192.168.117.200", ip: "192.168.117.200", name: "UBE 850T-01", data_source: "quad", quad_ip: " 192.168.117.73 " });
  assert.equal(machine.dataSource, "QUAD");
  assert.equal(machine.quadIp, "192.168.117.73");
  const plain = normalizeConfiguredMachine({ key: "192.168.117.202", ip: "192.168.117.202", name: "UBE 850T-03" });
  assert.equal(plain.dataSource, "PLC");
  assert.equal(plain.quadIp, null);
});

test("MQTT ingest runs whenever MQTT_URL is set", () => {
  assert.equal(isQuadIngestEnabled(), true);
});
