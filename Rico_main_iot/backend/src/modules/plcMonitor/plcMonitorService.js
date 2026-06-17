"use strict";

const net = require("net");
const fs = require("fs");
const path = require("path");
const db = require("../../config/db");

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MACHINE CONFIG
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const {
  getMachines,
  getConfiguredMachines,
} = require("./config/machineConfig");
const {
  TABLE,
  LEAK_TEST_TABLE,
  CONNECTION_EVENTS_TABLE,
  DEVICE_CODE,
  CYCLE_START_DEVICE,
  CYCLE_END_DEVICE,
  UBE_CYCLE_END_DELAY_MS,
  UBE_CYCLE_END_POLL_MS,
  UBE_LIVE_READ_MS,
  PLC_MAX_CONSECUTIVE_READ_FAILURES,
  PLC_DB_RETRY_MS,
  PLC_DB_RETRY_MAX,
  PLC_DB_RETRY_BATCH_SIZE,
  PLC_PENDING_SAVE_FILE,
  LEAK_TEST_CONTROL,
  LEAK_DUPLICATE_WINDOW_SEC,
  LEAK_QR_DUPLICATE_WINDOW_SEC,
  LEAK_CHANGE_SAVE_ENABLED,
  LEAK_CHANGE_MIN_INTERVAL_MS,
  PLC_READ_TIMEOUT_MS,
  PLC_RECONNECT_AFTER_TIMEOUT_MS,
  EXCEL_PARAMETERS,
  UBE_LIMIT_STATUS_PARAMETERS,
  LEAK_TEST_PARAMETERS,
  UBE_READ_PARAMETERS,
  ALL_PARAMETERS,
  PARAMETER_BY_NAME,
  LEGACY_COLUMNS_BY_PARAMETER,
  DROPPED_READING_COLUMNS,
  LIVE_READING_METADATA_COLUMNS,
  UBE_REPORT_COLUMNS,
  LEAK_REPORT_COLUMNS,
  EXTRA_READING_COLUMNS,
  TWO_DIGIT_READING_COLUMNS,
  M_BIT_DURATION_COLUMNS,
  UBE_CLIENT_READING_NAMES,
  LEAK_CLIENT_READING_NAMES,
} = require("./config/registerConfig");

let schemaReadyPromise = null;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// UTILITY HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function clampLimit(value, fallback = 200, max = Number(process.env.PLC_HISTORY_MAX_LIMIT || 20000)) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function pad2(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(Math.trunc(Math.abs(n)) % 100).padStart(2, "0");
}

function buildShotDateValue(yearValue, monthValue, dayValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const fullYear = year < 100 ? 2000 + Math.trunc(Math.abs(year)) : Math.trunc(year);
  const date = new Date(Date.UTC(fullYear, Math.trunc(month) - 1, Math.trunc(day)));
  if (
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== Math.trunc(month) - 1 ||
    date.getUTCDate() !== Math.trunc(day)
  ) {
    return null;
  }

  return `${fullYear}-${pad2(month)}-${pad2(day)}`;
}

