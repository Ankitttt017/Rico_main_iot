const { emitRealtime } = require("./realtimeService");
const tcpTextService = require("./plcProtocols/tcpTextService");
const modbusService = require("./plcProtocols/modbusService");
const slmpService = require("./plcProtocols/slmpService");
const { toBoundedInt, sleep } = require("./plcProtocols/utils");

const DEFAULT_CONNECT_TIMEOUT_MS = Number(process.env.PLC_CONNECT_TIMEOUT_MS || 2000);
const DEFAULT_TEST_TIMEOUT_MS = Number(process.env.PLC_TEST_TIMEOUT_MS || DEFAULT_CONNECT_TIMEOUT_MS);
const DEFAULT_TEST_RETRY_COUNT = Math.max(Number(process.env.PLC_TEST_RETRY_COUNT || 2), 1);
const DEFAULT_RETRIES = Number(process.env.PLC_RETRY_COUNT || 3);
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = Math.max(Number(process.env.PLC_CIRCUIT_FAILURE_THRESHOLD || 5), 1);
const DEFAULT_CIRCUIT_OPEN_MS = Math.max(Number(process.env.PLC_CIRCUIT_OPEN_MS || 30000), 1000);

const SIMULATION_MODE = ["1", "true", "yes", "on"].includes(
  String(process.env.PLC_SIMULATION_MODE || process.env.PLC_SIMULATION || "").trim().toLowerCase()
);
const SIMULATION_RESULT = String(process.env.PLC_SIMULATION_RESULT || "OK").trim().toUpperCase();
const SIM_START_DELAY_MS = Math.max(Number(process.env.PLC_SIM_START_DELAY_MS || 150), 0);
const SIM_END_DELAY_MS = Math.max(Number(process.env.PLC_SIM_END_DELAY_MS || 600), 0);

const circuitStateMap = new Map();

const PROTOCOLS = {
  TCP_TEXT: tcpTextService,
  MODBUS_TCP: modbusService,
  SLMP: slmpService,
};

function normalizeProtocol(value) {
  const protocol = String(value || "").trim().toUpperCase();
  if (protocol === "MODBUS" || protocol === "MODBUS_TCP") {
    return "MODBUS_TCP";
  }
  if (protocol === "SLMP") {
    return "SLMP";
  }
  if (["TCP", "TEXT", "TCP_TEXT"].includes(protocol)) {
    return "TCP_TEXT";
  }
  return "TCP_TEXT";
}

function getProtocolService(protocol) {
  const normalized = normalizeProtocol(protocol);
  return PROTOCOLS[normalized] || tcpTextService;
}

function shouldSimulate(machine) {
  if (SIMULATION_MODE) {
    return true;
  }
  const flag = String(machine?.plc_simulation_mode || machine?.plc_simulation || "").trim().toUpperCase();
  return ["TRUE", "ON", "1", "YES"].includes(flag);
}

function getCircuitKey(machineId, ip, port) {
  if (machineId) {
    return `machine:${machineId}`;
  }
  return `endpoint:${ip}:${port}`;
}

function getCircuitState(key) {
  const existing = circuitStateMap.get(key);
  if (existing) {
    return existing;
  }
  const initial = {
    consecutiveFailures: 0,
    openUntil: 0,
    lastError: null,
    lastFailureAt: null,
    lastSuccessAt: null,
  };
  circuitStateMap.set(key, initial);
  return initial;
}

function isCircuitOpen(state) {
  return Number(state.openUntil || 0) > Date.now();
}

function recordCircuitSuccess({ key, machineId, partId, stationNo, protocol }) {
  const state = getCircuitState(key);
  const hadFailures = state.consecutiveFailures > 0 || state.openUntil > 0;
  state.consecutiveFailures = 0;
  state.openUntil = 0;
  state.lastSuccessAt = new Date().toISOString();
  state.lastError = null;
  if (hadFailures) {
    emitRealtime("plc_circuit_event", {
      machineId: machineId || null,
      partId: partId || null,
      stationNo: stationNo || null,
      protocol,
      key,
      state: "CLOSED",
      checkedAt: state.lastSuccessAt,
    });
  }
}

