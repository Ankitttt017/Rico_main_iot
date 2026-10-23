"use strict";

// QUAD edge gateway (MQTT) settings.
//
// QUAD_MACHINES lists the machines whose data comes from QUAD instead of a direct PLC
// connection, as "<machine key or PLC IP>=<QUAD machine_id>" pairs separated by commas:
//   QUAD_MACHINES=192.168.117.201=UBE-850T-02
// Machines not listed keep their direct PLC connection. Removing a machine from the list
// (and restarting the backend) restores the direct connection.

function parseQuadMachines(value) {
  const byMachineKey = new Map();
  String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const separator = item.indexOf("=");
      if (separator <= 0) return;
      const machineKey = item.slice(0, separator).trim().toLowerCase();
      const quadMachineId = item.slice(separator + 1).trim();
      if (machineKey && quadMachineId) byMachineKey.set(machineKey, quadMachineId);
    });
  return byMachineKey;
}

const QUAD_MACHINES = parseQuadMachines(process.env.QUAD_MACHINES);

const QUAD_MQTT = {
  url: String(process.env.MQTT_URL || "").trim(),
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: String(process.env.MQTT_CLIENT_ID || "rico-iot-backend").trim(),
  topicPrefix: String(process.env.QUAD_TOPIC_PREFIX || "quad").trim().replace(/\/+$/, ""),
  reconnectPeriodMs: Math.max(1000, Number(process.env.MQTT_RECONNECT_MS || 5000)),
  connectTimeoutMs: Math.max(5000, Number(process.env.MQTT_CONNECT_TIMEOUT_MS || 30000)),
  keepaliveSec: Math.max(10, Number(process.env.MQTT_KEEPALIVE_SEC || 60)),
};

// A shot counts as "running" for this long after it was read by QUAD.
const QUAD_RUNNING_WINDOW_MS = Math.max(30000, Number(process.env.QUAD_RUNNING_WINDOW_MS || 180000));
// Shots older than this (QUAD backlog) are saved to the DB but not pushed to the live screen.
const QUAD_LIVE_MAX_AGE_MS = Math.max(30000, Number(process.env.QUAD_LIVE_MAX_AGE_MS || 300000));

function getQuadMachineId(machine = {}) {
  const candidates = [machine.key, machine.machine_key, machine.ip]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (QUAD_MACHINES.has(candidate)) return QUAD_MACHINES.get(candidate);
  }
  return null;
}

function isQuadMachine(machine = {}) {
  return Boolean(getQuadMachineId(machine));
}

function isQuadIngestEnabled() {
  return Boolean(QUAD_MQTT.url) && QUAD_MACHINES.size > 0;
}

module.exports = {
  QUAD_MACHINES,
  QUAD_MQTT,
  QUAD_RUNNING_WINDOW_MS,
  QUAD_LIVE_MAX_AGE_MS,
  parseQuadMachines,
  getQuadMachineId,
  isQuadMachine,
  isQuadIngestEnabled,
};