function buildShotTimeValue(hourValue, minuteValue, secondValue) {
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function buildShotDateTimeValue(yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue) {
  const shotDate = buildShotDateValue(yearValue, monthValue, dayValue);
  const shotTime = buildShotTimeValue(hourValue, minuteValue, secondValue);
  return shotDate && shotTime ? `${shotDate} ${shotTime}` : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PLC_CONNECT_TIMEOUT_MS = Number(process.env.PLC_CONNECT_TIMEOUT_MS || 15000);
const PLC_RECONNECT_MIN_MS = Number(process.env.PLC_RECONNECT_MIN_MS || process.env.PLC_RECONNECT_MS || 2000);
const PLC_RECONNECT_MAX_MS = Number(process.env.PLC_RECONNECT_MAX_MS || 30000);
const PLC_RECONNECT_BACKOFF_FACTOR = Number(process.env.PLC_RECONNECT_BACKOFF_FACTOR || 1.6);
const PLC_RECONNECT_JITTER_MS = Number(process.env.PLC_RECONNECT_JITTER_MS || 1000);

function isPlcReadTimeoutError(error) {
  return /PLC read timeout|timed out|timeout/i.test(String(error?.message || error || ""));
}

function isPlcConnectionError(error) {
  return /PLC connection timeout|PLC read timeout|timed out|timeout|ECONN|EHOST|ENET|EPIPE|socket hang up/i.test(
    String(error?.message || error || "")
  );
}

function reconnectDelayMs(attempt = 1) {
  const minDelay = Math.max(500, PLC_RECONNECT_MIN_MS);
  const maxDelay = Math.max(minDelay, PLC_RECONNECT_MAX_MS);
  const factor = Number.isFinite(PLC_RECONNECT_BACKOFF_FACTOR) && PLC_RECONNECT_BACKOFF_FACTOR > 1
    ? PLC_RECONNECT_BACKOFF_FACTOR
    : 1.6;
  const backoff = minDelay * Math.pow(factor, Math.max(0, attempt - 1));
  const jitter = PLC_RECONNECT_JITTER_MS > 0 ? Math.floor(Math.random() * PLC_RECONNECT_JITTER_MS) : 0;
  return Math.min(maxDelay, Math.floor(backoff + jitter));
}

function closeSocket(sock) {
  if (!sock) return;
  try {
    sock.destroy();
  } catch (_) {
    // Nothing useful to do here; the monitor loop will reconnect.
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MACHINE TYPE HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Returns true if machine is UBE die casting machine
 */
function isUbeMachine(machine) {
  return (machine.kind || "ube") !== "leaktest";
}

/**
 * Returns true if machine is Leak Test machine
 */
function isLeakTestMachine(machine) {
  return machine.kind === "leaktest";
}

function isReportSaveEnabledForMachine(machine) {
  if (isLeakTestMachine(machine)) return true;
  const mode = String(process.env.PLC_REPORT_SAVE_UBE_MODE || "all").trim().toLowerCase();
  if (["0", "false", "off", "disabled", "none"].includes(mode)) return false;
  return true;
}

/**
 * Build a standard emit payload â€” always includes machineKey + machineType
 * so frontend can filter easily
 */
function buildEmitPayload(machine, data) {
  const machineKey = machine.key || machine.ip;
  const machineType = isLeakTestMachine(machine) ? "leaktest" : "ube";
  return {
    ...data,
    machineKey,
    machineType,
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PER-READ TIMEOUT WRAPPER
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`PLC read timeout (${ms}ms): ${label}`)),
        ms
      )
    ),
  ]);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TCP BUFFER ACCUMULATION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function sendReceive(sock, packet, expectedPayloadBytes = 1, label = "PLC read") {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalReceived = 0;
    const expectedBytes = 11 + Math.max(0, Number(expectedPayloadBytes) || 0);
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`PLC read timeout (${PLC_READ_TIMEOUT_MS}ms): ${label}`));
    }, PLC_READ_TIMEOUT_MS);

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.removeListener("data", onData);
      sock.removeListener("error", onError);
    };

    const onData = (chunk) => {
      chunks.push(chunk);
      totalReceived += chunk.length;

      if (totalReceived < expectedBytes) return;

      const data = Buffer.concat(chunks);
      cleanup();

      try {
        const endCode = data.readUInt16LE(9);
        if (endCode !== 0) {
          reject(new Error(`PLC returned error code 0x${endCode.toString(16)}`));
          return;
        }
        resolve(data.slice(11, expectedBytes));
      } catch (err) {
        reject(new Error(`PLC response parse failed: ${err.message}`));
      }
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    sock.on("data", onData);
    sock.once("error", onError);
    try {
      sock.write(packet);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PLC PACKET BUILDER
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parseDevice(device) {
  const match = device.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid PLC device: ${device}`);
  return { type: match[1], addr: Number.parseInt(match[2], 10) };
}

function buildPacket(device, count, isBit = false) {
  const parsed = parseDevice(device);
  const command = Buffer.alloc(10);

  command.writeUInt16LE(0x0401, 0);
  command.writeUInt16LE(isBit ? 1 : 0, 2);
  command[4] = parsed.addr & 0xff;
  command[5] = (parsed.addr >> 8) & 0xff;
  command[6] = (parsed.addr >> 16) & 0xff;
  command[7] = DEVICE_CODE[parsed.type];
  command.writeUInt16LE(count, 8);

  const packet = Buffer.alloc(21);
  packet[0] = 0x50;
  packet[1] = 0x00;
  packet[2] = 0x00;
  packet[3] = 0xff;
  packet.writeUInt16LE(0x03ff, 4);
  packet[6] = 0x00;
  packet.writeUInt16LE(12, 7);
  packet.writeUInt16LE(4, 9);
  command.copy(packet, 11);

  return packet;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PLC READ FUNCTIONS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function readWord(sock, device) {
  const response = await sendReceive(sock, buildPacket(device, 1, false), 2, `readWord(${device})`);
  return response.readUInt16LE(0);
}

async function readReal32(sock, device) {
  const response = await sendReceive(sock, buildPacket(device, 2, false), 4, `readReal32(${device})`);
  const value = response.readFloatLE(0);
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

async function readDWord(sock, device) {
  const response = await sendReceive(sock, buildPacket(device, 2, false), 4, `readDWord(${device})`);
  return response.readUInt32LE(0);
}
async function readBit(sock, device) {
  const response = await sendReceive(sock, buildPacket(device, 1, true), 1, `readBit(${device})`);
  return response[0] === 0 ? 0 : 1;
}
async function readString(sock, startDevice, length) {
  const response = await sendReceive(
    sock,
    buildPacket(startDevice, length, false),
    length * 2,
    `readString(${startDevice}, len=${length})`
  );

  let result = "";
  for (let i = 0; i < length; i++) {
    const value = response.readUInt16LE(i * 2);
    const low = value & 0xff;
    const high = (value >> 8) & 0xff;
    if (low >= 32 && low <= 126) result += String.fromCharCode(low);
    if (high >= 32 && high <= 126) result += String.fromCharCode(high);
  }

  // PEHLE wala strict filter HATA DIYA:
  // const strict = cleaned.match(/[A-Za-z0-9\-]+S\d/)?.[0];
  // return strict || cleaned;

  // SIRF basic clean karo
  const cleaned = result.trim().replace(/[^A-Za-z0-9\-_]/g, "");
  return cleaned;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TCP CONNECTION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function connectPLC(machine) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    const timeoutMs = PLC_CONNECT_TIMEOUT_MS;
    let settled = false;

    const cleanup = () => {
      sock.removeListener("error", onError);
      sock.removeListener("timeout", onTimeout);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeSocket(sock);
      reject(error);
    };

    const onError = (error) => fail(error);
    const onTimeout = () => fail(new Error("PLC connection timeout"));

    sock.setTimeout(timeoutMs);
    sock.connect(machine.port, machine.ip, () => {
      if (settled) return;
      settled = true;
      cleanup();
      sock.setTimeout(0);
      sock.setKeepAlive(true, Number(process.env.PLC_SOCKET_KEEPALIVE_MS || 10000));
      sock.setNoDelay(true);
      resolve(sock);
    });
    sock.on("error", onError);
    sock.on("timeout", onTimeout);
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// NORMALIZE / SCALE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function scaleValue(parameter, value) {
  if (value === null || value === undefined) return null;
  const normalizedName = String(parameter.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  const normalizedDevice = String(parameter.device || "").trim().toUpperCase();
  const isBiscuitThickness =
    normalizedDevice === "D6916" ||
    normalizedName === "biscuit_thickness_mm" ||
    normalizedName === "biscuit_thickness" ||
    (normalizedName.includes("biscuit") && normalizedName.includes("thickness"));
  if (isBiscuitThickness) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Number(n.toFixed(2));
  }

  if (parameter.type === "int") return Number.parseInt(value, 10) || 0;
  if (parameter.type === "dword") return Number.parseInt(value, 10) || 0;
  if (parameter.type === "real32") return Number(Number(value).toFixed(3));

  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const scale = parameter.scale ?? 1;
  return Number((n * scale).toFixed(2));
}

function normalizeLeakResult(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.toUpperCase();

  if (["OK", "O", "PASS", "PASSED", "GOOD", "G", "Y", "YES", "TRUE", "1"].includes(normalized)) return "OK";
  if (["NG", "N", "FAIL", "FAILED", "BAD", "B", "NO", "FALSE", "0"].includes(normalized)) return "NG";
  return raw;
}

function normalizeLeakStatus(status, result) {
  const resultStatus = normalizeLeakResult(result);
  const rawStatus = status === null || status === undefined ? "" : String(status).trim();
  const normalizedStatus = rawStatus.toUpperCase();

  if (!rawStatus || ["ONLINE", "SAVED", "MIGRATED", "UNKNOWN"].includes(normalizedStatus)) {
    return resultStatus || rawStatus || null;
  }
  return normalizeLeakResult(rawStatus) || resultStatus || rawStatus;
}

function normalizeReadingForDB(name, value) {
  if (value === null || value === undefined) return null;
  if (DROPPED_READING_COLUMNS.has(name)) return undefined;
  if (name === "shot_date") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }
  if (name === "shot_time") return String(value).slice(0, 8);
  if (name === "shot_datetime") {
    const raw = String(value).trim().replace("T", " ");
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
    if (match) return `${match[1]} ${match[2]}`;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace("T", " ");
  }
  if (name === "cycle_start_time" || name === "cycle_end_time") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return systemDateTimeString(date);
  }
  if (TWO_DIGIT_READING_COLUMNS.has(name)) return pad2(value);

  const parameter = PARAMETER_BY_NAME.get(name);
  if (parameter?.type === "text") return String(value);
  if (parameter?.type === "int") return Number.parseInt(value, 10) || 0;

  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(parameter?.type === "real32" ? 3 : 2));
}

function systemDateTimeString(value = new Date(), { iso = false } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (number, size = 2) => String(number).padStart(size, "0");
  const datePart = [
    safeDate.getFullYear(),
    pad(safeDate.getMonth() + 1),
    pad(safeDate.getDate()),
  ].join("-");
  const timePart = [
    pad(safeDate.getHours()),
    pad(safeDate.getMinutes()),
    pad(safeDate.getSeconds()),
  ].join(":");
  return `${datePart}${iso ? "T" : " "}${timePart}.${pad(safeDate.getMilliseconds(), 3)}`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STABILITY CHECKS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function hasStableCycleReadings(readings) {
  const cycleTime = Number(
    readings.cycle_time ?? readings["CYCLE TIME sec."] ?? 0
  );
  const minCycleTime = Number(process.env.PLC_MIN_VALID_CYCLE_TIME_SEC || 5);
  return cycleTime >= minCycleTime;
}

function hasStableLeakReadings(readings) {
  const hasScan = Boolean(String(readings.part_qr_code || "").trim());
  const hasResult = readings.result !== null && readings.result !== undefined;
  const hasLeakValue =
    readings.body_leak_value !== null && readings.body_leak_value !== undefined;
  return hasScan || hasResult || hasLeakValue;
}

function buildLeakSignature(readings, { includeCycleTime = false } = {}) {
  const signature = {
    part_qr_code: readings.part_qr_code || readings.scan_data || "",
    result: normalizeLeakResult(readings.result) || "",
    body_leak_value: normalizeReadingForDB("body_leak_value", readings.body_leak_value),
    gall_1: normalizeReadingForDB("gall_1", readings.gall_1),
    gall_2: normalizeReadingForDB("gall_2", readings.gall_2),
  };
  if (includeCycleTime) signature.cycle_time = Number.parseInt(readings.cycle_time, 10) || null;
  return JSON.stringify(signature);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DB HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function readingColumnName(name) {
  return name;
}

function sqlColumn(name) {
  return `[${readingColumnName(name).replace(/]/g, "]]")}]`;
}

function sqlString(value) {
  return String(value).replace(/'/g, "''");
}

function dynamicSql(sql) {
  return `EXEC(N'${sqlString(sql)}')`;
}

function readingSqlType(name) {
  const parameter = PARAMETER_BY_NAME.get(name);
  if (parameter?.type === "text") return "NVARCHAR(30)";
  if (parameter?.type === "int") return "INT";
  if (parameter?.type === "real32") return "DECIMAL(18,3)";
  return "DECIMAL(18,2)";
}

function legacySqlType(name) {
  const sourceName = Object.keys(LEGACY_COLUMNS_BY_PARAMETER).find(
    (k) => LEGACY_COLUMNS_BY_PARAMETER[k] === name
  );
  return sourceName ? readingSqlType(sourceName) : "DECIMAL(18,2)";
}

function addInsertValue(columns, values, column, value) {
  if (value === undefined || DROPPED_READING_COLUMNS.has(column)) return;
  if (!getFixedReadingColumnNames().has(column)) return;
  if (columns.includes(column)) return;
  columns.push(column);
  values.push(value);
}

function getReadingNames() {
  return [...EXCEL_PARAMETERS, ...UBE_LIMIT_STATUS_PARAMETERS]
    .map((p) => p.name)
    .filter((name) => !DROPPED_READING_COLUMNS.has(name));
}

let fixedReadingColumnNames = null;

function getFixedReadingColumnNames() {
  if (fixedReadingColumnNames) return fixedReadingColumnNames;
  fixedReadingColumnNames = new Set([
    "raw_readings_json",
    ...getReadingNames(),
    ...Object.values(LEGACY_COLUMNS_BY_PARAMETER),
    ...EXTRA_READING_COLUMNS.map((item) => Array.isArray(item) ? item[0] : item),
    ...M_BIT_DURATION_COLUMNS.map((item) => Array.isArray(item) ? item[0] : item),
  ]);
  return fixedReadingColumnNames;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FORMAT HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatDbRowForClient(row = {}) {
  const next = { ...row };

  if (next.scan_data && !next.part_qr_code) next.part_qr_code = next.scan_data;
  if (next.part_qr_code && !next.scan_data) next.scan_data = next.part_qr_code;
  if (next["BISCUIT THICKNESS mm"] !== null && next["BISCUIT THICKNESS mm"] !== undefined) {
    next.biscuit_thickness = next["BISCUIT THICKNESS mm"];
  }

  if (Object.prototype.hasOwnProperty.call(next, "result")) {
    next.result = normalizeLeakResult(next.result) || next.result;
  }
  if (Object.prototype.hasOwnProperty.call(next, "status")) {
    next.status = normalizeLeakStatus(next.status, next.result);
  }

  for (const column of DROPPED_READING_COLUMNS) delete next[column];

  for (const column of TWO_DIGIT_READING_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(next, column)) {
      next[column] = pad2(next[column]);
    }
  }

  return next;
}

function historySortKey(row = {}) {
  const value = row.recorded_at || row.shot_datetime || row.cycle_end_time || row.created_at;
  if (value instanceof Date) return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  return String(value || "")
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "")
    .replace(/Z$/, "");
}

function sortHistoryRows(rows = []) {
  return rows.sort((a, b) => {
    const aKey = historySortKey(a);
    const bKey = historySortKey(b);
    if (aKey !== bKey) return bKey.localeCompare(aKey);
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function formatDbReading(row, machineFallback = {}) {
  if (!row) {
    return {
      machine_key: machineFallback.key || null,
      machine_name: machineFallback.name || null,
      plc_ip: machineFallback.ip || null,
      plc_port: machineFallback.port || null,
      machine_type: isLeakTestMachine(machineFallback) ? "leaktest" : "ube",
      is_online: Boolean(machineFallback.connected),
      error: machineFallback.error || null,
      has_data: false,
    };
  }
  return {
    ...formatDbRowForClient(row),
    machine_key: row.machine_key || machineFallback.key || null,
    machine_name: row.machine_name || machineFallback.name || null,
    plc_ip: row.plc_ip || machineFallback.ip || null,
    plc_port: row.plc_port || machineFallback.port || null,
    machine_type: isLeakTestMachine(machineFallback) ? "leaktest" : "ube",
    is_online: Boolean(machineFallback.connected),
    error: machineFallback.error || null,
    has_data: true,
  };
}

function formatLiveReadingSnapshot(machine, partName, readings = {}, timestamp = new Date().toISOString()) {
  return formatDbReading(
    {
      ...readings,
      id: `live-${machine.key || machine.ip}`,
      recorded_at: timestamp || readings.shot_datetime || null,
      created_at: new Date().toISOString(),
      machine_key: machine.key || machine.ip,
      machine_name: machine.name,
      plc_ip: machine.ip,
      plc_port: machine.port,
      part_name: partName,
    },
    { ...machine, connected: true }
  );
}

function getComparableShotNumber(row = {}) {
  const value = row.shot_number ?? row.lastShotNumber;
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function chooseFreshestReading(dbReading, machine = {}) {
  const liveReading = machine.latestReading;
  if (!liveReading?.has_data) return dbReading;
  if (!dbReading?.has_data) return liveReading;

  const liveShot = getComparableShotNumber(liveReading);
  const dbShot = getComparableShotNumber(dbReading);
  if (liveShot !== null && dbShot !== null && liveShot > dbShot) return liveReading;

  const liveTime = new Date(liveReading.recorded_at || liveReading.created_at || 0).getTime();
  const dbTime = new Date(dbReading.recorded_at || dbReading.created_at || 0).getTime();
  if (Number.isFinite(liveTime) && (!Number.isFinite(dbTime) || liveTime > dbTime)) return liveReading;

  return dbReading;
}

function buildReadingsForDBFromLiveSnapshot(liveReading = {}) {
  return Object.fromEntries(
    Object.entries(liveReading).filter(([name]) => !LIVE_READING_METADATA_COLUMNS.has(name))
  );
}

async function persistLiveSnapshotIfAhead(machine = {}, dbReading = {}) {
  if (!isUbeMachine(machine) || !machine.latestReading?.has_data) return null;

  const liveShot = getComparableShotNumber(machine.latestReading);
  const dbShot = getComparableShotNumber(dbReading);
  if (liveShot === null || (dbShot !== null && liveShot <= dbShot)) return null;
  if (machine.lastCatchupSavedShot === liveShot) return null;

  const readings = buildReadingsForDBFromLiveSnapshot(machine.latestReading);
  if (!Object.keys(readings).length) return null;

  const result = await saveToDB(
    machine,
    machine.latestReading.part_name || machine.partName || "",
    readings
  );
  if (!result?.queued && !result?.skipped) machine.lastCatchupSavedShot = liveShot;
  return result;
}

function getConfiguredReadingNames(machine = {}) {
  if (!Array.isArray(machine.registerConfig)) return null;
  const names = machine.registerConfig
    .filter((parameter) => parameter && parameter.enabled !== false && parameter.show_on_monitor !== false)
    .map((parameter) => String(parameter.name || "").trim())
    .filter(Boolean);
  return names.length ? new Set(names) : null;
}

function normalizeRegisterName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getConfiguredRegisterDevice(machine = {}, names = [], fallback = "") {
  const wanted = new Set(names.map(normalizeRegisterName));
  const register = Array.isArray(machine.registerConfig)
    ? machine.registerConfig.find((item) =>
        item &&
        item.enabled !== false &&
        wanted.has(normalizeRegisterName(item.name)) &&
        String(item.device || item.stringDevice || "").trim()
      )
    : null;
  return String(register?.device || register?.stringDevice || fallback || "").trim().toUpperCase();
}

function formatReadingsForClient(readings, machineOrKind = "ube") {
  const configuredNames =
    typeof machineOrKind === "object" ? getConfiguredReadingNames(machineOrKind) : null;
  const machineKind =
    typeof machineOrKind === "object"
      ? (isLeakTestMachine(machineOrKind) ? "leaktest" : "ube")
      : machineOrKind;
  const allowedNames = configuredNames ||
    (machineKind === "leaktest" ? LEAK_CLIENT_READING_NAMES : UBE_CLIENT_READING_NAMES);

  return Object.fromEntries(
    Object.entries(readings)
      .filter(([name]) => allowedNames.has(name))
      .filter(([name]) => !DROPPED_READING_COLUMNS.has(name))
      .filter(([name]) => !PARAMETER_BY_NAME.get(name)?.hidden)
      .map(([name, value]) => [name, { value, column: readingColumnName(name) }])
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// REPORT HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getRecordedDate(row = {}) {
  const date = row.recorded_at ? new Date(row.recorded_at) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getShotDate(row = {}) {
  if (row.shot_date) {
    const date = new Date(row.shot_date);
    if (!Number.isNaN(date.getTime())) {
      return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
    }
    return row.shot_date;
  }

  const year = Number(row.shot_year);
  const month = Number(row.shot_month);
  const day = Number(row.shot_day);

  if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
    const fullYear = year < 100 ? 2000 + year : year;
    return `${pad2(day)}/${pad2(month)}/${fullYear}`;
  }

  const recordedDate = getRecordedDate(row);
  if (!recordedDate) return "";
  return `${pad2(recordedDate.getDate())}/${pad2(recordedDate.getMonth() + 1)}/${recordedDate.getFullYear()}`;
}

function getShotTime(row = {}) {
  if (row.shot_time) {
    const match = String(row.shot_time).match(/T(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/) ||
      String(row.shot_time).match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (match) return `${pad2(match[1])}:${pad2(match[2])}:${pad2(match[3] ?? 0)}`;
  }

  const hour = pad2(row.shot_hour);
  const minute = pad2(row.shot_minute);
  const second = pad2(row.shot_second);

  if (hour && minute && second) return `${hour}:${minute}:${second}`;

  const recordedDate = getRecordedDate(row);
  if (!recordedDate) return "";
  return recordedDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getShotStatusLabel(value) {
  const status = Number(value);
  if (status === 1) return "OK";
  if (status === 3) return "Warm Up";
  if (status === 5) return "NG";
  return value;
}

function getReportValue(row = {}, key) {
  if (key === "shot_date_full") return getShotDate(row);
  if (key === "shot_time") return getShotTime(row);
  if (key === "shot_status" || key === "Shot Status") return getShotStatusLabel(row[key]);
  return row[key];
}

function getReportColumns(rows = []) {
  const firstRow = rows[0] || {};
  const isLeakTest = Boolean(
    firstRow.part_qr_code ||
    firstRow.body_leak_value !== undefined ||
    firstRow.cycle_end_time
  );
  return isLeakTest ? LEAK_REPORT_COLUMNS : UBE_REPORT_COLUMNS;
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeXmlValue(value) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReadingsCsv(rows, meta = {}) {
  const reportFrom = meta.from || "All available";
  const reportTo = meta.to || "All available";
  const reportColumns = getReportColumns(rows);
  const generatedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  const summaryRows = [
    ["RICO AUTO INDUSTRIES LIMITED"],
    ["PLC MACHINE PRODUCTION REPORT"],
    ["Report From", reportFrom],
    ["Report To", reportTo],
    ["Generated At", generatedAt],
    ["Total Shot", rows.length],
    [],
  ].map((row) => row.map(escapeCsvValue).join(","));

  const header = reportColumns.map(([, label]) => label).join(",");
  const lines = rows.map((row) =>
    reportColumns.map(([key]) => escapeCsvValue(getReportValue(row, key))).join(",")
  );

  return [...summaryRows, header, ...lines].join("\r\n");
}

function buildReadingsExcelXml(rows, meta = {}) {
  const reportFrom = meta.from || "All available";
  const reportTo = meta.to || "All available";
  const reportColumns = getReportColumns(rows);
  const firstRow = rows[0] || {};
  const machineName = firstRow.machine_name || firstRow.machine || meta.machine || meta.ip || "PLC Machine";
  const kpiCounts = rows.reduce(
    (acc, row) => {
      const status = Number(row.shot_status ?? row["Shot Status"]);
      if (status === 1) acc.ok += 1;
      if (status === 3) acc.warm += 1;
      if (status === 5) acc.off += 1;
      return acc;
    },
    { ok: 0, warm: 0, off: 0 }
  );
  const generatedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  const cell = (value, styleId = "", attrs = "") =>
    `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ""}${attrs}><Data ss:Type="String">${escapeXmlValue(value)}</Data></Cell>`;
  const row = (cells, attrs = "") => `<Row${attrs}>${cells.join("")}</Row>`;
  const mergeAcross = Math.max(1, reportColumns.length - 1);
  const columnXml = reportColumns.map(([key], index) => {
    const wide = ["recorded_at", "machine_name", "part_name", "shot_status"].includes(key);
    const width = index === 0 ? 130 : wide ? 120 : 92;
    return `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`;
  });
  const kpiSpan = Math.max(1, Math.floor(reportColumns.length / 4));
  const kpiMerge = Math.max(0, kpiSpan - 1);

  const summaryRows = [
    row([cell("RICO AUTO INDUSTRIES LIMITED", "Company", ` ss:MergeAcross="${mergeAcross}"`)], ' ss:Height="28"'),
    row([cell(`${machineName} Report`, "ReportTitle", ` ss:MergeAcross="${mergeAcross}"`)], ' ss:Height="26"'),
    row([cell(`${machineName} | ${reportFrom} to ${reportTo} | ${rows.length} shots`, "SubTitle", ` ss:MergeAcross="${mergeAcross}"`)], ' ss:Height="20"'),
    row([cell(`Generated At: ${generatedAt}`, "Generated", ` ss:MergeAcross="${mergeAcross}"`)], ' ss:Height="20"'),
    row([]),
    row([
      cell(`OK SHOT\n${kpiCounts.ok}`, "KpiOk", ` ss:MergeAcross="${kpiMerge}"`),
      cell(`WARM UP SHOT\n${kpiCounts.warm}`, "KpiWarm", ` ss:Index="${kpiSpan + 1}" ss:MergeAcross="${kpiMerge}"`),
      cell(`OFF SHOT\n${kpiCounts.off}`, "KpiOff", ` ss:Index="${(kpiSpan * 2) + 1}" ss:MergeAcross="${kpiMerge}"`),
      cell(`TOTAL SHOT\n${rows.length}`, "KpiTotal", ` ss:Index="${(kpiSpan * 3) + 1}" ss:MergeAcross="${Math.max(0, reportColumns.length - (kpiSpan * 3) - 1)}"`),
    ], ' ss:Height="48"'),
    row([]),
  ];

  const headerRow = row(reportColumns.map(([, label]) => cell(label, "Header")), ' ss:Height="28"');
  const dataRows = rows.map((reading, index) =>
    row(reportColumns.map(([key]) => cell(getReportValue(reading, key), index % 2 ? "DataAlt" : "Data")))
  );

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Company"><Font ss:Bold="1" ss:Size="18" ss:Color="#FFFFFF"/><Interior ss:Color="#123C69" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
    <Style ss:ID="ReportTitle"><Font ss:Bold="1" ss:Size="16" ss:Color="#0F172A"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
    <Style ss:ID="SubTitle"><Font ss:Bold="1" ss:Size="10" ss:Color="#475569"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
    <Style ss:ID="Generated"><Font ss:Bold="1" ss:Size="9" ss:Color="#64748B"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
    <Style ss:ID="KpiOk"><Font ss:Bold="1" ss:Size="12" ss:Color="#065F46"/><Interior ss:Color="#ECFDF5" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/></Borders></Style>
    <Style ss:ID="KpiWarm"><Font ss:Bold="1" ss:Size="12" ss:Color="#B45309"/><Interior ss:Color="#FFFBEB" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/></Borders></Style>
    <Style ss:ID="KpiOff"><Font ss:Bold="1" ss:Size="12" ss:Color="#BE123C"/><Interior ss:Color="#FFF1F2" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDA4AF"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDA4AF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDA4AF"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDA4AF"/></Borders></Style>
    <Style ss:ID="KpiTotal"><Font ss:Bold="1" ss:Size="12" ss:Color="#1D4ED8"/><Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFDBFE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFDBFE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFDBFE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFDBFE"/></Borders></Style>
    <Style ss:ID="Label"><Font ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#EEF5FF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
    <Style ss:ID="Meta"><Font ss:Bold="1" ss:Color="#334155"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#1E3A5F"/><Interior ss:Color="#DCEBFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#94A3B8"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
    <Style ss:ID="Data"><Font ss:Color="#0F172A"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="DataAlt"><Font ss:Color="#0F172A"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
  </Styles>
  <Worksheet ss:Name="PLC Report">
    <Table>
      ${columnXml.join("\n      ")}
      ${[...summaryRows, headerRow, ...dataRows].join("\n      ")}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>8</SplitHorizontal>
      <TopRowBottomPane>8</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
}

function buildConnectionEventsExcelXml(rows, meta = {}) {
  const reportFrom = meta.from || "All available";
  const reportTo = meta.to || "All available";
  const generatedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  const cell = (value, styleId = "") =>
    `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ""}><Data ss:Type="String">${escapeXmlValue(value)}</Data></Cell>`;
  const row = (cells) => `<Row>${cells.join("")}</Row>`;
  const header = ["Machine", "PLC IP", "Event", "Start", "End", "Duration Seconds", "Reason"];
  const dataRows = rows.map((event) =>
    row([
      cell(event.machine_name),
      cell(event.plc_ip),
      cell(event.event_type),
      cell(event.started_at),
      cell(event.ended_at || "Running"),
      cell(event.duration_seconds),
      cell(event.reason),
    ])
  );

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
    <Style ss:ID="Label"><Font ss:Bold="1"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCE8FF" ss:Pattern="Solid"/></Style>
  </Styles>
  <Worksheet ss:Name="PLC Connectivity">
    <Table>
      ${[
      row([cell("Rico Auto Industries Limited", "Title")]),
      row([cell("PLC Connectivity Report", "Title")]),
      row([cell("Report From", "Label"), cell(reportFrom)]),
      row([cell("Report To", "Label"), cell(reportTo)]),
      row([cell("Generated At", "Label"), cell(generatedAt)]),
      row([cell("Total Shot", "Label"), cell(rows.length)]),
      row([]),
      row(header.map((label) => cell(label, "Header"))),
      ...dataRows,
    ].join("\n      ")}
    </Table>
  </Worksheet>
</Workbook>`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DB QUERIES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getLatestReadingsForMachines(machineSnapshots = getMachines()) {
  await ensureTableOnce();

  const machines = machineSnapshots.length ? machineSnapshots : getMachines();
  const ubeMachines = machines.filter((m) => isUbeMachine(m));
  const leakMachines = machines.filter((m) => isLeakTestMachine(m));
  const rowByKey = new Map();

  if (ubeMachines.length) {
    for (const machine of ubeMachines) {
      const machineKey = machine.key || machine.ip;
      const machineIp = machine.ip || machine.key;
      const { rows } = await db.query(
        `SELECT TOP 1 *
         FROM ${TABLE}
         WHERE machine_key = ?
            OR plc_ip = ?
            OR plc_ip = ?
         ORDER BY recorded_at DESC, id DESC`,
        [machineKey, machineIp, machineKey]
      );
      if (rows[0]) {
        rowByKey.set(String(machineKey), rows[0]);
      }
    }
  }

  if (leakMachines.length) {
    const machineTargets = Array.from(
      new Map(
        leakMachines
          .filter((m) => m.ip)
          .map((m) => [m.ip, { ip: m.ip, port: Number(m.port || 1027) }])
      ).values()
    );
    const valuesSql = machineTargets.map(() => "(?, ?)").join(", ");
    const values = machineTargets.flatMap((target) => [target.ip, target.port]);

    const { rows } = await db.query(
      `WITH target_machines(plc_ip, plc_port) AS (
        SELECT * FROM (VALUES ${valuesSql}) AS target(plc_ip, plc_port)
      )
      SELECT latest.*
      FROM target_machines target
      OUTER APPLY (
        SELECT TOP 1
          leak.[Id] AS id,
          CAST(leak.[Cycle_End_Time] AS DATETIME2(3)) AS recorded_at,
          CAST(leak.[Cycle_End_Time] AS DATETIME2(3)) AS cycle_end_time,
          leak.[Machine] AS machine_name,
          leak.[PLC_IP] AS plc_ip,
          target.plc_port AS plc_port,
          leak.[Machine] AS machine,
          leak.[PLC_IP] AS ip,
          leak.[Status] AS status,
          leak.[Part_QR_Code] AS part_name,
          leak.[Part_QR_Code] AS part_qr_code,
          leak.[Part_QR_Code] AS scan_data,
          leak.[Body_Leak_Value] AS body_leak_value,
          leak.[Gall_1] AS gall_1,
          leak.[Gall_2] AS gall_2,
          leak.[Result] AS result,
          leak.[Running_Mode] AS running_mode,
          leak.[Manual] AS manual,
          leak.[Dry] AS dry,
          leak.[Wey] AS wey,
          leak.[Both] AS both,
          leak.[Cycle_Time] AS cycle_time
        FROM ${LEAK_TEST_TABLE} leak
        WHERE leak.[PLC_IP] = target.plc_ip
        ORDER BY leak.[Cycle_End_Time] DESC, leak.[Id] DESC
      ) latest
      WHERE latest.id IS NOT NULL
      ORDER BY latest.plc_ip`,
      values
    );
    rows.forEach((row) => rowByKey.set(String(row.plc_ip), row));
  }

  const results = [];
  for (const machine of machines) {
    const dbReading = formatDbReading(
      rowByKey.get(machine.key || machine.ip) || rowByKey.get(machine.ip),
      machine
    );
    results.push(chooseFreshestReading(dbReading, machine));
  }

  return results;
}

