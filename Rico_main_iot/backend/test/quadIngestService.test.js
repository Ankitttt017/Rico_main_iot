"use strict";

process.env.MQTT_URL = "mqtt://127.0.0.1:1883";
process.env.QUAD_MACHINES = "192.168.117.201=UBE-850T-02";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const sample = require("./fixtures/quad_sample_shot.json");
const { startQuadIngest } = require("../src/modules/plcMonitor/services/quadIngestService");
const { QuadMessageError } = require("../src/modules/plcMonitor/services/quadPayloadMapper");
const { isQuadMachine, getQuadMachineId, parseQuadMachines } = require("../src/modules/plcMonitor/config/quadConfig");

function fakeMqtt() {
  const client = new EventEmitter();
  client.published = [];
  client.subscribed = null;
  client.subscribe = (topics, callback) => { client.subscribed = topics; callback?.(null); };
  client.publish = (topic, body, options, callback) => {
    client.published.push({ topic, body: JSON.parse(body), options });
    callback?.(null);
  };
  client.end = (_force, _opts, callback) => callback?.();
  return { client, lib: { connect: (url, options) => Object.assign(client, { url, options }) } };
}

const quietLogger = { log() { }, warn() { }, error() { } };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function start(handlers) {
  const { client, lib } = fakeMqtt();
  startQuadIngest({ handleQuadStatus: () => true, ...handlers }, { mqttLib: lib, logger: quietLogger });
  client.emit("connect");
  return client;
}

test("QUAD_MACHINES selects only the listed machine", () => {
  assert.equal(isQuadMachine({ key: "192.168.117.201", ip: "192.168.117.201" }), true);
  assert.equal(getQuadMachineId({ ip: "192.168.117.201" }), "UBE-850T-02");
  for (const ip of ["192.168.117.200", "192.168.117.202", "192.168.117.205"]) {
    assert.equal(isQuadMachine({ key: ip, ip }), false, ip);
  }
  assert.equal(parseQuadMachines("a=X, b = Y ,bad,=Z").size, 2);
});

test("connects with a persistent session and subscribes to telemetry + status", () => {
  const client = start({ handleQuadTelemetry: async () => ({ ack: "SAVED" }) });
  assert.equal(client.options.clean, false);
  assert.equal(client.options.clientId, "rico-iot-backend");
  assert.deepEqual(Object.keys(client.subscribed), ["quad/+/telemetry", "quad/+/status"]);
});

test("publishes SAVED after the shot is stored", async () => {
  const seen = [];
  const client = start({ handleQuadTelemetry: async (telemetry) => { seen.push(telemetry); return { ack: "SAVED" }; } });
  client.emit("message", "quad/UBE-850T-02/telemetry", Buffer.from(JSON.stringify(sample)));
  await flush();
  assert.equal(seen.length, 1);
  assert.deepEqual(client.published, [{
    topic: "quad/UBE-850T-02/ack",
    body: { event_uuid: sample.event_uuid, status: "SAVED" },
    options: { qos: 1, retain: false },
  }]);
});

test("publishes DUPLICATE for a shot that is already stored", async () => {
  const client = start({ handleQuadTelemetry: async () => ({ ack: "DUPLICATE" }) });
  client.emit("message", "quad/UBE-850T-02/telemetry", Buffer.from(JSON.stringify(sample)));
  await flush();
  assert.equal(client.published[0].body.status, "DUPLICATE");
});

test("publishes ERROR when the DB save fails, so QUAD resends", async () => {
  const client = start({ handleQuadTelemetry: async () => { throw new Error("DB down"); } });
  client.emit("message", "quad/UBE-850T-02/telemetry", Buffer.from(JSON.stringify(sample)));
  await flush();
  assert.equal(client.published[0].body.status, "ERROR");
  assert.equal(client.published[0].body.error, "DB down");
});

test("no ACK for a machine that is not on QUAD, an unmappable shot, or bad JSON", async () => {
  let calls = 0;
  const client = start({
    handleQuadTelemetry: async () => {
      calls += 1;
      if (calls === 1) return { ack: null, reason: "machine-not-on-quad" };
      throw new QuadMessageError("message has neither acquired_at nor a PLC shot time");
    },
  });
  client.emit("message", "quad/OTHER/telemetry", Buffer.from(JSON.stringify({ ...sample, machine_id: "OTHER" })));
  client.emit("message", "quad/UBE-850T-02/telemetry", Buffer.from(JSON.stringify(sample)));
  client.emit("message", "quad/UBE-850T-02/telemetry", Buffer.from("{broken"));
  await flush();
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(client.published, []);
});

test("routes gateway status and never publishes on the status topic", async () => {
  const statuses = [];
  const client = start({
    handleQuadTelemetry: async () => ({ ack: "SAVED" }),
    handleQuadStatus: (machineId, status) => statuses.push([machineId, status.online]),
  });
  client.emit("message", "quad/UBE-850T-02/status", Buffer.from('{"status":"online","gateway_id":"QUAD-01"}'));
  client.emit("message", "quad/UBE-850T-02/status", Buffer.from('{"status":"offline"}'));
  client.emit("message", "quad/UBE-850T-02/ack", Buffer.from('{"event_uuid":"x","status":"SAVED"}'));
  await flush();
  assert.deepEqual(statuses, [["UBE-850T-02", true], ["UBE-850T-02", false]]);
  assert.deepEqual(client.published, []);
});

test("shots of one machine are handled in arrival order", async () => {
  const order = [];
  const client = start({
    handleQuadTelemetry: async (telemetry) => {
      await new Promise((resolve) => setTimeout(resolve, telemetry.eventUuid === "first" ? 20 : 0));
      order.push(telemetry.eventUuid);
      return { ack: "SAVED" };
    },
  });
  client.emit("message", "quad/UBE-850T-02/telemetry", Buffer.from(JSON.stringify({ ...sample, event_uuid: "first" })));
  client.emit("message", "quad/UBE-850T-02/telemetry", Buffer.from(JSON.stringify({ ...sample, event_uuid: "second" })));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(order, ["first", "second"]);
});

test("does nothing when the PLC monitor is disabled", () => {
  const { client, lib } = fakeMqtt();
  let connected = false;
  startQuadIngest({}, { mqttLib: { connect: (...args) => { connected = true; return lib.connect(...args); } }, logger: quietLogger });
  assert.equal(connected, false);
  assert.equal(client.published.length, 0);
});
