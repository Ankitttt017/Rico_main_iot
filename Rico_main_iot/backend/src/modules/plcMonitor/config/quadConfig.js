"use strict";

// QUAD edge gateway (MQTT) settings.
//
// A machine gets its data from QUAD instead of a direct PLC connection when:
//   1. Machine Config has Data Source = QUAD and a QUAD IP address. QUAD messages that carry
//      "gateway_ip" are matched to the machine by that IP. Changes apply within the machine
//      config refresh (15 s), no restart.
//   2. Or the machine is listed in QUAD_MACHINES (older QUADs that do not send gateway_ip),
//      as "<machine key or PLC IP>=<QUAD machine_id>" pairs separated by commas:
//        QUAD_MACHINES=192.168.117.201=UBE-850T-02
//      Messages without gateway_ip are matched by the machine_id in the topic.
// Other machines keep their direct PLC connection.

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

function normalizeQuadIp(value) {
  return String(value || "").trim();
}

// QUAD machine_id from QUAD_MACHINES, or null.
function getEnvQuadMachineId(machine = {}) {
  const candidates = [machine.key, machine.machine_key, machine.ip]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (QUAD_MACHINES.has(candidate)) return QUAD_MACHINES.get(candidate);
  }
  return null;
}

// QUAD IP from Machine Config when its Data Source is QUAD, or null.
function getConfiguredQuadIp(machine = {}) {
  if (String(machine.dataSource || "").trim().toUpperCase() !== "QUAD") return null;
  return normalizeQuadIp(machine.quadIp) || null;
}

// Label of the QUAD feeding this machine (for logs and the live screen), or null.
function getQuadMachineId(machine = {}) {
  return getEnvQuadMachineId(machine) || getConfiguredQuadIp(machine);
}

function isQuadMachine(machine = {}) {
  return Boolean(getQuadMachineId(machine));
}

// A message that carries gateway_ip is matched only by that IP (Machine Config); a message
// without it only by its topic machine_id (QUAD_MACHINES). A QUAD whose IP is not configured
// is never saved under another machine that happens to use the same machine_id.
function findQuadMachine(machines, { machineId, gatewayIp } = {}) {
  const list = machines || [];
  const ip = normalizeQuadIp(gatewayIp);
  if (ip) return list.find((machine) => getConfiguredQuadIp(machine) === ip) || null;
  const wanted = String(machineId || "").trim().toLowerCase();
  if (!wanted) return null;
  return list.find((machine) => String(getEnvQuadMachineId(machine) || "").toLowerCase() === wanted) || null;
}

function isQuadIngestEnabled() {
  return Boolean(QUAD_MQTT.url);
}

module.exports = {
  QUAD_MACHINES,
  QUAD_MQTT,
  QUAD_RUNNING_WINDOW_MS,
  QUAD_LIVE_MAX_AGE_MS,
  parseQuadMachines,
  normalizeQuadIp,
  getConfiguredQuadIp,
  getQuadMachineId,
  findQuadMachine,
  isQuadMachine,
  isQuadIngestEnabled,
};