async function getReadingHistory({ ip, limit = 200, from, to } = {}) {
  await ensureTableOnce();

  const safeLimit = clampLimit(limit);
  const targetId = ip || "";
  const configuredMachines = await getConfiguredMachines();
  const targetMachine = configuredMachines.find(
    (m) => (m.key || m.ip) === targetId || m.ip === targetId
  );

  if (!targetId) {
    const filters = [];
    const values = [];
    if (from) { filters.push("recorded_at >= ?"); values.push(from); }
    if (to) { filters.push("recorded_at < DATEADD(day, 1, CAST(? AS date))"); values.push(to); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { rows } = await db.query(
      `SELECT TOP (${safeLimit}) *
       FROM ${TABLE}
       ${where}
       ORDER BY recorded_at DESC, id DESC`,
      values
    );
    return sortHistoryRows(rows.map(formatDbRowForClient));
  }

  if (targetMachine?.kind === "leaktest") {
    const filters = ["PLC_IP = ?"];
    const values = [targetMachine.ip || targetId];
    if (from) { filters.push("CAST(Cycle_End_Time AS DATETIME2(3)) >= ?"); values.push(from); }
    if (to) { filters.push("CAST(Cycle_End_Time AS DATETIME2(3)) < DATEADD(day, 1, CAST(? AS date))"); values.push(to); }
    values.push(Number(targetMachine.port || 1027));

    const { rows } = await db.query(
      `WITH leak_rows AS (
        SELECT
          [Id],[Machine],[PLC_IP],[Status],[Cycle_End_Time],[Part_QR_Code],
          [Body_Leak_Value],[Gall_1],[Gall_2],[Result],[Running_Mode],
          [Manual],[Dry],[Wey],[Both],[Cycle_Time],
          ROW_NUMBER() OVER (
            PARTITION BY [PLC_IP],
              CASE
                WHEN NULLIF(LTRIM(RTRIM([Part_QR_Code])), N'') IS NOT NULL THEN [Part_QR_Code]
                ELSE CONCAT(N'noqr-', [Id])
              END
            ORDER BY [Cycle_End_Time] DESC, [Id] DESC
          ) AS duplicate_rank
        FROM ${LEAK_TEST_TABLE}
        WHERE ${filters.join(" AND ")}
      )
      SELECT TOP (${safeLimit})
        [Id] AS id,
        CAST([Cycle_End_Time] AS DATETIME2(3)) AS recorded_at,
        CAST([Cycle_End_Time] AS DATETIME2(3)) AS cycle_end_time,
        [Machine] AS machine_name, [PLC_IP] AS plc_ip, ? AS plc_port,
        [Machine] AS machine, [PLC_IP] AS ip, [Status] AS status,
        [Part_QR_Code] AS part_name, [Part_QR_Code] AS part_qr_code,
        [Part_QR_Code] AS scan_data, [Body_Leak_Value] AS body_leak_value,
        [Gall_1] AS gall_1, [Gall_2] AS gall_2, [Result] AS result,
        [Running_Mode] AS running_mode, [Manual] AS manual, [Dry] AS dry,
        [Wey] AS wey, [Both] AS both, [Cycle_Time] AS cycle_time
      FROM leak_rows
      WHERE duplicate_rank = 1
      ORDER BY Cycle_End_Time DESC, Id DESC`,
      values
    );
    return sortHistoryRows(rows.map(formatDbRowForClient));
  }

  const machineKey = targetMachine?.key || targetMachine?.machine_key || targetId;
  const machineIp = targetMachine?.ip || targetMachine?.plc_ip || targetId;
  const legacyKey = targetId;
  const filters = ["(machine_key = ? OR plc_ip = ? OR plc_ip = ?)"];
  const values = [machineKey, machineIp, legacyKey];
  if (from) { filters.push("recorded_at >= ?"); values.push(from); }
  if (to) { filters.push("recorded_at < DATEADD(day, 1, CAST(? AS date))"); values.push(to); }

  const { rows } = await db.query(
    `SELECT TOP (${safeLimit}) *
     FROM ${TABLE}
     WHERE ${filters.join(" AND ")}
     ORDER BY recorded_at DESC, id DESC`,
    values
  );
  return sortHistoryRows(rows.map(formatDbRowForClient));
}

async function getConnectionEvents({ ip, limit = 200, from, to } = {}) {
  await ensureTableOnce();

  const safeLimit = clampLimit(limit);
  const filters = ["1 = 1"];
  const values = [];

  if (ip) { filters.push("(machine_key = ? OR plc_ip = ?)"); values.push(ip, ip); }
  if (from) { filters.push("started_at >= ?"); values.push(from); }
  if (to) { filters.push("started_at < DATEADD(day, 1, CAST(? AS date))"); values.push(to); }

  const { rows } = await db.query(
    `SELECT TOP (${safeLimit}) * FROM ${CONNECTION_EVENTS_TABLE}
     WHERE ${filters.join(" AND ")}
     ORDER BY started_at DESC, id DESC`,
    values
  );
  return rows;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DB SAVE â€” UBE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const inFlightUbeSaveKeys = new Set();

async function calculateCompletedMinorStoppageMachine(machine, readings = {}) {
  if (String(process.env.PLC_MINOR_STOPPAGE_MACHINE_ENABLED || "false").toLowerCase() !== "true") {
    return null;
  }
  const currentShotAt = normalizeReadingForDB("shot_datetime", readings.shot_datetime);
  if (!currentShotAt) return null;

  const { rows } = await db.query(
    `SELECT TOP 1
       id,
       COALESCE(shot_datetime, recorded_at) AS previous_shot_at,
       TRY_CONVERT(DECIMAL(18,2), cycle_time) AS previous_cycle_time
     FROM ${TABLE}
     WHERE (machine_key = ? OR plc_ip = ?)
       AND COALESCE(shot_datetime, recorded_at) < ?
     ORDER BY COALESCE(shot_datetime, recorded_at) DESC, id DESC`,
    [machine.key || machine.ip, machine.ip, currentShotAt]
  );

  const previousRow = rows[0] || null;
  const previousShotAt = previousRow?.previous_shot_at ? new Date(previousRow.previous_shot_at) : null;
  const previousCycleTime = Number(previousRow?.previous_cycle_time);
  const currentShotDate = new Date(currentShotAt);
  if (
    !previousRow ||
    !previousShotAt ||
    Number.isNaN(previousShotAt.getTime()) ||
    Number.isNaN(currentShotDate.getTime()) ||
    !Number.isFinite(previousCycleTime)
  ) {
    return null;
  }

  const shotGapSeconds = (currentShotDate.getTime() - previousShotAt.getTime()) / 1000;
  const stoppageSeconds = shotGapSeconds - previousCycleTime;
  if (!Number.isFinite(stoppageSeconds)) return null;
  return {
    previousId: previousRow.id,
    value: Number(Math.max(0, stoppageSeconds).toFixed(2)),
  };
}

async function updatePreviousMinorStoppageMachine(machine, readings = {}) {
  if (String(process.env.PLC_MINOR_STOPPAGE_MACHINE_ENABLED || "false").toLowerCase() !== "true") {
    return null;
  }
  const completed = await calculateCompletedMinorStoppageMachine(machine, readings);
  if (!completed) return null;

  await db.run(
    `UPDATE ${TABLE}
     SET [minor_stoppage_machine] = ?
     WHERE [id] = ?`,
    [completed.value, completed.previousId]
  );
  return completed.value;
}

function buildUbeTimestampSaveKey(machine, readings = {}) {
  const machineKey = machine.key || machine.ip;
  const shotNumber = normalizeReadingForDB("shot_number", readings.shot_number ?? readings["SHOT NO."]);
  const shotDate = normalizeReadingForDB("shot_date", readings.shot_date);
  if (shotNumber !== null && shotNumber !== undefined && shotDate) {
    return `${machineKey}:shot:${shotDate}:${shotNumber}`;
  }

  const shotTime = normalizeReadingForDB("shot_time", readings.shot_time);
  if (shotDate && shotTime) return `${machineKey}:${shotDate}:${shotTime}`;

  const cycleEndTime = normalizeReadingForDB("cycle_end_time", readings.cycle_end_time);
  if (cycleEndTime) return `${machineKey}:cycle-end:${cycleEndTime}`;

  const shotDateTime = normalizeReadingForDB("shot_datetime", readings.shot_datetime);
  return shotDateTime ? `${machineKey}:${shotDateTime}` : null;
}

async function applyCycleMinorStoppage(machine, readings = {}) {
  readings.minor_stoppage = 0;
  readings["MINOR STOPPAGE sec."] = 0;

  const currentCycleStart = normalizeReadingForDB("cycle_start_time", readings.cycle_start_time);
  if (!currentCycleStart) return;

  const { rows } = await db.query(
    `SELECT TOP 1 cycle_end_time
     FROM ${TABLE}
     WHERE (machine_key = ? OR plc_ip = ?)
       AND cycle_end_time IS NOT NULL
       AND cycle_end_time <= ?
     ORDER BY cycle_end_time DESC, id DESC`,
    [machine.key || machine.ip, machine.ip, currentCycleStart]
  );

  const previousCycleEnd = rows[0]?.cycle_end_time ? new Date(rows[0].cycle_end_time) : null;
  const currentStartDate = new Date(currentCycleStart);
  if (
    !previousCycleEnd ||
    Number.isNaN(previousCycleEnd.getTime()) ||
    Number.isNaN(currentStartDate.getTime())
  ) {
    return;
  }

  const stoppageSeconds = (currentStartDate.getTime() - previousCycleEnd.getTime()) / 1000;
  if (!Number.isFinite(stoppageSeconds)) return;

  const value = Number(Math.max(0, stoppageSeconds).toFixed(2));
  readings.minor_stoppage = value;
  readings["MINOR STOPPAGE sec."] = value;
}

async function saveToDB(machine, partName, readings) {
  const saveKey = buildUbeTimestampSaveKey(machine, readings);
  if (saveKey) {
    if (inFlightUbeSaveKeys.has(saveKey)) {
      return { skipped: true, reason: "duplicate-cycle-in-flight" };
    }
    inFlightUbeSaveKeys.add(saveKey);
  }

  try {
    return await saveToDBUnlocked(machine, partName, readings);
  } finally {
    if (saveKey) inFlightUbeSaveKeys.delete(saveKey);
  }
}

async function saveToDBUnlocked(machine, partName, readings) {
  const columns = ["recorded_at", "machine_key", "machine_name", "plc_ip", "plc_port", "part_name"];
  await applyCycleMinorStoppage(machine, readings);

  const plcRecordedAt =
    normalizeReadingForDB("cycle_end_time", readings.cycle_end_time) ||
    normalizeReadingForDB("shot_datetime", readings.shot_datetime);
  const shotDate = normalizeReadingForDB("shot_date", readings.shot_date);
  const shotTime = normalizeReadingForDB("shot_time", readings.shot_time);
  const shotNumber = normalizeReadingForDB("shot_number", readings.shot_number ?? readings["SHOT NO."]);
  const hasPlcRecordedAt = Boolean(plcRecordedAt);

  if (!hasPlcRecordedAt) {
    return { skipped: true, reason: "missing-plc-shot-datetime" };
  }

  readings.minor_stoppage_machine = null;

  if (shotNumber !== null && shotNumber !== undefined && shotDate) {
    const { rows: duplicateShotRows } = await db.query(
      `SELECT TOP 1 id FROM ${TABLE}
       WHERE (machine_key = ? OR plc_ip = ?)
         AND shot_date = ?
         AND shot_number = ?
       ORDER BY recorded_at DESC, id DESC`,
      [machine.key || machine.ip, machine.ip, shotDate, shotNumber]
    );
    if (duplicateShotRows.length) return { skipped: true, reason: "duplicate-shot-number" };
  }

  if ((shotDate && shotTime) || hasPlcRecordedAt) {
    const duplicateFilters = [
      "(machine_key = ? OR plc_ip = ?)",
    ];
    const duplicateValues = [machine.key || machine.ip, machine.ip];

    if (shotDate && shotTime) {
      duplicateFilters.push("shot_date = ?");
      duplicateFilters.push("shot_time = ?");
      duplicateValues.push(shotDate, shotTime);
    } else if (hasPlcRecordedAt) {
      duplicateFilters.push("ABS(DATEDIFF(second, recorded_at, ?)) <= ?");
      duplicateValues.push(plcRecordedAt, Number(process.env.PLC_DUPLICATE_SHOT_WINDOW_SEC || 15));
    }

    const { rows: duplicateRows } = await db.query(
      `SELECT TOP 1 id FROM ${TABLE}
       WHERE ${duplicateFilters.join(" AND ")}
       ORDER BY recorded_at DESC, id DESC`,
      duplicateValues
    );
    if (duplicateRows.length) return { skipped: true, reason: "duplicate-cycle-timestamp" };
  }

  const values = [
    plcRecordedAt,
    machine.key || machine.ip,
    machine.name,
    machine.ip,
    machine.port,
    partName,
  ];

  for (const [name, value] of Object.entries(readings)) {
    if (DROPPED_READING_COLUMNS.has(name)) continue;
    const normalizedValue = normalizeReadingForDB(name, value);
    addInsertValue(columns, values, readingColumnName(name), normalizedValue);
    const legacyColumn = LEGACY_COLUMNS_BY_PARAMETER[name];
    if (legacyColumn) addInsertValue(columns, values, legacyColumn, normalizedValue);
  }

  const savedReadings = Object.fromEntries(
    Object.entries(readings).filter(([name]) => !DROPPED_READING_COLUMNS.has(name))
  );
  addInsertValue(columns, values, "raw_readings_json", JSON.stringify(savedReadings));

  const placeholders = values.map(() => "?").join(", ");
  const columnSql = columns
    .map((col) =>
      col.includes(" ") || col.includes("/") || col.includes(".") ||
        col.includes("-") || col.includes("(")
        ? sqlColumn(col)
        : `[${col}]`
    )
    .join(", ");

  await db.run(`INSERT INTO ${TABLE} (${columnSql}) VALUES (${placeholders})`, values);
  await updatePreviousMinorStoppageMachine(machine, readings);
  return { skipped: false };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DB SAVE â€” LEAK TEST
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function saveLeakTestToDB(machine, partName, readings) {
  const recordedAtDate = readings.cycle_end_time ? new Date(readings.cycle_end_time) : new Date();
  const recordedAt = systemDateTimeString(recordedAtDate);
  const runningMode = Number(readings.auto_bit) === 1 ? "AUTO" : "MANUAL";
  const result = normalizeLeakResult(readings.result);
  const status = result || null;
  const partQrCode = partName || readings.part_qr_code || readings.scan_data || null;
  const bodyLeakValue = normalizeReadingForDB("body_leak_value", readings.body_leak_value);
  const gall1 = normalizeReadingForDB("gall_1", readings.gall_1);
  const gall2 = normalizeReadingForDB("gall_2", readings.gall_2);
  const cycleTime = Number.parseInt(readings.cycle_time, 10) || null;
  const hasPartQrCode = Boolean(String(partQrCode || "").trim());

  if (hasPartQrCode) {
    const { rows: partDupRows } = await db.query(
      `SELECT TOP 1 [Id] FROM ${LEAK_TEST_TABLE}
       WHERE [PLC_IP] = ?
         AND [Part_QR_Code] = ?
         AND [Cycle_End_Time] >= DATEADD(second, -?, SYSDATETIME())
       ORDER BY [Cycle_End_Time] DESC, [Id] DESC`,
      [machine.ip, partQrCode, LEAK_QR_DUPLICATE_WINDOW_SEC]
    );
    if (partDupRows.length) return { skipped: true, reason: "duplicate-part-qr" };
  }

  const { rows: dupRows } = await db.query(
    `SELECT TOP 1 [Id] FROM ${LEAK_TEST_TABLE}
     WHERE [PLC_IP] = ?
       AND ABS(DATEDIFF(second, [Cycle_End_Time], ?)) <= ?
       AND ISNULL([Part_QR_Code], N'') = ISNULL(?, N'')
       AND ISNULL([Result], N'') = ISNULL(?, N'')
       AND (([Body_Leak_Value] IS NULL AND ? IS NULL) OR ABS([Body_Leak_Value] - ?) < 0.001)
       AND (([Gall_1] IS NULL AND ? IS NULL) OR ABS([Gall_1] - ?) < 0.001)
       AND (([Gall_2] IS NULL AND ? IS NULL) OR ABS([Gall_2] - ?) < 0.001)`,
    [
      machine.ip, recordedAt, LEAK_DUPLICATE_WINDOW_SEC,
      partQrCode, result,
      bodyLeakValue, bodyLeakValue,
      gall1, gall1,
      gall2, gall2,
    ]
  );
  if (dupRows.length) return { skipped: true, reason: "duplicate" };

  await db.run(
    `INSERT INTO ${LEAK_TEST_TABLE} (
      [Machine],[PLC_IP],[Status],[Cycle_End_Time],[Part_QR_Code],
      [Result],[Body_Leak_Value],[Gall_1],[Gall_2],[Cycle_Time],
      [Running_Mode],[Manual],[Dry],[Wey],[Both]
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      machine.name, machine.ip, status || "CYCLE COMPLETE", recordedAt, partQrCode,
      result, bodyLeakValue, gall1, gall2, cycleTime,
      runningMode,
      Number(readings.manual) === 1 ? 1 : 0,
      Number(readings.dry) === 1 ? 1 : 0,
      Number(readings.wey) === 1 ? 1 : 0,
      Number(readings.both) === 1 ? 1 : 0,
    ]
  );
  return { skipped: false };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SCHEMA ENSURE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function ensureTable() {
  await db.run(`
IF COL_LENGTH('${TABLE}', 'cycle_start_time') IS NULL ALTER TABLE ${TABLE} ADD [cycle_start_time] DATETIME2(3) NULL;
IF COL_LENGTH('${TABLE}', 'cycle_end_time') IS NULL ALTER TABLE ${TABLE} ADD [cycle_end_time] DATETIME2(3) NULL;
IF COL_LENGTH('${TABLE}', 'cycle_duration') IS NULL ALTER TABLE ${TABLE} ADD [cycle_duration] DECIMAL(18,2) NULL;
IF COL_LENGTH('${TABLE}', 'actual_cycle_time') IS NULL ALTER TABLE ${TABLE} ADD [actual_cycle_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('${TABLE}', 'plc_cycle_time') IS NULL ALTER TABLE ${TABLE} ADD [plc_cycle_time] DECIMAL(18,2) NULL;
`);

  const columnDefinitions = [
    ...getReadingNames().map((name) => [name, readingSqlType(name)]),
    ...Array.from(new Set(Object.values(LEGACY_COLUMNS_BY_PARAMETER))).map((name) => [
      name,
      legacySqlType(name),
    ]),
    ...EXTRA_READING_COLUMNS,
    ...M_BIT_DURATION_COLUMNS,
  ]
    .map((name) => {
      const columnName = Array.isArray(name) ? name[0] : name;
      const columnType = Array.isArray(name) ? name[1] : readingSqlType(name);
      const column = readingColumnName(columnName);
      return `
IF COL_LENGTH('${TABLE}', '${column}') IS NULL
BEGIN
  ALTER TABLE ${TABLE} ADD ${sqlColumn(columnName)} ${columnType} NULL
END`;
    })
    .join("\n");

  const decimalAlterSql = getReadingNames()
    .filter((name) => readingSqlType(name).startsWith("DECIMAL("))
    .map((name) => {
      const column = readingColumnName(name);
      const columnType = readingSqlType(name);
      return `
IF COL_LENGTH('${TABLE}', '${column}') IS NOT NULL
BEGIN
  ALTER TABLE ${TABLE} ALTER COLUMN ${sqlColumn(name)} ${columnType} NULL
END`;
    })
    .join("\n");

  const twoDigitAlterSql = Array.from(TWO_DIGIT_READING_COLUMNS)
    .map(
      (name) => `
IF COL_LENGTH('${TABLE}', '${name}') IS NOT NULL
BEGIN
  UPDATE ${TABLE}
  SET [${name}] = RIGHT('00' + CAST(ABS(TRY_CONVERT(INT, [${name}])) % 100 AS VARCHAR(2)), 2)
  WHERE [${name}] IS NOT NULL
    AND TRY_CONVERT(INT, [${name}]) IS NOT NULL
  ALTER TABLE ${TABLE} ALTER COLUMN [${name}] NVARCHAR(2) NULL
END`
    )
    .join("\n");

  const canonicalDataMigrationSql = Object.entries(LEGACY_COLUMNS_BY_PARAMETER)
    .map(
      ([sourceName, targetName]) => `
IF COL_LENGTH('${TABLE}', '${targetName.replace(/'/g, "''")}') IS NOT NULL AND COL_LENGTH('${TABLE}', '${sourceName.replace(/'/g, "''")}') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE}
    SET ${sqlColumn(targetName)} = COALESCE(${sqlColumn(targetName)}, TRY_CONVERT(${legacySqlType(targetName)}, ${sqlColumn(sourceName)}))
    WHERE ${sqlColumn(targetName)} IS NULL`)}
END`
    )
    .join("\n");

  const duplicateDataMigrationSql = `
${canonicalDataMigrationSql}

IF COL_LENGTH('${TABLE}', 'shot_number') IS NOT NULL AND COL_LENGTH('${TABLE}', 'Counter') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE} SET [shot_number] = COALESCE([shot_number], TRY_CONVERT(INT, [Counter])) WHERE [shot_number] IS NULL`)}
END

IF COL_LENGTH('${TABLE}', 'ok_shot') IS NOT NULL AND COL_LENGTH('${TABLE}', 'high_shot_count') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE} SET [ok_shot] = COALESCE([ok_shot], TRY_CONVERT(INT, [high_shot_count])) WHERE [ok_shot] IS NULL`)}
END

IF COL_LENGTH('${TABLE}', 'ok_shot') IS NOT NULL AND COL_LENGTH('${TABLE}', 'HIGH SHOT COUNT value') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE} SET [ok_shot] = COALESCE([ok_shot], TRY_CONVERT(INT, [HIGH SHOT COUNT value])) WHERE [ok_shot] IS NULL`)}
END