function recordCircuitFailure({ key, machineId, partId, stationNo, protocol, error }) {
  const state = getCircuitState(key);
  state.consecutiveFailures += 1;
  state.lastError = String(error?.message || "Unknown PLC failure");
  state.lastFailureAt = new Date().toISOString();

  if (state.consecutiveFailures >= DEFAULT_CIRCUIT_FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + DEFAULT_CIRCUIT_OPEN_MS;
    emitRealtime("plc_circuit_event", {
      machineId: machineId || null,
      partId: partId || null,
      stationNo: stationNo || null,
      protocol,
      key,
      state: "OPEN",
      openUntil: new Date(state.openUntil).toISOString(),
      consecutiveFailures: state.consecutiveFailures,
      lastError: state.lastError,
      checkedAt: state.lastFailureAt,
    });
  }
}

function getPlcCircuitSnapshot() {
  return Array.from(circuitStateMap.entries()).map(([key, value]) => ({
    key,
    ...value,
    isOpen: isCircuitOpen(value),
  }));
}

function logPlc(level, message, meta = {}) {
  const prefix = `[PLC:${level}]`;
  const details = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  if (details) {
    console.log(`${prefix} ${message} ${details}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

async function simulateHandshake({ partId, stationNo, protocol, onAckStart, onAckEndOk, onAckEndNg }) {
  const startAck = { type: "ACK_START", partId, protocol };
  if (SIM_START_DELAY_MS > 0) {
    await sleep(SIM_START_DELAY_MS);
  }
  if (typeof onAckStart === "function") {
    await onAckStart(startAck);
  }

  const endType = SIMULATION_RESULT === "NG" ? "ACK_END_NG" : "ACK_END_OK";
  const endAck = { type: endType, partId, protocol };
  if (SIM_END_DELAY_MS > 0) {
    await sleep(SIM_END_DELAY_MS);
  }
  if (endType === "ACK_END_OK" && typeof onAckEndOk === "function") {
    await onAckEndOk(endAck);
  }
  if (endType === "ACK_END_NG" && typeof onAckEndNg === "function") {
    await onAckEndNg(endAck);
  }

  return { ok: true, protocol, simulated: true, finalAck: endType };
}

async function executePlcHandshake({
  ip,
  port,
  partId,
  stationNo,
  machineId,
  machine,
  onAckStart,
  onAckEndOk,
  onAckEndNg,
  onFailure,
}) {
  if (!ip || !port) {
    const error = new Error("PLC endpoint missing");
    if (typeof onFailure === "function") {
      await onFailure(error);
    }
    return { ok: false, error: error.message };
  }

  const protocol = normalizeProtocol(machine?.plc_protocol || process.env.PLC_PROTOCOL || "TCP_TEXT");
  const service = getProtocolService(protocol);
  const circuitKey = getCircuitKey(machineId, ip, port);
  const circuitState = getCircuitState(circuitKey);

  if (shouldSimulate(machine)) {
    logPlc("SIM", "PLC handshake simulated", { protocol, machineId, partId, stationNo });
    recordCircuitSuccess({ key: circuitKey, machineId, partId, stationNo, protocol });
    return simulateHandshake({ partId, stationNo, protocol, onAckStart, onAckEndOk, onAckEndNg });
  }

  if (isCircuitOpen(circuitState)) {
    const error = new Error(`PLC circuit open until ${new Date(circuitState.openUntil).toISOString()}`);
    emitRealtime("plc_connection_event", {
      machineId,
      partId,
      stationNo,
      protocol,
      state: "CIRCUIT_OPEN",
      error: error.message,
    });
    if (typeof onFailure === "function") {
      await onFailure(error);
    }
    return {
      ok: false,
      protocol,
      circuitOpen: true,
      error: error.message,
    };
  }

  for (let attempt = 1; attempt <= DEFAULT_RETRIES; attempt += 1) {
    try {
      emitRealtime("plc_connection_event", {
        machineId,
        partId,
        stationNo,
        protocol,
        attempt,
        state: "CONNECTING",
      });
      logPlc("INFO", "PLC handshake attempt", { protocol, machineId, attempt, ip, port, partId, stationNo });

      const result = await service.handshake({
        protocol,
        ip,
        port,
        partId,
        stationNo,
        machine,
      });

      if (typeof onAckStart === "function") {
        await onAckStart(result.startAck);
      }

      if (result.endAck.type === "ACK_END_OK") {
        if (typeof onAckEndOk === "function") {
          await onAckEndOk(result.endAck);
        }
      } else if (typeof onAckEndNg === "function") {
        await onAckEndNg(result.endAck);
      }

      emitRealtime("plc_connection_event", {
        machineId,
        partId,
        stationNo,
        protocol,
        attempt,
        state: "COMPLETED",
        finalAck: result.endAck.type,
      });

      recordCircuitSuccess({
        key: circuitKey,
        machineId,
        partId,
        stationNo,
        protocol,
      });

      logPlc("INFO", "PLC handshake completed", {
        protocol,
        machineId,
        attempt,
        partId,
        stationNo,
        finalAck: result.endAck.type,
      });

      return {
        ok: true,
        protocol,
        attempt,
        finalAck: result.endAck.type,
      };
    } catch (error) {
      emitRealtime("plc_connection_event", {
        machineId,
        partId,
        stationNo,
        protocol,
        attempt,
        state: "RETRYING",
        error: error.message,
      });
      logPlc("WARN", "PLC handshake failed", {
        protocol,
        machineId,
        attempt,
        partId,
        stationNo,
        error: error.message,
      });

      if (attempt === DEFAULT_RETRIES) {
        recordCircuitFailure({
          key: circuitKey,
          machineId,
          partId,
          stationNo,
          protocol,
          error,
        });
        if (typeof onFailure === "function") {
          await onFailure(error);
        }
        return { ok: false, protocol, error: error.message };
      }
    }
  }

  return { ok: false, protocol, error: "Unknown PLC handshake error" };
}

async function testPlcConnection({ ip, port, protocol = "TCP_TEXT", machine = {} }) {
  if (!ip || !port) {
    throw new Error("PLC IP and port are required");
  }

  if (shouldSimulate(machine)) {
    logPlc("SIM", "PLC test simulated", { protocol, ip, port });
    return {
      protocol: normalizeProtocol(protocol || machine?.plc_protocol),
      connected: true,
      simulated: true,
      attempt: 1,
      retryCount: 1,
      timeoutMs: DEFAULT_TEST_TIMEOUT_MS,
    };
  }

  const timeoutMs = toBoundedInt(
    machine?.plc_test_timeout_ms ?? machine?.testTimeoutMs,
    DEFAULT_TEST_TIMEOUT_MS,
    300,
    60000
  );
  const retryCount = toBoundedInt(
    machine?.plc_test_retry_count ?? machine?.testRetryCount,
    DEFAULT_TEST_RETRY_COUNT,
    1,
    10
  );
  const normalizedProtocol = normalizeProtocol(protocol || machine?.plc_protocol);
  const service = getProtocolService(normalizedProtocol);

  let lastError = null;
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const probe = await service.probe({ ip, port, machine, timeoutMs, protocol: normalizedProtocol });
      return {
        ...probe,
        attempt,
        retryCount,
        timeoutMs,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retryCount) {
        await sleep(Math.min(150 * attempt, 600));
      }
    }
  }

  throw new Error(`PLC test failed after ${retryCount} attempt(s): ${String(lastError?.message || "Unknown error")}`);
}

async function resetPlcState({ ip, port, protocol = "TCP_TEXT", machine = {}, stationNo = "" }) {
  if (!ip || !port) {
    throw new Error("PLC IP and port are required");
  }

  const normalizedProtocol = normalizeProtocol(protocol || machine?.plc_protocol);
  const service = getProtocolService(normalizedProtocol);

  if (shouldSimulate(machine)) {
    logPlc("SIM", "PLC reset simulated", { protocol: normalizedProtocol, ip, port });
    return { protocol: normalizedProtocol, connected: true, simulated: true };
  }

  return service.reset({ ip, port, machine, stationNo, protocol: normalizedProtocol });
}

async function sendPlcCommand({ ip, port, command, protocol = "TCP_TEXT", machine = {}, partId, stationNo }) {
  if (!ip || !port) {
    throw new Error("PLC IP and port are required");
  }
  const normalizedProtocol = normalizeProtocol(protocol || machine?.plc_protocol);
  const service = getProtocolService(normalizedProtocol);
  if (shouldSimulate(machine)) {
    logPlc("SIM", "PLC command simulated", { protocol: normalizedProtocol, command });
    return {
      protocol: normalizedProtocol,
      command: String(command || "").trim().toUpperCase(),
      simulated: true,
    };
  }
  if (!service.sendCommand) {
    throw new Error(`sendCommand not supported for protocol ${normalizedProtocol}`);
  }
  return service.sendCommand({ ip, port, command, machine, partId, stationNo, protocol: normalizedProtocol });
}

module.exports = {
  executePlcHandshake,
  testPlcConnection,
  resetPlcState,
  getPlcCircuitSnapshot,
  sendPlcCommand,
};