IF COL_LENGTH('${TABLE}', 'ng_shot') IS NOT NULL AND COL_LENGTH('${TABLE}', 'ng_counter') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE} SET [ng_shot] = COALESCE([ng_shot], TRY_CONVERT(INT, [ng_counter])) WHERE [ng_shot] IS NULL`)}
END

IF COL_LENGTH('${TABLE}', 'ng_counter') IS NOT NULL AND COL_LENGTH('${TABLE}', 'ng_shot') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE} SET [ng_counter] = COALESCE([ng_counter], TRY_CONVERT(INT, [ng_shot])) WHERE [ng_counter] IS NULL`)}
END

IF COL_LENGTH('${TABLE}', 'ng_counter') IS NOT NULL AND COL_LENGTH('${TABLE}', 'NG COUNTER value') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE} SET [ng_counter] = COALESCE([ng_counter], TRY_CONVERT(INT, [NG COUNTER value])) WHERE [ng_counter] IS NULL`)}
END

IF COL_LENGTH('${TABLE}', 'ng_shot') IS NOT NULL AND COL_LENGTH('${TABLE}', 'NG COUNTER value') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE} SET [ng_shot] = COALESCE([ng_shot], TRY_CONVERT(INT, [NG COUNTER value])) WHERE [ng_shot] IS NULL`)}
END`;

  const shotDateDataMigrationSql = `
IF COL_LENGTH('${TABLE}', 'shot_date') IS NOT NULL
  AND COL_LENGTH('${TABLE}', 'shot_year') IS NOT NULL
  AND COL_LENGTH('${TABLE}', 'shot_month') IS NOT NULL
  AND COL_LENGTH('${TABLE}', 'shot_day') IS NOT NULL
BEGIN
  ${dynamicSql(`UPDATE ${TABLE}
    SET [shot_date] = COALESCE([shot_date], TRY_CONVERT(date, CONCAT(
      CASE
        WHEN TRY_CONVERT(INT, [shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, [shot_year])
        ELSE TRY_CONVERT(INT, [shot_year])
      END,
      '-',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_month]) AS VARCHAR(2)), 2),
      '-',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_day]) AS VARCHAR(2)), 2)
    ))),
    [shot_time] = COALESCE([shot_time], TRY_CONVERT(time(0), CONCAT(
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_hour]) AS VARCHAR(2)), 2),
      ':',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_minute]) AS VARCHAR(2)), 2),
      ':',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_second]) AS VARCHAR(2)), 2)
    ))),
    [shot_datetime] = COALESCE([shot_datetime], TRY_CONVERT(datetime2(0), CONCAT(
      CASE
        WHEN TRY_CONVERT(INT, [shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, [shot_year])
        ELSE TRY_CONVERT(INT, [shot_year])
      END,
      '-',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_month]) AS VARCHAR(2)), 2),
      '-',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_day]) AS VARCHAR(2)), 2),
      'T',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_hour]) AS VARCHAR(2)), 2),
      ':',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_minute]) AS VARCHAR(2)), 2),
      ':',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_second]) AS VARCHAR(2)), 2)
    ))),
    [recorded_at] = COALESCE(TRY_CONVERT(datetime2(0), CONCAT(
      CASE
        WHEN TRY_CONVERT(INT, [shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, [shot_year])
        ELSE TRY_CONVERT(INT, [shot_year])
      END,
      '-',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_month]) AS VARCHAR(2)), 2),
      '-',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_day]) AS VARCHAR(2)), 2),
      'T',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_hour]) AS VARCHAR(2)), 2),
      ':',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_minute]) AS VARCHAR(2)), 2),
      ':',
      RIGHT('00' + CAST(TRY_CONVERT(INT, [shot_second]) AS VARCHAR(2)), 2)
    )), [recorded_at])
    WHERE TRY_CONVERT(INT, [shot_year]) IS NOT NULL
      AND TRY_CONVERT(INT, [shot_month]) BETWEEN 1 AND 12
      AND TRY_CONVERT(INT, [shot_day]) BETWEEN 1 AND 31
      AND TRY_CONVERT(INT, [shot_hour]) BETWEEN 0 AND 23
      AND TRY_CONVERT(INT, [shot_minute]) BETWEEN 0 AND 59
      AND TRY_CONVERT(INT, [shot_second]) BETWEEN 0 AND 59`)}
END

${dynamicSql(`CREATE OR ALTER TRIGGER dbo.trg_PlcCycleReadings_ShotDate
ON ${TABLE}
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE target
  SET [shot_date] = COALESCE(target.[shot_date], TRY_CONVERT(date, CONCAT(
    CASE
      WHEN TRY_CONVERT(INT, target.[shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, target.[shot_year])
      ELSE TRY_CONVERT(INT, target.[shot_year])
    END,
    '-',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_month]) AS VARCHAR(2)), 2),
    '-',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_day]) AS VARCHAR(2)), 2)
  ))),
  [shot_time] = COALESCE(target.[shot_time], TRY_CONVERT(time(0), CONCAT(
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_hour]) AS VARCHAR(2)), 2),
    ':',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_minute]) AS VARCHAR(2)), 2),
    ':',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_second]) AS VARCHAR(2)), 2)
  ))),
  [shot_datetime] = COALESCE(target.[shot_datetime], TRY_CONVERT(datetime2(0), CONCAT(
    CASE
      WHEN TRY_CONVERT(INT, target.[shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, target.[shot_year])
      ELSE TRY_CONVERT(INT, target.[shot_year])
    END,
    '-',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_month]) AS VARCHAR(2)), 2),
    '-',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_day]) AS VARCHAR(2)), 2),
    'T',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_hour]) AS VARCHAR(2)), 2),
    ':',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_minute]) AS VARCHAR(2)), 2),
    ':',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_second]) AS VARCHAR(2)), 2)
  ))),
  [recorded_at] = COALESCE(TRY_CONVERT(datetime2(0), CONCAT(
    CASE
      WHEN TRY_CONVERT(INT, target.[shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, target.[shot_year])
      ELSE TRY_CONVERT(INT, target.[shot_year])
    END,
    '-',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_month]) AS VARCHAR(2)), 2),
    '-',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_day]) AS VARCHAR(2)), 2),
    'T',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_hour]) AS VARCHAR(2)), 2),
    ':',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_minute]) AS VARCHAR(2)), 2),
    ':',
    RIGHT('00' + CAST(TRY_CONVERT(INT, target.[shot_second]) AS VARCHAR(2)), 2)
  )), target.[recorded_at])
  FROM ${TABLE} target
  INNER JOIN inserted i ON i.[id] = target.[id]
  WHERE TRY_CONVERT(INT, target.[shot_year]) IS NOT NULL
    AND TRY_CONVERT(INT, target.[shot_month]) BETWEEN 1 AND 12
    AND TRY_CONVERT(INT, target.[shot_day]) BETWEEN 1 AND 31
    AND TRY_CONVERT(INT, target.[shot_hour]) BETWEEN 0 AND 23
    AND TRY_CONVERT(INT, target.[shot_minute]) BETWEEN 0 AND 59
    AND TRY_CONVERT(INT, target.[shot_second]) BETWEEN 0 AND 59;
END`)}`;

  const dropDuplicateColumnsSql = Array.from(DROPPED_READING_COLUMNS)
    .map(
      (name) => `
IF COL_LENGTH('${TABLE}', '${name.replace(/'/g, "''")}') IS NOT NULL
BEGIN
  ${dynamicSql(`ALTER TABLE ${TABLE} DROP COLUMN ${sqlColumn(name)}`)}
END`
    )
    .join("\n");

  const leakTestDropColumns = [
    "machine_key", "raw_readings_json", "recorded_at", "created_at", "machine_name",
    "plc_port", "part_name", "scan_data", "cycle_start", "cycle_end", "auto_mode",
    "manual_mode", "dry_mode", "wey_mode", "both_mode",
  ];

  const plcDropColumns = [
    "scan_data", "body_leak_value", "gall_1", "gall_2", "result", "cycle_start",
    "auto_mode", "dry_mode", "wey_mode", "both_mode",
  ];

  const buildDropColumnSql = (table, prefix, columns) =>
    columns
      .map(
        (column) => `
IF COL_LENGTH('${table}', '${column}') IS NOT NULL
BEGIN
  DECLARE @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_drop_indexes NVARCHAR(MAX) = N''
  SELECT @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_drop_indexes = @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_drop_indexes
    + N'DROP INDEX [' + i.name + N'] ON ${table};'
  FROM sys.indexes i
  INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
  INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
  WHERE i.object_id = OBJECT_ID(N'${table}')
    AND c.name = N'${column}'
    AND i.is_primary_key = 0
    AND i.is_unique_constraint = 0
  IF @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_drop_indexes <> N''
  BEGIN
    EXEC sp_executesql @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_drop_indexes
  END
  DECLARE @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_constraint NVARCHAR(128)
  SELECT @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_constraint = dc.name
  FROM sys.default_constraints dc
  INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
  WHERE dc.parent_object_id = OBJECT_ID(N'${table}')
    AND c.name = N'${column}'
  IF @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_constraint IS NOT NULL
  BEGIN
    EXEC(N'ALTER TABLE ${table} DROP CONSTRAINT [' + @${prefix}_${column.replace(/[^a-zA-Z0-9]/g, "_")}_constraint + N']')
  END
  ALTER TABLE ${table} DROP COLUMN [${column}]
END`
      )
      .join("\n");

  await db.run(`
IF OBJECT_ID(N'dbo.PlcCycleReadingsIdSeq', N'SO') IS NULL
BEGIN
  EXEC(N'CREATE SEQUENCE dbo.PlcCycleReadingsIdSeq AS BIGINT START WITH 1 INCREMENT BY 1')
END

IF OBJECT_ID(N'dbo.PlcConnectionEventsIdSeq', N'SO') IS NULL
BEGIN
  EXEC(N'CREATE SEQUENCE dbo.PlcConnectionEventsIdSeq AS BIGINT START WITH 1 INCREMENT BY 1')
END

IF OBJECT_ID(N'${TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${TABLE} (
    [id] BIGINT NOT NULL CONSTRAINT [DF_PlcCycleReadings_id] DEFAULT NEXT VALUE FOR dbo.PlcCycleReadingsIdSeq,
    [recorded_at] DATETIME2(3) NOT NULL CONSTRAINT [DF_PlcCycleReadings_recorded_at] DEFAULT SYSDATETIME(),
    [created_at] DATETIME2(3) NOT NULL CONSTRAINT [DF_PlcCycleReadings_created_at] DEFAULT SYSUTCDATETIME(),
    [machine_key] NVARCHAR(80) NULL,
    [machine_name] NVARCHAR(100) NULL,
    [plc_ip] NVARCHAR(45) NULL,
    [plc_port] INT NULL,
    [part_name] NVARCHAR(100) NULL,
    CONSTRAINT [PK_PlcCycleReadings] PRIMARY KEY CLUSTERED ([id] DESC)
  )
END

IF OBJECT_ID(N'${CONNECTION_EVENTS_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${CONNECTION_EVENTS_TABLE} (
    [id] BIGINT NOT NULL CONSTRAINT [DF_PlcConnectionEvents_id] DEFAULT NEXT VALUE FOR dbo.PlcConnectionEventsIdSeq,
    [machine_key] NVARCHAR(80) NULL,
    [machine_name] NVARCHAR(100) NULL,
    [plc_ip] NVARCHAR(45) NULL,
    [plc_port] INT NULL,
    [event_type] NVARCHAR(40) NOT NULL,
    [started_at] DATETIME2(3) NOT NULL,
    [ended_at] DATETIME2(3) NULL,
    [duration_seconds] INT NULL,
    [reason] NVARCHAR(400) NULL,
    [created_at] DATETIME2(3) NOT NULL CONSTRAINT [DF_PlcConnectionEvents_created_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_PlcConnectionEvents] PRIMARY KEY CLUSTERED ([id] DESC)
  )
END

IF COL_LENGTH('${TABLE}', 'created_at') IS NULL
BEGIN
  ALTER TABLE ${TABLE} ADD [created_at] DATETIME2(3) NOT NULL CONSTRAINT [DF_PlcCycleReadings_created_at] DEFAULT SYSUTCDATETIME()
END

${columnDefinitions}
${decimalAlterSql}
${twoDigitAlterSql}
${duplicateDataMigrationSql}
${shotDateDataMigrationSql}
${dropDuplicateColumnsSql}

IF COL_LENGTH('${TABLE}', 'raw_readings_json') IS NULL
BEGIN
  ALTER TABLE ${TABLE} ADD [raw_readings_json] NVARCHAR(MAX) NULL
END

IF COL_LENGTH('${TABLE}', 'minor_stoppage_machine') IS NOT NULL
   AND '${String(process.env.PLC_MINOR_STOPPAGE_MACHINE_ENABLED || "false").replace(/'/g, "''").toLowerCase()}' = 'true'
BEGIN
  ;WITH recent_rows AS (
    SELECT TOP (5000)
      [id],
      COALESCE([shot_datetime], [recorded_at]) AS shot_at,
      [machine_key],
      [plc_ip],
      [cycle_time],
      [minor_stoppage_machine]
    FROM ${TABLE}
    ORDER BY [id] DESC
  ),
  ordered AS (
    SELECT
      [id],
      [shot_at],
      TRY_CONVERT(DECIMAL(18,2), [cycle_time]) AS cycle_time_value,
      LEAD([shot_at]) OVER (
        PARTITION BY COALESCE([machine_key], [plc_ip])
        ORDER BY [shot_at] ASC, [id] ASC
      ) AS next_shot_at
    FROM recent_rows
    WHERE [shot_at] IS NOT NULL
  )
  UPDATE target
  SET [minor_stoppage_machine] = CAST(
    CASE
      WHEN ordered.next_shot_at IS NULL OR ordered.cycle_time_value IS NULL THEN NULL
      WHEN DATEDIFF(second, ordered.shot_at, ordered.next_shot_at) - ordered.cycle_time_value < 0 THEN 0
      ELSE DATEDIFF(second, ordered.shot_at, ordered.next_shot_at) - ordered.cycle_time_value
    END AS DECIMAL(18,2)
  )
  FROM ${TABLE} target
  INNER JOIN ordered ON target.[id] = ordered.[id]
END

IF OBJECT_ID(N'${LEAK_TEST_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${LEAK_TEST_TABLE} (
    [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_Leaktest] PRIMARY KEY,
    [Machine] NVARCHAR(100) NOT NULL,
    [PLC_IP] NVARCHAR(50) NOT NULL,
    [Status] NVARCHAR(50) NOT NULL,
    [Cycle_End_Time] DATETIME NOT NULL,
    [Part_QR_Code] NVARCHAR(100) NULL,
    [Result] NVARCHAR(20) NULL,
    [Body_Leak_Value] FLOAT NULL,
    [Gall_1] FLOAT NULL,
    [Gall_2] FLOAT NULL,
    [Cycle_Time] INT NULL,
    [Running_Mode] NVARCHAR(40) NULL,
    [Manual] BIT NULL,
    [Dry] BIT NULL,
    [Wey] BIT NULL,
    [Both] BIT NULL
  )
END

IF COL_LENGTH('${LEAK_TEST_TABLE}', 'DB_STATUS') IS NOT NULL
BEGIN
  DECLARE @leaktest_db_status_constraint NVARCHAR(128)
  SELECT @leaktest_db_status_constraint = dc.name
  FROM sys.default_constraints dc
  INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
  WHERE dc.parent_object_id = OBJECT_ID(N'${LEAK_TEST_TABLE}')
    AND c.name = N'DB_STATUS'
  IF @leaktest_db_status_constraint IS NOT NULL
    EXEC(N'ALTER TABLE ${LEAK_TEST_TABLE} DROP CONSTRAINT [' + @leaktest_db_status_constraint + N']')
  ALTER TABLE ${LEAK_TEST_TABLE} DROP COLUMN [DB_STATUS]
END

IF COL_LENGTH('${TABLE}', 'scan_data') IS NOT NULL
  AND COL_LENGTH('${TABLE}', 'manual_mode') IS NOT NULL
BEGIN
  ${dynamicSql(`INSERT INTO ${LEAK_TEST_TABLE}
    ([Machine],[PLC_IP],[Status],[Cycle_End_Time],[Part_QR_Code],[Result],[Body_Leak_Value],[Gall_1],[Gall_2],[Cycle_Time],[Running_Mode],[Manual],[Dry],[Wey],[Both])
    SELECT
      COALESCE([machine_name], N'Leak Test'),
      [plc_ip],
      CASE
        WHEN UPPER(LTRIM(RTRIM(TRY_CONVERT(NVARCHAR(20), [result])))) IN (N'OK',N'O',N'PASS',N'PASSED',N'GOOD',N'G',N'Y',N'YES',N'TRUE',N'1') THEN N'OK'
        WHEN UPPER(LTRIM(RTRIM(TRY_CONVERT(NVARCHAR(20), [result])))) IN (N'NG',N'N',N'FAIL',N'FAILED',N'BAD',N'B',N'NO',N'FALSE',N'0') THEN N'NG'
        ELSE TRY_CONVERT(NVARCHAR(20), [result])
      END,
      CAST([recorded_at] AS DATETIME),
      COALESCE([scan_data], [part_name]),
      CASE
        WHEN UPPER(LTRIM(RTRIM(TRY_CONVERT(NVARCHAR(20), [result])))) IN (N'OK',N'O',N'PASS',N'PASSED',N'GOOD',N'G',N'Y',N'YES',N'TRUE',N'1') THEN N'OK'
        WHEN UPPER(LTRIM(RTRIM(TRY_CONVERT(NVARCHAR(20), [result])))) IN (N'NG',N'N',N'FAIL',N'FAILED',N'BAD',N'B',N'NO',N'FALSE',N'0') THEN N'NG'
        ELSE TRY_CONVERT(NVARCHAR(20), [result])
      END,
      TRY_CONVERT(FLOAT, [body_leak_value]),
      TRY_CONVERT(FLOAT, [gall_1]),
      TRY_CONVERT(FLOAT, [gall_2]),
      TRY_CONVERT(INT, [cycle_time]),
      CASE WHEN TRY_CONVERT(INT, [auto_mode]) = 1 THEN N'AUTO' ELSE N'MANUAL' END,
      TRY_CONVERT(BIT, COALESCE([manual_mode], 0)),
      TRY_CONVERT(BIT, COALESCE([dry_mode], 0)),
      TRY_CONVERT(BIT, COALESCE([wey_mode], 0)),
      TRY_CONVERT(BIT, COALESCE([both_mode], 0))
    FROM ${TABLE} source
    WHERE [plc_ip] IN (N'192.168.119.40',N'192.168.119.41',N'192.168.119.42')
      AND ([scan_data] IS NOT NULL OR [body_leak_value] IS NOT NULL OR [gall_1] IS NOT NULL OR [gall_2] IS NOT NULL OR [result] IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM ${LEAK_TEST_TABLE} target
        WHERE target.[PLC_IP] = source.[plc_ip]
          AND target.[Cycle_End_Time] = CAST(source.[recorded_at] AS DATETIME)
          AND ISNULL(target.[Part_QR_Code], N'') = ISNULL(COALESCE(source.[scan_data], source.[part_name]), N'')
      )`)}
END

${buildDropColumnSql(LEAK_TEST_TABLE, "leaktest", leakTestDropColumns)}
${buildDropColumnSql(TABLE, "plc", plcDropColumns)}

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_id_desc'
    AND [object_id] = OBJECT_ID(N'${TABLE}')
)
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_id_desc] ON ${TABLE} ([id] DESC)
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_machine_key_recorded_desc'
    AND [object_id] = OBJECT_ID(N'${TABLE}')
)
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_machine_key_recorded_desc]
    ON ${TABLE} ([machine_key], [recorded_at] DESC, [id] DESC)
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_plc_ip_recorded_desc'
    AND [object_id] = OBJECT_ID(N'${TABLE}')
)
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_plc_ip_recorded_desc]
    ON ${TABLE} ([plc_ip], [recorded_at] DESC, [id] DESC)
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_machine_shot_date_number'
    AND [object_id] = OBJECT_ID(N'${TABLE}')
)
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_machine_shot_date_number]
    ON ${TABLE} ([machine_key], [shot_date], [shot_number], [recorded_at] DESC, [id] DESC)
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_ip_shot_date_number'
    AND [object_id] = OBJECT_ID(N'${TABLE}')
)
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_ip_shot_date_number]
    ON ${TABLE} ([plc_ip], [shot_date], [shot_number], [recorded_at] DESC, [id] DESC)
END

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'UX_MachineShot'
    AND [object_id] = OBJECT_ID(N'${TABLE}')
)
BEGIN
  DROP INDEX [UX_MachineShot] ON ${TABLE}
END

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'UX_PlcCycleReadings_shot_uid'
    AND [object_id] = OBJECT_ID(N'${TABLE}')
)
BEGIN
  DROP INDEX [UX_PlcCycleReadings_shot_uid] ON ${TABLE}
END

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_Leaktest_machine_recorded_at_desc'
    AND [object_id] = OBJECT_ID(N'${LEAK_TEST_TABLE}')
)
BEGIN
  DROP INDEX [IX_Leaktest_machine_recorded_at_desc] ON ${LEAK_TEST_TABLE}
END

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_Leaktest_ip_cycle_end_desc'
    AND [object_id] = OBJECT_ID(N'${LEAK_TEST_TABLE}')
)
BEGIN
  DROP INDEX [IX_Leaktest_ip_cycle_end_desc] ON ${LEAK_TEST_TABLE}
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_Leaktest_ip_cycle_end_desc'
    AND [object_id] = OBJECT_ID(N'${LEAK_TEST_TABLE}')
)
BEGIN
  CREATE INDEX [IX_Leaktest_ip_cycle_end_desc] ON ${LEAK_TEST_TABLE} ([PLC_IP], [Cycle_End_Time] DESC, [Id] DESC)
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcConnectionEvents_started_at_desc'
    AND [object_id] = OBJECT_ID(N'${CONNECTION_EVENTS_TABLE}')
)
BEGIN
  CREATE INDEX [IX_PlcConnectionEvents_started_at_desc] ON ${CONNECTION_EVENTS_TABLE} ([started_at] DESC, [id] DESC)
END
`);
}

async function hasUsablePlcSchema() {
  const { rows } = await db.query(`
SELECT
  CASE WHEN OBJECT_ID(N'${TABLE}', N'U') IS NOT NULL THEN 1 ELSE 0 END AS has_plc_table,
      CASE WHEN OBJECT_ID(N'${LEAK_TEST_TABLE}', N'U') IS NOT NULL THEN 1 ELSE 0 END AS has_leak_table,
      CASE WHEN COL_LENGTH('${TABLE}', 'recorded_at') IS NOT NULL THEN 1 ELSE 0 END AS has_recorded_at,
      CASE WHEN COL_LENGTH('${TABLE}', 'machine_key') IS NOT NULL THEN 1 ELSE 0 END AS has_machine_key,
      CASE WHEN COL_LENGTH('${TABLE}', 'plc_ip') IS NOT NULL THEN 1 ELSE 0 END AS has_plc_ip,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE [name] = N'IX_PlcCycleReadings_machine_key_recorded_desc'
          AND [object_id] = OBJECT_ID(N'${TABLE}')
      ) THEN 1 ELSE 0 END AS has_machine_key_index,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE [name] = N'IX_PlcCycleReadings_plc_ip_recorded_desc'
          AND [object_id] = OBJECT_ID(N'${TABLE}')
      ) THEN 1 ELSE 0 END AS has_plc_ip_index,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE [name] = N'IX_Leaktest_ip_cycle_end_desc'
          AND [object_id] = OBJECT_ID(N'${LEAK_TEST_TABLE}')
      ) THEN 1 ELSE 0 END AS has_leak_index
  `);

  const schema = rows[0] || {};
  return [
    "has_plc_table",
    "has_leak_table",
    "has_recorded_at",
    "has_machine_key",
    "has_plc_ip",
    "has_machine_key_index",
    "has_plc_ip_index",
    "has_leak_index",
  ].every((key) => Number(schema[key]) === 1);
}

async function ensureCriticalUbeSaveColumns() {
  await db.run(`
IF OBJECT_ID(N'${TABLE}', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('${TABLE}', 'shot_date') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_date] DATE NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_time') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_time] TIME(0) NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_datetime') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_datetime] DATETIME2(0) NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_year') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_year] NVARCHAR(2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_month') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_month] NVARCHAR(2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_day') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_day] NVARCHAR(2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_hour') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_hour] NVARCHAR(2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_minute') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_minute] NVARCHAR(2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_second') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_second] NVARCHAR(2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'shot_number') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [shot_number] INT NULL
  END

  IF COL_LENGTH('${TABLE}', 'cycle_time') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [cycle_time] DECIMAL(18,2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'minor_stoppage') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [minor_stoppage] DECIMAL(18,2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'ok_shot') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [ok_shot] INT NULL
  END

  IF COL_LENGTH('${TABLE}', 'ng_counter') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [ng_counter] INT NULL
  END

  IF COL_LENGTH('${TABLE}', 'minor_stoppage_machine') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [minor_stoppage_machine] DECIMAL(18,2) NULL
  END

  IF COL_LENGTH('${TABLE}', 'raw_readings_json') IS NULL
  BEGIN
    ALTER TABLE ${TABLE} ADD [raw_readings_json] NVARCHAR(MAX) NULL
  END
END`);
}

async function backfillRecentMinorStoppageMachine() {
  if (String(process.env.PLC_MINOR_STOPPAGE_MACHINE_ENABLED || "false").toLowerCase() !== "true") {
    return;
  }
  await db.run(`
IF OBJECT_ID(N'${TABLE}', N'U') IS NOT NULL
   AND COL_LENGTH('${TABLE}', 'minor_stoppage_machine') IS NOT NULL
BEGIN
  ;WITH recent_rows AS (
    SELECT TOP (5000)
      [id],
      COALESCE([shot_datetime], [recorded_at]) AS shot_at,
      [machine_key],
      [plc_ip],
      [cycle_time]
    FROM ${TABLE}
    ORDER BY [id] DESC
  ),
  ordered AS (
    SELECT
      [id],
      [shot_at],
      TRY_CONVERT(DECIMAL(18,2), [cycle_time]) AS cycle_time_value,
      LEAD([shot_at]) OVER (
        PARTITION BY COALESCE([machine_key], [plc_ip])
        ORDER BY [shot_at] ASC, [id] ASC
      ) AS next_shot_at
    FROM recent_rows
    WHERE [shot_at] IS NOT NULL
  )
  UPDATE target
  SET [minor_stoppage_machine] = CAST(
    CASE
      WHEN ordered.next_shot_at IS NULL OR ordered.cycle_time_value IS NULL THEN NULL
      WHEN DATEDIFF(second, ordered.shot_at, ordered.next_shot_at) - ordered.cycle_time_value < 0 THEN 0
      ELSE DATEDIFF(second, ordered.shot_at, ordered.next_shot_at) - ordered.cycle_time_value
    END AS DECIMAL(18,2)
  )
  FROM ${TABLE} target
  INNER JOIN ordered ON target.[id] = ordered.[id]
END`);
}

async function backfillRecentMinorStoppage() {
  await db.run(`
IF OBJECT_ID(N'${TABLE}', N'U') IS NOT NULL
   AND COL_LENGTH('${TABLE}', 'minor_stoppage') IS NOT NULL
   AND COL_LENGTH('${TABLE}', 'cycle_start_time') IS NOT NULL
   AND COL_LENGTH('${TABLE}', 'cycle_end_time') IS NOT NULL
BEGIN
  ;WITH recent_rows AS (
    SELECT TOP (5000)
      [id],
      [machine_key],
      [plc_ip],
      [cycle_start_time],
      [cycle_end_time]
    FROM ${TABLE}
    WHERE [cycle_start_time] IS NOT NULL
    ORDER BY [id] DESC
  ),
  ordered AS (
    SELECT
      [id],
      [cycle_start_time],
      LAG([cycle_end_time]) OVER (
        PARTITION BY COALESCE([machine_key], [plc_ip])
        ORDER BY [cycle_start_time] ASC, [id] ASC
      ) AS previous_cycle_end_time
    FROM recent_rows
  )
  UPDATE target
  SET [minor_stoppage] = CAST(
    CASE
      WHEN ordered.previous_cycle_end_time IS NULL THEN 0
      WHEN DATEDIFF(second, ordered.previous_cycle_end_time, ordered.cycle_start_time) < 0 THEN 0
      ELSE DATEDIFF(second, ordered.previous_cycle_end_time, ordered.cycle_start_time)
    END AS DECIMAL(18,2)
  )
  FROM ${TABLE} target
  INNER JOIN ordered ON target.[id] = ordered.[id]
END`);
}

function ensureTableOnce() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await ensureCriticalUbeSaveColumns();
      if (!(await hasUsablePlcSchema())) {
        await ensureTable();
      }
      await backfillRecentMinorStoppage();
      await backfillRecentMinorStoppageMachine();
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN MONITOR
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function createInitialMachineState(machines) {
  return new Map(
    machines.map((machine) => [
      machine.key || machine.ip,
      {
        ...machine,
        connected: false,
        error: null,
        lastCycleAt: null,
        lastShotNumber: null,
        partName: "",
        cycleTime: null,
        shotStatus: "",
        // â”€â”€ NEW: machine type clearly stored in state â”€â”€
        machineType: isLeakTestMachine(machine) ? "leaktest" : "ube",
      },
    ])
  );
}

function startPlcMonitor(io) {
  let machines = getMachines();
  const machineState = createInitialMachineState(machines);
  const bitOnState = new Map();
  const openConnectionEvents = new Map();
  const lastLeakSnapshots = new Map();
  const lastLeakLiveSnapshots = new Map();
  const pendingUbeSaves = new Map();
  let monitoringRunning =
    String(process.env.PLC_MONITOR_ENABLED || "true").toLowerCase() !== "false";
  let lastPlcConnected = null;

  const persistPendingUbeSaves = () => {
    try {
      if (!pendingUbeSaves.size) {
        fs.rmSync(PLC_PENDING_SAVE_FILE, { force: true });
        return;
      }
      fs.mkdirSync(path.dirname(PLC_PENDING_SAVE_FILE), { recursive: true });
      fs.writeFileSync(
        PLC_PENDING_SAVE_FILE,
        JSON.stringify(Array.from(pendingUbeSaves.entries()), null, 2)
      );
    } catch (error) {
      console.error("PLC pending save queue persist failed:", error.message);
    }
  };

  const loadPendingUbeSaves = () => {
    try {
      if (!fs.existsSync(PLC_PENDING_SAVE_FILE)) return;
      const parsed = JSON.parse(fs.readFileSync(PLC_PENDING_SAVE_FILE, "utf8"));
      if (!Array.isArray(parsed)) return;
      let dropped = 0;
      parsed.forEach(([key, item]) => {
        if (key && item?.machine && item?.readings) {
          if (!isReportSaveEnabledForMachine(item.machine)) {
            dropped += 1;
            return;
          }
          pendingUbeSaves.set(key, item);
        }
      });
      if (dropped) {
        persistPendingUbeSaves();
        console.log(`PLC pending save queue dropped ${dropped} disabled UBE items`);
      }
      if (pendingUbeSaves.size) {
        console.log(`PLC pending save queue restored: ${pendingUbeSaves.size} items`);
      }
    } catch (error) {
      console.error("PLC pending save queue restore failed:", error.message);
    }
  };

  loadPendingUbeSaves();

  // â”€â”€ UPDATED: emitMachineState â€” per-machine events â”€â”€
  const emitMachineState = () => {
    const list = Array.from(machineState.values());
    const connected = list.some((item) => item.connected);

    // Per-machine specific status event â€” frontend can listen to individual machine
    list.forEach((m) => {
      io.emit(`machine_status:${m.key || m.ip}`, m);
    });

    // Generic event for full list â€” backward compat
    io.emit("machines_status", list);

    if (connected !== lastPlcConnected) {
      lastPlcConnected = connected;
      io.emit("plc_status", { connected });
    }
  };

  const updateMachineState = (machine, patch) => {
    const key = machine.key || machine.ip;
    const current = machineState.get(key) || { ...machine };
    machineState.set(key, {
      ...current,
      ...machine,
      machine_key: key,
      machineType: isLeakTestMachine(machine) ? "leaktest" : "ube",
      ...patch,
    });
    emitMachineState();
  };

  const recordConnectionChange = async (machine, connected, reason = "") => {
    const key = machine.key || machine.ip;
    const existing = openConnectionEvents.get(key);

    try {
      if (connected) {
        if (existing) {
          await db.run(
            `UPDATE ${CONNECTION_EVENTS_TABLE}
             SET ended_at = ?, duration_seconds = DATEDIFF(second, started_at, ?)
             WHERE id = ?`,
            [new Date(), new Date(), existing.id]
          );
          openConnectionEvents.delete(key);
        }
        return;
      }

      if (existing) return;

      const startedAt = new Date();
      const result = await db.run(
        `INSERT INTO ${CONNECTION_EVENTS_TABLE}
           (machine_key, machine_name, plc_ip, plc_port, event_type, started_at, reason)
         OUTPUT INSERTED.id
         VALUES (?,?,?,?,?,?,?)`,
        [key, machine.name, machine.ip, machine.port, "DISCONNECTED", startedAt, reason]
      );
      openConnectionEvents.set(key, {
        id: result.rows?.[0]?.id || result.insertId,
        startedAt,
      });
    } catch (error) {
      console.error(`PLC connection event save failed for ${key}:`, error.message);
    }
  };

  const buildUbeSaveKey = (machine, readings = {}) => {
    const machineKey = machine.key || machine.ip;
    const shotNumber = readings.shot_number ?? readings["SHOT NO."] ?? "no-shot";
    const shotDateTime = readings.shot_datetime || "missing-plc-shot-datetime";
    return `${machineKey}:${shotNumber}:${shotDateTime}`;
  };

  const queueUbeSave = (machine, partName, readings, error) => {
    if (pendingUbeSaves.size >= PLC_DB_RETRY_MAX) {
      const oldestKey = pendingUbeSaves.keys().next().value;
      if (oldestKey) pendingUbeSaves.delete(oldestKey);
    }

    const key = buildUbeSaveKey(machine, readings);
    const existing = pendingUbeSaves.get(key);
    pendingUbeSaves.set(key, {
      machine: { ...machine },
      partName,
      readings: { ...readings },
      attempts: (existing?.attempts || 0) + 1,
      lastError: error?.message || String(error || "Unknown DB save error"),
      queuedAt: existing?.queuedAt || new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
    });
    persistPendingUbeSaves();

    updateMachineState(machine, {
      connected: true,
      error: `DB save queued (${pendingUbeSaves.size} pending): ${error?.message || error}`,
    });
  };

  const persistUbeReading = async (machine, partName, readings) => {
    if (!isReportSaveEnabledForMachine(machine)) {
      pendingUbeSaves.delete(buildUbeSaveKey(machine, readings));
      persistPendingUbeSaves();
      return { skipped: true, reason: "report-save-disabled" };
    }

    try {
      const result = await saveToDB(machine, partName, readings);
      pendingUbeSaves.delete(buildUbeSaveKey(machine, readings));
      persistPendingUbeSaves();
      return result;
    } catch (error) {
      queueUbeSave(machine, partName, readings, error);
      console.error(`PLC DB save queued for ${machine.ip}:`, error.message);
      return { skipped: true, queued: true, reason: error.message };
    }
  };

  const flushPendingUbeSaves = async () => {
    if (!pendingUbeSaves.size) return;

    for (const [key, item] of Array.from(pendingUbeSaves.entries()).slice(0, PLC_DB_RETRY_BATCH_SIZE)) {
      try {
        await saveToDB(item.machine, item.partName, item.readings);
        pendingUbeSaves.delete(key);
        persistPendingUbeSaves();
        updateMachineState(item.machine, {
          connected: true,
          error: pendingUbeSaves.size
            ? `DB retry recovered; ${pendingUbeSaves.size} saves still pending.`
            : null,
        });
      } catch (error) {
        pendingUbeSaves.set(key, {
          ...item,
          attempts: item.attempts + 1,
          lastError: error.message,
          lastAttemptAt: new Date().toISOString(),
        });
        persistPendingUbeSaves();
        console.error(`PLC DB retry failed for ${item.machine.ip}:`, error.message);
      }
    }
  };

  setInterval(() => {
    flushPendingUbeSaves().catch((error) => {
      console.error("PLC DB retry queue failed:", error.message);
    });
  }, PLC_DB_RETRY_MS).unref?.();

  let reportSerial = 0;

  const updateBitDuration = (machine, name, value, now) => {
    const key = `${machine.key || machine.ip}:${name}`;
    const current = bitOnState.get(key) || { onSince: null, lastDuration: 0 };

    if (Number(value) === 1) {
      const onSince = current.onSince || now;
      const lastDuration = Number(((now - onSince) / 1000).toFixed(2));
      bitOnState.set(key, { onSince, lastDuration });
      return lastDuration;
    }

    bitOnState.set(key, { onSince: null, lastDuration: 0 });
    return 0;
  };

  io.on("connection", (socket) => {
    socket.emit("machines", machines);
    socket.emit("machines_status", Array.from(machineState.values()));
    socket.emit("monitoring_status", { running: monitoringRunning });
    socket.emit("plc_status", {
      connected: Array.from(machineState.values()).some((item) => item.connected),
    });

    socket.on("set_monitoring", ({ running } = {}, callback) => {
      monitoringRunning = Boolean(running);
      io.emit("monitoring_status", { running: monitoringRunning });
      callback?.({ ok: true, running: monitoringRunning });
    });

    socket.on("update_plc_config", (config = {}, callback) => {
      const machine =
        machines.find(
          (item) => (item.key || item.ip) === config.key || item.ip === config.ip
        ) || machines[0];
      const nextConfig = {
        key: machine.key || machine.ip,
        ip: machine.ip,
        port: Number(config.port || machine.port),
        kind: machine.kind || "ube",
        machineType: isLeakTestMachine(machine) ? "leaktest" : "ube",
      };
      io.emit("plc_config", nextConfig);
      callback?.({ ok: true, unchanged: true, config: nextConfig });
    });
  });

  // â”€â”€ UBE: Read All Registers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const readAll = async (machine, sock, { persist = true, emit = true, liveOnly = false, cycleTiming = null } = {}) => {
    const readings = {};
    const rawCache = new Map();
    const now = new Date();
    const readParameters = Array.isArray(machine.registerConfig) && machine.registerConfig.length
      ? machine.registerConfig.filter((parameter) => parameter.enabled !== false)
      : [];

    reportSerial += 1;
    let partName = "";
    let shotTime = null;
    let cycleTimestamp = null;

    for (const parameter of readParameters) {
      const { name, device, computed } = parameter;
      try {
        if (computed === "serial") { readings[name] = reportSerial; continue; }
        if (computed === "shotTime") { readings[name] = shotTime; continue; }
        if (!device) { readings[name] = null; continue; }

        if (!rawCache.has(device)) {
          const rawValue = device.startsWith("M")
            ? await readBit(sock, device)
            : parameter.type === "dword"
              ? await readDWord(sock, device)
              : await readWord(sock, device);
          rawCache.set(device, rawValue);
        }

        readings[name] = scaleValue(parameter, rawCache.get(device));
        if (device.startsWith("M")) {
          readings[`${readingColumnName(name)} duration (sec)`] = updateBitDuration(
            machine, name, readings[name], now
          );
        }
      } catch (error) {
        if (isPlcConnectionError(error)) throw error;
        readings[name] = null;
      }
    }

    partName = readings.part_name || readings.partName || "";
    const shotYearRaw = readings.shot_year;
    const shotMonthRaw = readings.shot_month;
    const shotDayRaw = readings.shot_day;
    const shotHour = readings.shot_hour;
    const shotMinute = readings.shot_minute;
    const shotSecond = readings.shot_second;
    shotTime = readings.shot_time || buildShotTimeValue(shotHour, shotMinute, shotSecond);
    const shotDateTime = readings.shot_datetime || buildShotDateTimeValue(
      shotYearRaw,
      shotMonthRaw,
      shotDayRaw,
      shotHour,
      shotMinute,
      shotSecond
    );
    cycleTimestamp = shotDateTime || now.toISOString();
    readings.part_name = partName;
    readings.shot_date = readings.shot_date || buildShotDateValue(shotYearRaw, shotMonthRaw, shotDayRaw);
    readings.shot_time = shotTime;
    readings.shot_datetime = shotDateTime;
    readings.shot_year = pad2(shotYearRaw);
    readings.shot_month = pad2(shotMonthRaw);
    readings.shot_day = pad2(shotDayRaw);
    readings.shot_hour = pad2(shotHour);
    readings.shot_minute = pad2(shotMinute);
    readings.shot_second = pad2(shotSecond);

    readings.shot_number = readings["SHOT NO."] ?? null;
    readings.ok_shot = readings["HIGH SHOT COUNT"] ?? null;
    readings.ng_counter = readings["NG COUNTER"] ?? null;
    delete readings.ng_shot;

    for (const [parameterName, legacyColumn] of Object.entries(LEGACY_COLUMNS_BY_PARAMETER)) {
      if (readings[legacyColumn] === undefined && readings[parameterName] !== undefined) {
        readings[legacyColumn] = readings[parameterName];
      }
    }

    if (cycleTiming?.startedAt && cycleTiming?.endedAt) {
      const startedAt = cycleTiming.startedAt instanceof Date
        ? cycleTiming.startedAt
        : new Date(cycleTiming.startedAt);
      const endedAt = cycleTiming.endedAt instanceof Date
        ? cycleTiming.endedAt
        : new Date(cycleTiming.endedAt);
      const durationSec = Number.isFinite(Number(cycleTiming.durationSec))
        ? Number(cycleTiming.durationSec)
        : Number(((endedAt - startedAt) / 1000).toFixed(2));

      if (Number.isFinite(durationSec) && durationSec >= 0) {
        readings.plc_cycle_time = readings.cycle_time ?? readings["CYCLE TIME sec."] ?? null;
        readings.cycle_start_time = startedAt.toISOString();
        readings.cycle_end_time = endedAt.toISOString();
        readings.cycle_duration = durationSec;
        readings.actual_cycle_time = durationSec;
        readings.cycle_time = durationSec;
        readings["CYCLE TIME sec."] = durationSec;
      }
    }

    await applyCycleMinorStoppage(machine, readings);

    readings.minor_stoppage_machine = null;

    // â”€â”€ machineKey + machineType always in payload â”€â”€
    const machineKey = machine.key || machine.ip;
    const machineType = "ube";

    const payload = {
      machine: machine.name,
      machineKey,
      machineType,
      partName,
      shotTime,
      readings: formatReadingsForClient(readings, machine),
      cycleTime: readings.cycle_time,
      timestamp: cycleTimestamp,
      observedAt: now.toISOString(),
      config: {
        key: machineKey,
        ip: machine.ip,
        port: machine.port,
        kind: machine.kind || "ube",
        machineType,
      },
    };

    if (emit) {
      const emitData = {
        machine: machine.name,
        machineKey,
        machineType,
        partName,
        shotTime,
        readings: formatReadingsForClient(readings, machine),
        cycleTime: readings.cycle_time,
        timestamp: payload.timestamp,
        observedAt: payload.observedAt,
        liveOnly,
        config: payload.config,
      };

      // â”€â”€ Machine-specific event (primary) â”€â”€
      io.emit(`plc_data:${machineKey}`, emitData);

      // â”€â”€ Generic event (backward compat) â”€â”€
      io.emit("plc_data", emitData);

      if (!liveOnly) io.emit("cycle_complete", { ...payload });

      updateMachineState(machine, {
        connected: true,
        error: null,
        lastCycleAt: liveOnly
          ? machineState.get(machineKey)?.lastCycleAt
          : payload.timestamp,
        lastShotNumber: readings.shot_number,
        latestReading: formatLiveReadingSnapshot(machine, partName, readings, payload.timestamp),
        partName,
        cycleTime: readings.cycle_time,
        shotStatus: liveOnly ? "Live registers updated." : "Cycle complete.",
      });
    }

    if (persist) {
      await persistUbeReading(machine, partName, readings);
    }

    return payload;
  };

  // â”€â”€ UBE: Stable Cycle Read â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const readStableCycle = async (machine, sock) => {
    const attempts = Number(process.env.PLC_STABLE_READ_ATTEMPTS || 3);
    const delay = Number(process.env.PLC_STABLE_READ_DELAY_MS || 2500);
    let lastPayload = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      lastPayload = await readAll(machine, sock, { persist: false, emit: false });
      const flatReadings = Object.fromEntries(
        Object.entries(lastPayload.readings || {}).map(([name, r]) => [name, r?.value])
      );

      if (hasStableCycleReadings(flatReadings)) break;
      if (attempt < attempts) await sleep(delay);
    }

    if (!lastPayload) return null;

    const finalReadings = Object.fromEntries(
      Object.entries(lastPayload.readings || {}).map(([name, r]) => [name, r?.value])
    );
    const stable = hasStableCycleReadings(finalReadings);

    if (!stable) {
      updateMachineState(machine, {
        connected: true,
        error: "Partial PLC cycle â€” cycle time too low, waiting.",
      });
      return { ...lastPayload, skipped: true };
    }

    const machineKey = machine.key || machine.ip;
    const machineType = "ube";

    const emitData = {
      machine: machine.name,
      machineKey,
      machineType,
      partName: lastPayload.partName,
      shotTime: lastPayload.shotTime,
      readings: formatReadingsForClient(finalReadings, machine),
      cycleTime: finalReadings.cycle_time,
      timestamp: lastPayload.timestamp,
      config: lastPayload.config,
    };

    // â”€â”€ Machine-specific event (primary) â”€â”€
    io.emit(`plc_data:${machineKey}`, emitData);

    // â”€â”€ Generic event (backward compat) â”€â”€
    io.emit("plc_data", emitData);

    io.emit("cycle_complete", { ...lastPayload, machineKey, machineType });

    updateMachineState(machine, {
      connected: true,
      error: null,
      lastCycleAt: lastPayload.timestamp,
      lastShotNumber: finalReadings.shot_number,
      latestReading: formatLiveReadingSnapshot(machine, lastPayload.partName, finalReadings, lastPayload.timestamp),
      partName: lastPayload.partName,
      cycleTime: finalReadings.cycle_time,
    });

    try {
    await persistUbeReading(machine, lastPayload.partName, finalReadings);
    } catch (error) {
      updateMachineState(machine, { connected: true, error: `DB save failed: ${error.message}` });
      console.error(`PLC DB save failed for ${machine.ip}:`, error.message);
    }

    return lastPayload;
  };

  // â”€â”€ Leak Test: Read All Registers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const readLeakTestCycle = async (
    machine,
    sock,
    { persist = true, emit = true, liveOnly = false, cycleEndAt = new Date() } = {}
  ) => {
    const readings = {};
    const rawCache = new Map();
    const now = cycleEndAt instanceof Date ? cycleEndAt : new Date(cycleEndAt);
    const timestamp = systemDateTimeString(now, { iso: true });
    const machineKey = machine.key || machine.ip;
    const machineType = "leaktest";
    const currentState = machineState.get(machineKey) || {};
    const readParameters = Array.isArray(machine.registerConfig) && machine.registerConfig.length
      ? machine.registerConfig.filter((parameter) => parameter.enabled !== false)
      : [];

    for (const parameter of readParameters) {
      const { name, device, stringDevice, stringLength } = parameter;
      try {
        if (stringDevice) {
          readings[name] = await readString(sock, stringDevice, stringLength || 11);
          if (name === "result" && !readings[name]) {
            readings[name] = await readWord(sock, stringDevice).catch(() => null);
          }
          continue;
        }

        if (!device) { readings[name] = null; continue; }

        if (!rawCache.has(device)) {
          const rawValue =
            parameter.type === "real32"
              ? await readReal32(sock, device)
              : device.startsWith("M")
                ? await readBit(sock, device)
                : await readWord(sock, device);
          rawCache.set(device, rawValue);
        }

        readings[name] = scaleValue(parameter, rawCache.get(device));
        if (device.startsWith("M")) {
          readings[`${readingColumnName(name)} duration (sec)`] = updateBitDuration(
            machine, name, readings[name], now
          );
        }
      } catch {
        readings[name] = null;
      }
    }

    readings.scan_data = readings.part_qr_code || "";
    readings.part_qr_code = readings.scan_data;
    readings.result = normalizeLeakResult(readings.result);
    const partName = readings.scan_data || "";
    readings.machine = machine.name;
    readings.ip = machine.ip;
    readings.status = readings.result || "CYCLE COMPLETE";
    readings.cycle_end_time = liveOnly
      ? currentState.lastCycleAt || timestamp
      : timestamp;
    readings.running_mode = Number(readings.auto_bit) === 1 ? "Auto" : "Manual";

    const payload = {
      machine: machine.name,
      machineKey,
      machineType,
      partName,
      shotTime: now.toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }),
      readings: formatReadingsForClient(readings, machine),
      cycleTime: readings.cycle_time,
      timestamp: liveOnly ? currentState.lastCycleAt || timestamp : timestamp,
      observedAt: timestamp,
      liveOnly,
      config: {
        key: machineKey,
        ip: machine.ip,
        port: machine.port,
        kind: machine.kind || "leaktest",
        machineType,
      },
    };

    if (emit) {
      const emitData = {
        machine: machine.name,
        machineKey,
        machineType,
        partName,
        shotTime: payload.shotTime,
        readings: payload.readings,
        cycleTime: payload.cycleTime,
        timestamp: payload.timestamp,
        observedAt: payload.observedAt,
        liveOnly: payload.liveOnly,
        config: payload.config,
      };

      // â”€â”€ Machine-specific event (primary) â”€â”€
      io.emit(`plc_data:${machineKey}`, emitData);

      // â”€â”€ Generic event (backward compat) â”€â”€
      io.emit("plc_data", emitData);

      if (!liveOnly) io.emit("cycle_complete", { ...payload });

      updateMachineState(machine, {
        connected: true,
        error: null,
        lastCycleAt: liveOnly
          ? machineState.get(machineKey)?.lastCycleAt
          : payload.timestamp,
        lastShotNumber: readings.part_qr_code,
        latestReading: formatLiveReadingSnapshot(machine, partName, readings, payload.timestamp),
        partName,
        cycleTime: readings.cycle_time,
        shotStatus: liveOnly ? "Live registers updated." : "Cycle complete.",
      });
    }

    if (persist && hasStableLeakReadings(readings)) {
      try {
        await saveLeakTestToDB(machine, partName, readings);
      } catch (error) {
        updateMachineState(machine, {
          connected: true,
          error: `DB save failed: ${error.message}`,
        });
        console.error(`Leak test DB save failed for ${machineKey}:`, error.message);
      }
    }

    return payload;
  };

  // â”€â”€ Leak Test: Stable Cycle Read â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const readStableLeakTestCycle = async (
    machine,
    sock,
    cycleEndAt = new Date(),
    { trigger = "edge" } = {}
  ) => {
    const attempts = Number(
      process.env.PLC_LEAK_STABLE_READ_ATTEMPTS || process.env.PLC_STABLE_READ_ATTEMPTS || 3
    );
    const delay = Number(
      process.env.PLC_LEAK_STABLE_READ_DELAY_MS || process.env.PLC_STABLE_READ_DELAY_MS || 2500
    );
    let lastPayload = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      lastPayload = await readLeakTestCycle(machine, sock, {
        persist: false, emit: false, cycleEndAt,
      });
      const flatReadings = Object.fromEntries(
        Object.entries(lastPayload.readings || {}).map(([name, r]) => [name, r?.value])
      );
      if (hasStableLeakReadings(flatReadings)) break;
      if (attempt < attempts) await sleep(delay);
    }

    if (!lastPayload) return null;

    const finalReadings = Object.fromEntries(
      Object.entries(lastPayload.readings || {}).map(([name, r]) => [name, r?.value])
    );
    const machineKey = machine.key || machine.ip;
    const machineType = "leaktest";
    const signature = buildLeakSignature(finalReadings);
    const previousSnapshot = lastLeakSnapshots.get(machineKey);
    const nowMs = Date.now();

    if (trigger !== "cycle-end" && previousSnapshot?.signature === signature) {
      updateMachineState(machine, {
        connected: true,
        error: null,
        shotStatus: "Live leak test values unchanged.",
      });
      return { ...lastPayload, skipped: true };
    }

    if (!hasStableLeakReadings(finalReadings)) {
      updateMachineState(machine, {
        connected: true,
        error: "Partial leak test cycle â€” waiting for stable values.",
      });
      return { ...lastPayload, skipped: true };
    }

    try {
      const saveResult = await saveLeakTestToDB(machine, lastPayload.partName, finalReadings);
      if (saveResult?.skipped) {
        lastLeakSnapshots.set(machineKey, { signature, savedAtMs: nowMs, timestamp: lastPayload.timestamp, trigger });
        updateMachineState(machine, {
          connected: true,
          error: null,
          shotStatus: "Duplicate leak test cycle ignored.",
        });
        return { ...lastPayload, skipped: true };
      }
    } catch (error) {
      updateMachineState(machine, { connected: true, error: `DB save failed: ${error.message}` });
      console.error(`Leak test DB save failed for ${machineKey}:`, error.message);
      return { ...lastPayload, skipped: true };
    }

    lastLeakSnapshots.set(machineKey, { signature, savedAtMs: nowMs, timestamp: lastPayload.timestamp, trigger });
    lastLeakLiveSnapshots.set(machineKey, {
      readings: finalReadings,
      partName: lastPayload.partName,
      observedAt: lastPayload.observedAt || lastPayload.timestamp,
      firstObservedAt: lastPayload.observedAt || lastPayload.timestamp,
      signature,
      saved: true,
    });

    const emitData = {
      machine: machine.name,
      machineKey,
      machineType,
      partName: lastPayload.partName,
      shotTime: lastPayload.shotTime,
      readings: formatReadingsForClient(finalReadings, machine),
      cycleTime: finalReadings.cycle_time,
      timestamp: lastPayload.timestamp,
      config: lastPayload.config,
    };

    // â”€â”€ Machine-specific event (primary) â”€â”€
    io.emit(`plc_data:${machineKey}`, emitData);

    // â”€â”€ Generic event (backward compat) â”€â”€
    io.emit("plc_data", emitData);

    io.emit("cycle_complete", { ...lastPayload, machineKey, machineType });

    updateMachineState(machine, {
      connected: true,
      error: null,
      lastCycleAt: lastPayload.timestamp,
      lastShotNumber: finalReadings.part_qr_code,
      partName: lastPayload.partName,
      cycleTime: finalReadings.cycle_time,
      shotStatus: "Cycle complete.",
    });

    return lastPayload;
  };

  // â”€â”€ Leak Test: Persist Snapshot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const persistLeakSnapshot = async (machine, snapshot, cycleEndAt, trigger = "transition", options = {}) => {
    if (!snapshot?.readings || snapshot.saved) return { skipped: true, reason: "empty-snapshot" };

    const readings = {
      ...snapshot.readings,
      cycle_end_time: systemDateTimeString(
        cycleEndAt instanceof Date ? cycleEndAt : new Date(cycleEndAt),
        { iso: true }
      ),
    };
    const machineKey = machine.key || machine.ip;
    const machineType = "leaktest";
    const signature = buildLeakSignature(readings);
    const previousSaved = lastLeakSnapshots.get(machineKey);

    if (!options.allowSameSignature && previousSaved?.signature === signature) {
      return { skipped: true, reason: "duplicate-signature" };
    }
    if (!hasStableLeakReadings(readings)) return { skipped: true, reason: "unstable-snapshot" };

    const saveResult = await saveLeakTestToDB(machine, snapshot.partName, readings);
    if (saveResult?.skipped) return saveResult;

    const payload = {
      machine: machine.name,
      machineKey,
      machineType,
      partName: snapshot.partName,
      shotTime: new Date(readings.cycle_end_time).toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }),
      readings: formatReadingsForClient(readings, machine),
      cycleTime: readings.cycle_time,
      timestamp: readings.cycle_end_time,
      config: {
        key: machineKey,
        ip: machine.ip,
        port: machine.port,
        kind: machine.kind || "leaktest",
        machineType,
      },
    };

    lastLeakSnapshots.set(machineKey, {
      signature, savedAtMs: Date.now(), timestamp: payload.timestamp, trigger,
    });

    const emitData = {
      machine: machine.name,
      machineKey,
      machineType,
      partName: payload.partName,
      shotTime: payload.shotTime,
      readings: payload.readings,
      cycleTime: payload.cycleTime,
      timestamp: payload.timestamp,
      config: payload.config,
    };

    // â”€â”€ Machine-specific event (primary) â”€â”€
    io.emit(`plc_data:${machineKey}`, emitData);

    // â”€â”€ Generic event (backward compat) â”€â”€
    io.emit("plc_data", emitData);

    io.emit("cycle_complete", { ...payload });

    updateMachineState(machine, {
      connected: true, error: null,
      lastCycleAt: payload.timestamp,
      lastShotNumber: readings.part_qr_code,
      partName: payload.partName,
      cycleTime: readings.cycle_time,
      shotStatus: "Cycle complete.",
    });

    snapshot.saved = true;
    return { skipped: false };
  };

  // â”€â”€ Main Machine Monitor Loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const monitorTokens = new Map();
  const monitorMachine = async (machine, token) => {
    const machineKey = machine.key || machine.ip;
    const machineLabel = `[${isLeakTestMachine(machine) ? "LEAKTEST" : "UBE"}] ${machine.name} (${machine.ip})`;
    let reconnectAttempt = 0;
    const isMonitorCurrent = () => monitorTokens.get(machineKey) === token;

    while (isMonitorCurrent()) {
      let sock = null;
      try {
        updateMachineState(machine, {
          connected: false,
          error: null,
          shotStatus: reconnectAttempt
            ? `Reconnecting PLC socket (attempt ${reconnectAttempt + 1}).`
            : "Connecting to PLC server.",
        });
        sock = await connectPLC(machine);
        console.log(`${machineLabel} â€” Connected`);
        reconnectAttempt = 0;
        updateMachineState(machine, {
          connected: true,
          error: null,
          shotStatus: "PLC connected; monitoring live registers.",
        });
        recordConnectionChange(machine, true).catch(() => { });

        const refreshSocketAfterTimeout = async (reason) => {
          console.warn(`${machineLabel} - PLC read timed out; refreshing socket (${reason})`);
          updateMachineState(machine, {
            connected: false,
            error: `PLC response delayed while reading ${reason}. Reconnecting socket.`,
            shotStatus: "PLC response delayed; reconnecting monitor socket.",
          });
          closeSocket(sock);
          await sleep(PLC_RECONNECT_AFTER_TIMEOUT_MS);
          sock = await connectPLC(machine);
          updateMachineState(machine, {
            connected: true,
            error: null,
            shotStatus: "PLC reconnected; monitoring resumed.",
          });
          return sock;
        };

        // â”€ LEAK TEST LOOP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        if (isLeakTestMachine(machine)) {
          const cycleStartDevice = getConfiguredRegisterDevice(
            machine,
            ["cycle_start", "cycle start", "start"],
            LEAK_TEST_CONTROL.cycleStartDevice
          );
          const cycleEndDevice = getConfiguredRegisterDevice(
            machine,
            ["cycle_end", "cycle end", "end"],
            LEAK_TEST_CONTROL.cycleEndDevice
          );

          let cycleStarted = !cycleStartDevice;
          let lastCycleStartBit = cycleStartDevice
            ? await readBit(sock, cycleStartDevice).catch(() => 0)
            : 0;
          let lastCycleEndBit = 0; // Fixed: always start fresh, not from PLC state
          let consecutiveReadFailures = 0;

          while (isMonitorCurrent()) {
            if (!monitoringRunning) { await sleep(1000); continue; }

            let cycleStart = lastCycleStartBit;
            let cycleEnd = lastCycleEndBit;

            try {
              cycleStart = cycleStartDevice ? await readBit(sock, cycleStartDevice) : 0;
              cycleEnd = cycleEndDevice ? await readBit(sock, cycleEndDevice) : 0;
              consecutiveReadFailures = 0;
            } catch (error) {
              if (isPlcConnectionError(error)) {
                await refreshSocketAfterTimeout(`leak cycle bits ${cycleStartDevice || ""}/${cycleEndDevice || ""}`);
                consecutiveReadFailures = 0;
                await sleep(Number(process.env.PLC_LEAK_POLL_MS || process.env.PLC_POLL_MS || 1000));
                continue;
              }

              consecutiveReadFailures += 1;
              updateMachineState(machine, {
                connected: true,
                error: `PLC read failed (${consecutiveReadFailures}/${PLC_MAX_CONSECUTIVE_READ_FAILURES}): ${error.message}`,
              });
              if (consecutiveReadFailures >= PLC_MAX_CONSECUTIVE_READ_FAILURES) {
                throw new Error(`PLC connection stale after ${consecutiveReadFailures} read failures: ${error.message}`);
              }
            }

            const cycleStartedNow = cycleStartDevice
              ? cycleStart === 1 && lastCycleStartBit !== 1
              : false;
            const cycleEndedNow = cycleEndDevice
              ? cycleEnd === 1 && lastCycleEndBit !== 1
              : false;

            if (cycleStartedNow) {
              cycleStarted = true;
              updateMachineState(machine, {
                connected: true,
                error: null,
                shotStatus: "Cycle started; waiting for cycle end.",
              });
            }

            if (cycleEndDevice && cycleEndedNow) {
              await sleep(Number(process.env.PLC_LEAK_CYCLE_END_SETTLE_MS || 800));
              await readStableLeakTestCycle(machine, sock, new Date(), { trigger: "cycle-end" });
              cycleStarted = !cycleStartDevice;
            }

            if (!cycleEndedNow) {
              const probePayload = await readLeakTestCycle(machine, sock, {
                persist: false,
                emit: true,
                liveOnly: true,
                cycleEndAt: new Date(),
              }).catch((error) => {
                if (isPlcConnectionError(error)) throw error;
                consecutiveReadFailures += 1;
                updateMachineState(machine, {
                  connected: true,
                  error: `Live read failed (${consecutiveReadFailures}/${PLC_MAX_CONSECUTIVE_READ_FAILURES}): ${error.message}`,
                });
                return null;
              });

              if (probePayload) {
                consecutiveReadFailures = 0;
                const probeReadings = Object.fromEntries(
                  Object.entries(probePayload.readings || {}).map(([name, r]) => [name, r?.value])
                );

                if (hasStableLeakReadings(probeReadings)) {
                  const previousLive = lastLeakLiveSnapshots.get(machineKey);
                  const currentSignature = buildLeakSignature(probeReadings);
                  const previousSignature = previousLive?.signature ||
                    (previousLive?.readings ? buildLeakSignature(previousLive.readings) : null);
                  const sameLiveSignature = previousSignature === currentSignature;
                  const currentQr = String(probeReadings.part_qr_code || "").trim();
                  const previousQr = String(previousLive?.readings?.part_qr_code || "").trim();
                  const currentCycleTime = Number(probeReadings.cycle_time || 0);
                  const previousCycleTime = Number(previousLive?.readings?.cycle_time || 0);
                  const qrChanged = previousQr && currentQr && previousQr !== currentQr;
                  const cycleTimeReset =
                    previousCycleTime >
                    Number(process.env.PLC_LEAK_MIN_COMPLETE_CYCLE_TIME_SEC || 3) &&
                    currentCycleTime + 1 < previousCycleTime;
                  const fallbackSaveMs = Number(process.env.PLC_LEAK_PERIODIC_SAVE_MS || 60000);
                  const previousObservedMs = previousLive?.firstObservedAt || previousLive?.observedAt
                    ? new Date(previousLive.firstObservedAt || previousLive.observedAt).getTime()
                    : 0;
                  const fallbackDue =
                    fallbackSaveMs > 0 &&
                    previousObservedMs > 0 &&
                    Date.now() - previousObservedMs >= fallbackSaveMs &&
                    previousCycleTime >= Number(process.env.PLC_LEAK_MIN_COMPLETE_CYCLE_TIME_SEC || 3);

                  if (LEAK_CHANGE_SAVE_ENABLED && previousLive && (qrChanged || cycleTimeReset)) {
                    await persistLeakSnapshot(
                      machine,
                      previousLive,
                      new Date(),
                      qrChanged ? "part-transition" : "cycle-time-reset"
                    ).catch((error) => {
                      updateMachineState(machine, {
                        connected: true,
                        error: `DB save failed: ${error.message}`,
                      });
                      console.error(
                        `Leak test transition save failed for ${machineKey}:`,
                        error.message
                      );
                    });
                  } else if (previousLive && fallbackDue) {
                    await persistLeakSnapshot(
                      machine,
                      previousLive,
                      new Date(previousLive.observedAt || Date.now()),
                      "timed-fallback",
                      { allowSameSignature: true }
                    ).catch((error) => {
                      updateMachineState(machine, {
                        connected: true,
                        error: `DB save failed: ${error.message}`,
                      });
                      console.error(
                        `Leak test timed fallback save failed for ${machineKey}:`,
                        error.message
                      );
                    });
                  }

                  lastLeakLiveSnapshots.set(machineKey, {
                    readings: probeReadings,
                    partName: probePayload.partName || currentQr || "",
                    observedAt: probePayload.observedAt || new Date().toISOString(),
                    firstObservedAt: sameLiveSignature && !previousLive?.saved
                      ? previousLive.firstObservedAt || previousLive.observedAt || probePayload.observedAt || new Date().toISOString()
                      : probePayload.observedAt || new Date().toISOString(),
                    signature: currentSignature,
                    saved: false,
                  });
                }
              }
              if (!probePayload && consecutiveReadFailures >= PLC_MAX_CONSECUTIVE_READ_FAILURES) {
                throw new Error(`PLC live reads failed ${consecutiveReadFailures} times; reconnecting.`);
              }
            }

            lastCycleStartBit = cycleStart;
            lastCycleEndBit = cycleEnd;
            await sleep(Number(process.env.PLC_LEAK_POLL_MS || process.env.PLC_POLL_MS || 1000));
          }
        }

        // â”€ UBE LOOP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        const cycleStartDevice = getConfiguredRegisterDevice(
          machine,
          ["cycle_start", "cycle start", "start"],
          CYCLE_START_DEVICE
        );
        const cycleEndDevice = getConfiguredRegisterDevice(
          machine,
          ["cycle_end", "cycle end", "end"],
          CYCLE_END_DEVICE
        );
        let lastCycleStartBit = cycleStartDevice
          ? await readBit(sock, cycleStartDevice).catch(() => 0)
          : 0;
        let cycleStartAt = lastCycleStartBit === 1 ? new Date() : null;
        let lastCycleEndBit = 0;
        let cycleEndHandled = false;
        let lastLiveReadAt = 0;
        let lastSeenShotNumber = null;
        let lastLiveSavedShotNumber = null;
        let consecutiveReadFailures = 0;

        while (isMonitorCurrent()) {
          if (!monitoringRunning) { await sleep(UBE_CYCLE_END_POLL_MS); continue; }

          const loopStartedAt = Date.now();
          let cycleStart = lastCycleStartBit;
          let cycleEnd = lastCycleEndBit;
          try {
            cycleStart = cycleStartDevice ? await readBit(sock, cycleStartDevice) : 0;
            cycleEnd = cycleEndDevice ? await readBit(sock, cycleEndDevice) : 0;
            consecutiveReadFailures = 0;
          } catch (error) {
            if (isPlcReadTimeoutError(error)) {
              await refreshSocketAfterTimeout(`cycle bits ${cycleStartDevice || ""}/${cycleEndDevice || ""}`);
              consecutiveReadFailures = 0;
              lastLiveReadAt = 0;
              await sleep(UBE_CYCLE_END_POLL_MS);
              continue;
            }
            consecutiveReadFailures += 1;
            updateMachineState(machine, {
              connected: true,
              error: `PLC read failed (${consecutiveReadFailures}/${PLC_MAX_CONSECUTIVE_READ_FAILURES}): ${error.message}`,
            });
            if (consecutiveReadFailures >= PLC_MAX_CONSECUTIVE_READ_FAILURES) {
              throw new Error(`PLC connection stale after ${consecutiveReadFailures} read failures: ${error.message}`);
            }
          }
          const cycleStartedNow = cycleStart === 1 && lastCycleStartBit !== 1;
          const cycleEndedNow = cycleEnd === 1 && lastCycleEndBit !== 1;
          const shouldCaptureCycle = cycleEnd === 1 && !cycleEndHandled;

          if (cycleStartedNow) {
            cycleStartAt = new Date(loopStartedAt);
            cycleEndHandled = false;
            updateMachineState(machine, {
              connected: true,
              error: null,
              shotStatus: `Cycle started on ${cycleStartDevice}; waiting for ${cycleEndDevice || "cycle end"}.`,
            });
          }

          if (shouldCaptureCycle) {
            cycleEndHandled = true;
            const cycleEndAt = new Date();
            const durationSec = cycleStartAt
              ? Number(((cycleEndAt - cycleStartAt) / 1000).toFixed(2))
              : null;
            updateMachineState(machine, {
              connected: true,
              error: cycleStartAt ? null : `Cycle end received without ${cycleStartDevice || "cycle start"} start timestamp.`,
              shotStatus: cycleEndedNow
                ? `Cycle ended; duration ${durationSec ?? "-"} sec. Waiting before PLC snapshot.`
                : `Cycle end is ON; duration ${durationSec ?? "-"} sec. Waiting before PLC snapshot.`,
            });

            await sleep(UBE_CYCLE_END_DELAY_MS);
            await readAll(machine, sock, {
              persist: true,
              emit: true,
              cycleTiming: cycleStartAt && durationSec !== null
                ? { startedAt: cycleStartAt, endedAt: cycleEndAt, durationSec }
                : null,
            }).catch(async (error) => {
              if (isPlcReadTimeoutError(error)) {
                await refreshSocketAfterTimeout("cycle snapshot");
                return;
              }
              updateMachineState(machine, {
                connected: true,
                error: `Cycle snapshot failed: ${error.message}`,
              });
            });
            cycleStartAt = null;
          } else if (loopStartedAt - lastLiveReadAt >= UBE_LIVE_READ_MS) {
            lastLiveReadAt = loopStartedAt;
            let liveReadError = null;
            const livePayload = await readAll(machine, sock, {
              persist: false,
              emit: true,
              liveOnly: true,
            }).catch((error) => {
              liveReadError = error;
              if (isPlcReadTimeoutError(error)) return null;
              consecutiveReadFailures += 1;
              updateMachineState(machine, {
                connected: true,
                error: `Live read failed (${consecutiveReadFailures}/${PLC_MAX_CONSECUTIVE_READ_FAILURES}): ${error.message}`,
              });
              return null;
            });
            if (!livePayload && isPlcReadTimeoutError(liveReadError)) {
              await refreshSocketAfterTimeout("live snapshot");
              consecutiveReadFailures = 0;
              await sleep(UBE_CYCLE_END_POLL_MS);
              continue;
            }
            if (livePayload) consecutiveReadFailures = 0;
            if (!livePayload && consecutiveReadFailures >= PLC_MAX_CONSECUTIVE_READ_FAILURES) {
              throw new Error(`PLC live reads failed ${consecutiveReadFailures} times; reconnecting.`);
            }

            const currentShotNumber = livePayload?.readings?.shot_number?.value ?? null;
            if (currentShotNumber !== null && currentShotNumber !== undefined) {
              const liveFlatReadings = Object.fromEntries(
                Object.entries(livePayload.readings || {}).map(([name, r]) => [name, r?.value])
              );

              const saveOnLiveShot =
                String(process.env.PLC_UBE_SAVE_ON_LIVE_SHOT_CHANGE || "true").toLowerCase() !== "false";
              if (
                saveOnLiveShot &&
                currentShotNumber !== lastLiveSavedShotNumber &&
                hasStableCycleReadings(liveFlatReadings)
              ) {
                try {
                  const saveResult = await persistUbeReading(machine, livePayload.partName, liveFlatReadings);
                  lastLiveSavedShotNumber = currentShotNumber;
                  if (saveResult?.skipped && saveResult.reason !== "duplicate-shot-number") {
                    updateMachineState(machine, {
                      connected: true,
                      error: null,
                      shotStatus: `Live shot ${currentShotNumber} checked: ${saveResult.reason}.`,
                    });
                  } else if (!saveResult?.skipped) {
                    updateMachineState(machine, {
                      connected: true,
                      error: null,
                      shotStatus: `Live shot ${currentShotNumber} saved.`,
                    });
                  }
                } catch (error) {
                  updateMachineState(machine, {
                    connected: true,
                    error: `Live shot save failed: ${error.message}`,
                  });
                  console.error(`PLC live shot save failed for ${machine.ip}:`, error.message);
                }
              }

              if (lastSeenShotNumber === null) {
                lastSeenShotNumber = currentShotNumber;
              } else if (currentShotNumber !== lastSeenShotNumber) {
                lastSeenShotNumber = currentShotNumber;
                updateMachineState(machine, {
                  connected: true,
                  error: null,
                  shotStatus: "Shot number changed; waiting for cycle end signal.",
                });
              }
            }
          }

          if (cycleEnd === 0) cycleEndHandled = false;
          lastCycleStartBit = cycleStart;
          lastCycleEndBit = cycleEnd;
          await sleep(UBE_CYCLE_END_POLL_MS);
        }
        if (!isMonitorCurrent()) closeSocket(sock);
      } catch (error) {
        reconnectAttempt += 1;
        const reconnectDelay = reconnectDelayMs(reconnectAttempt);
        console.error(`${machineLabel} â€” Error: ${error.message}`);
        updateMachineState(machine, {
          connected: false,
          error: error.message,
          shotStatus: `PLC offline; retrying in ${Math.ceil(reconnectDelay / 1000)} sec.`,
        });
        recordConnectionChange(machine, false, error.message).catch(() => { });
        closeSocket(sock);
        await sleep(reconnectDelay);
      }
    }
  };

  const startMachineMonitors = async () => {
    for (let i = 0; i < machines.length; i++) {
      const machine = machines[i];
      const machineKey = machine.key || machine.ip;
      if (monitorTokens.has(machineKey)) continue;
      const token = Symbol(machineKey);
      monitorTokens.set(machineKey, token);
      const label = isLeakTestMachine(machine) ? "LEAKTEST" : "UBE";
      console.log(`Starting [${label}]: ${machine.name} (${machine.ip})`);
      monitorMachine(machine, token); // intentionally not awaited
      if (i < machines.length - 1) await sleep(500);
    }
  };

  const refreshConfiguredMachines = async () => {
    const configuredMachines = await getConfiguredMachines();
    const configuredByKey = new Map(configuredMachines.map((machine) => [machine.key || machine.ip, machine]));
    let changed = false;

    for (const [machineKey] of Array.from(monitorTokens.entries())) {
      if (configuredByKey.has(machineKey)) continue;
      monitorTokens.delete(machineKey);
      machineState.delete(machineKey);
      changed = true;
    }

    machines = configuredMachines;

    configuredMachines.forEach((machine) => {
      const machineKey = machine.key || machine.ip;
      if (!machineKey) return;
      const currentState = machineState.get(machineKey);
      const configChanged = currentState && (
        currentState.ip !== machine.ip ||
        Number(currentState.port) !== Number(machine.port) ||
        currentState.name !== machine.name
      );

      if (configChanged) {
        monitorTokens.delete(machineKey);
        machineState.delete(machineKey);
      }

      if (machineState.has(machineKey)) {
        machineState.set(machineKey, {
          ...machineState.get(machineKey),
          ...machine,
          machine_key: machineKey,
        });
        return;
      }

      machineState.set(machineKey, {
        ...machine,
        connected: false,
        error: null,
        lastCycleAt: null,
        lastShotNumber: null,
        partName: "",
        cycleTime: null,
        shotStatus: "Machine added from setup; starting monitor.",
        machineType: isLeakTestMachine(machine) ? "leaktest" : "ube",
      });
      changed = true;
    });

    if (changed) {
      io.emit("machines", machines);
      emitMachineState();
    }
    await startMachineMonitors();
  };

  const ensureSchemaAndStart = async () => {
    try {
      await ensureTableOnce();
      if (!monitorTokens.size) {
        machines = await getConfiguredMachines();
        machineState.clear();
        createInitialMachineState(machines).forEach((value, key) => {
          machineState.set(key, value);
        });
      }
      console.log("PLC monitor table ready — starting machine monitors");
      await startMachineMonitors();
    } catch (error) {
      console.error("PLC monitor schema check failed; starting monitor and retrying schema:", error.message);
      await startMachineMonitors();
      setTimeout(() => {
        schemaReadyPromise = null;
        ensureSchemaAndStart().catch((retryError) => {
          console.error("PLC monitor schema retry failed:", retryError.message);
        });
      }, Number(process.env.PLC_SCHEMA_RETRY_MS || 30000)).unref?.();
    }
  };

  ensureSchemaAndStart().catch((error) => {
    console.error("PLC monitor startup failed:", error.message);
  });

  const machineConfigRefreshTimer = setInterval(() => {
    refreshConfiguredMachines().catch((error) => {
      console.error("PLC machine config refresh failed:", error.message);
    });
  }, Number(process.env.PLC_MACHINE_CONFIG_REFRESH_MS || 15000));
  machineConfigRefreshTimer.unref?.();

  const isLiveReadingInHistoryRange = (liveReading = {}, { from, to } = {}) => {
    const timestamp = liveReading.recorded_at || liveReading.shot_datetime || liveReading.created_at;
    const liveTime = timestamp ? new Date(timestamp).getTime() : Date.now();
    if (!Number.isFinite(liveTime)) return true;

    if (from) {
      const fromTime = new Date(from).getTime();
      if (Number.isFinite(fromTime) && liveTime < fromTime) return false;
    }

    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        if (liveTime > toDate.getTime()) return false;
      }
    }

    return true;
  };

  const mergeLiveReadingsIntoHistory = (rows = [], args = {}) => {
    const targetId = args.ip || "";
    const liveMachines = Array.from(machineState.values()).filter((machine) => {
      if (!machine.latestReading?.has_data) return false;
      const key = machine.key || machine.ip;
      return !targetId || key === targetId || machine.ip === targetId;
    });
    if (!liveMachines.length) return rows;

    let nextRows = [...rows];
    for (const machine of liveMachines) {
      const liveReading = formatDbRowForClient(machine.latestReading);
      if (!isLiveReadingInHistoryRange(liveReading, args)) continue;

      const machineKey = machine.key || machine.ip;
      const liveShot = getComparableShotNumber(liveReading);
      let replaced = false;

      nextRows = nextRows.map((row) => {
        const sameMachine = row.machine_key === machineKey || row.plc_ip === machine.ip;
        const sameShot = liveShot !== null && getComparableShotNumber(row) === liveShot;
        if (!sameMachine || !sameShot) return row;
        replaced = true;
        return {
          ...row,
          ...liveReading,
          id: row.id ?? liveReading.id,
          history_rank: row.history_rank,
        };
      });

      if (!replaced) nextRows.unshift(liveReading);
    }

    return nextRows
      .sort((a, b) => {
        const aTime = new Date(a.recorded_at || a.shot_datetime || a.created_at || 0).getTime();
        const bTime = new Date(b.recorded_at || b.shot_datetime || b.created_at || 0).getTime();
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })
      .slice(0, clampLimit(args.limit || 200));
  };

  return {
    getStatus: () => ({
      running: monitoringRunning,
      machines: Array.from(machineState.values()),
      pendingUbeSaves: pendingUbeSaves.size,
    }),
    getLatestReadings: () =>
      getLatestReadingsForMachines(Array.from(machineState.values())),
    getReadingHistory: async (args = {}) => mergeLiveReadingsIntoHistory(await getReadingHistory(args), args),
    getConnectionEvents,
    buildReadingsCsv,
    buildReadingsExcelXml,
    buildConnectionEventsExcelXml,
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// EXPORTS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

module.exports = {
  startPlcMonitor,
  ensureTable,
  readingColumnName,
  getLatestReadingsForMachines,
  getReadingHistory,
  getConnectionEvents,
  buildReadingsCsv,
  buildReadingsExcelXml,
  buildConnectionEventsExcelXml,
};

