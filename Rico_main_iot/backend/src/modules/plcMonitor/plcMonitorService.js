"use strict";

const net = require("net");
const fs = require("fs");
const path = require("path");
const db = require("../../config/db");
const { readPlantEnvironment } = require("./plantEnvironmentReader");

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
  GAUGE_TABLE,
  CONNECTION_EVENTS_TABLE,
  MACHINE_READINGS_TABLE,
  MACHINE_READING_VALUES_TABLE,
  DEVICE_CODE,
  CYCLE_START_DEVICE,
  CYCLE_END_DEVICE,
  SHOT_DATE_TIME_DEVICES,
  UBE_CYCLE_END_DELAY_MS,
  UBE_CYCLE_END_POLL_MS,
  UBE_LIVE_READ_MS,
  PLC_MAX_CONSECUTIVE_READ_FAILURES,
  PLC_DB_RETRY_MS,
  PLC_DB_RETRY_MAX,
  PLC_DB_RETRY_BATCH_SIZE,
  PLC_PENDING_SAVE_FILE,
  LEAK_TEST_CONTROL,
  GAUGE_CONTROL,
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
let schemaUsableAt = 0;
const latestReadingsCache = {
  key: "",
  at: 0,
  data: null,
  promise: null,
};
const PLC_LATEST_DB_CACHE_MS = Math.max(500, Number(process.env.PLC_LATEST_DB_CACHE_MS || 3000));
const PLC_LATEST_DB_TIMEOUT_MS = Math.max(500, Number(process.env.PLC_LATEST_DB_TIMEOUT_MS || 2500));
const STOPPAGE_READING_KEYS = new Set([
  "MINOR STOPPAGE sec.",
  "minor_stoppage",
  "minor_stoppage_machine",
  "machine_breakdown",
  "minor_stoppage_start_time",
  "minor_stoppage_end_time",
  "minor_stoppage_bit",
  "stoppage_duration_sec",
  "stoppage_type",
]);

function isStoppageOrBreakdownKey(key) {
  const normalized = normalizeRegisterName(key);
  return (
    STOPPAGE_READING_KEYS.has(key) ||
    STOPPAGE_READING_KEYS.has(normalized) ||
    normalized.includes("stoppage") ||
    normalized.includes("stopage") ||
    normalized.includes("breakdown")
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// UTILITY HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function clampLimit(value, fallback = 200, max = Number(process.env.PLC_HISTORY_MAX_LIMIT || 20000)) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function clampPage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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

function getProductionDate(shotDate, shotTime) {
  if (!shotDate) return null;
  const normalizedShotDate = normalizeReadingForDB("shot_date", shotDate);
  if (!normalizedShotDate) return null;

  const timeParts = String(shotTime || "").match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  const hour = timeParts ? Number(timeParts[1]) : null;
  const minute = timeParts ? Number(timeParts[2]) : 0;
  const second = timeParts ? Number(timeParts[3] || 0) : 0;
  if (
    Number.isFinite(hour) &&
    hour >= 0 &&
    hour < 6 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  ) {
    const date = new Date(`${normalizedShotDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return normalizedShotDate;
    date.setDate(date.getDate() - 1);
    return systemDateTimeString(date).slice(0, 10);
  }

  return normalizedShotDate;
}

function getReadingProductionDate(readings = {}) {
  const explicitProductionDate = normalizeReadingForDB("shot_date", readings.production_date);
  if (explicitProductionDate) return explicitProductionDate;

  const shotDate = readings.shot_date;
  const shotTime =
    readings.shot_time ||
    (readings.shot_datetime ? String(readings.shot_datetime).replace("T", " ").slice(11, 19) : null);
  return getProductionDate(shotDate, shotTime);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PLC_CONNECT_TIMEOUT_MS = Number(process.env.PLC_CONNECT_TIMEOUT_MS || 15000);
const PLC_RECONNECT_MIN_MS = Number(process.env.PLC_RECONNECT_MIN_MS || process.env.PLC_RECONNECT_MS || 2000);
const PLC_RECONNECT_MAX_MS = Number(process.env.PLC_RECONNECT_MAX_MS || 30000);
const PLC_RECONNECT_BACKOFF_FACTOR = Number(process.env.PLC_RECONNECT_BACKOFF_FACTOR || 1.6);
const PLC_RECONNECT_JITTER_MS = Number(process.env.PLC_RECONNECT_JITTER_MS || 1000);
const UBE_PART_NAME_DEVICE = process.env.PLC_UBE_PART_NAME_DEVICE || "D100";
const UBE_PART_NAME_LENGTH = Number(process.env.PLC_UBE_PART_NAME_LENGTH || 12);

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
  return getMachineTypeName(machine) === "ube";
}

function isGaugeMachine(machine) {
  return getMachineTypeName(machine) === "gauge";
}

/**
 * Returns true if machine is Leak Test machine
 */
function isLeakTestMachine(machine) {
  return getMachineTypeName(machine) === "leaktest";
}

function getMachineTypeName(machine) {
  const rawKind = String(machine?.kind || machine?.machine_type || machine?.machineType || "").trim().toLowerCase();
  if (rawKind && rawKind !== "ube" && rawKind !== "generic") return rawKind;
  const machineText = [
    machine?.name,
    machine?.machine_name,
    machine?.machineKey,
    machine?.machine_key,
    machine?.key,
  ].join(" ").toLowerCase();
  const registerText = Array.isArray(machine?.registerConfig)
    ? machine.registerConfig.map((item) => String(item?.name || item?.parameter || "").toLowerCase()).join(" ")
    : "";
  if (machineText.includes("gauge") || registerText.includes("part scan") || registerText.includes("gauge status")) {
    return "gauge";
  }
  if (machineText.includes("leak")) return "leaktest";
  return rawKind || "ube";
}

function normalizeUbeReadParameter(parameter = {}) {
  const normalizedName = normalizeRegisterName(parameter.name || parameter.parameter || parameter.label);
  if (
    normalizedName === normalizeRegisterName("MINOR STOPPAGE sec.") ||
    normalizedName === normalizeRegisterName("minor_stoppage") ||
    normalizedName.includes("minor_stop")
  ) {
    return null;
  }
  return parameter;
}

function mergeUbeReadParameters(configuredParameters = []) {
  const merged = [];
  const seen = new Set();

  const add = (parameter) => {
    if (!parameter) return;
    const normalized = normalizeUbeReadParameter(parameter);
    if (!normalized) return;
    const deviceKey = String(normalized.device || normalized.stringDevice || "").trim().toUpperCase();
    const nameKey = normalizeRegisterName(normalized.name || normalized.parameter || normalized.label);
    const key = deviceKey || nameKey;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    merged.push(normalized);
  };

  configuredParameters
    .filter((parameter) => parameter && parameter.enabled !== false)
    .forEach(add);
  UBE_READ_PARAMETERS.forEach(add);

  return merged;
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
  const machineType = getMachineTypeName(machine);
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
  const match = String(device || "").trim().toUpperCase().match(/^([A-Z]+)([0-9A-F]+)$/);
  if (!match) throw new Error(`Invalid PLC device: ${device}`);
  const radix = ["X", "Y"].includes(match[1]) ? 16 : 10;
  return { type: match[1], addr: Number.parseInt(match[2], radix) };
}

function parseDeviceRange(deviceRange) {
  const raw = String(deviceRange || "").trim().toUpperCase();
  const [startRaw, endRaw] = raw.split("-").map((item) => item.trim()).filter(Boolean);
  const start = parseDevice(startRaw || raw);
  if (!endRaw) return { startDevice: `${start.type}${start.addr}`, length: null };

  let resolvedEndRaw = endRaw;
  const endIsAddressOnly = !/^[A-Z]/i.test(endRaw) && /^[0-9A-F]+$/i.test(endRaw);
  if (endIsAddressOnly) {
    const startAddress = String(startRaw || raw).replace(/^[A-Z]+/i, "");
    const shouldExpandSuffix =
      endRaw.length < startAddress.length &&
      !["X", "Y"].includes(start.type);
    resolvedEndRaw = shouldExpandSuffix
      ? `${startAddress.slice(0, startAddress.length - endRaw.length)}${endRaw}`
      : endRaw;
  }
  const resolvedEndIsAddressOnly = !/^[A-Z]/i.test(resolvedEndRaw) && /^[0-9A-F]+$/i.test(resolvedEndRaw);
  const end = parseDevice(resolvedEndIsAddressOnly ? `${start.type}${resolvedEndRaw}` : resolvedEndRaw);
  if (start.type !== end.type || end.addr < start.addr) {
    throw new Error(`Invalid PLC device range: ${deviceRange}`);
  }

  return {
    startDevice: `${start.type}${start.addr}`,
    length: (end.addr - start.addr) + 1,
  };
}

function resolveStringReadTarget(stringDevice, stringLength) {
  const { startDevice, length: rangeLength } = parseDeviceRange(stringDevice);
  const configuredLength = Number.parseInt(stringLength, 10);
  return {
    startDevice,
    length: rangeLength || (Number.isFinite(configuredLength) && configuredLength > 0 ? configuredLength : 1),
  };
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
  if (isStringRegisterType(parameter.type)) return String(value);
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

function isStringRegisterType(type) {
  return ["text", "string", "ascii", "stringascii", "char", "chars"].includes(
    String(type || "").trim().toLowerCase().replace(/[\s/_-]+/g, "")
  );
}

async function readConfiguredParameter(sock, parameter, rawCache) {
  const { device, stringDevice, stringLength, computed } = parameter;
  if (computed === "serial" || computed === "shotTime") return undefined;
  const stringTargetDevice = stringDevice || (isStringRegisterType(parameter.type) ? device : "");
  if (stringTargetDevice) {
    const target = resolveStringReadTarget(stringTargetDevice, stringLength);
    return readString(sock, target.startDevice, target.length);
  }
  if (!device) return null;

  if (!rawCache.has(device)) {
    const type = String(parameter.type || "").toLowerCase();
    const rawValue = ["M", "X", "Y"].includes(device[0])
      ? await readBit(sock, device)
      : type === "dword" || type === "uint32"
        ? await readDWord(sock, device)
        : type === "real32"
          ? await readReal32(sock, device)
          : await readWord(sock, device);
    rawCache.set(device, rawValue);
  }

  return scaleValue(parameter, rawCache.get(device));
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

function normalizeGaugeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(4)) : null;
}

const GAUGE_STATUS_NAMES = new Set([
  "gauge_status",
  "status",
  "dia_8_088_19_97_status",
]);

const GAUGE_JUDGEMENT_NAMES = new Set([
  "gauge_judgement",
  "gauge_judgment",
  "judgement",
  "judgment",
  "result",
  "receiving_gauge_judgement",
  "receiving_gauge_judgment",
]);

function findGaugeReadingValue(readings = {}, names = []) {
  const normalizedTargets = new Set(names.map(normalizeRegisterName));
  for (const name of names) {
    const value = unwrapReadingValue(readings[name]);
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  for (const [name, value] of Object.entries(readings || {})) {
    const readingValue = unwrapReadingValue(value);
    if (
      readingValue !== null &&
      readingValue !== undefined &&
      readingValue !== "" &&
      normalizedTargets.has(normalizeRegisterName(name))
    ) {
      return readingValue;
    }
  }
  return null;
}

function unwrapReadingValue(reading) {
  if (reading && typeof reading === "object" && !Buffer.isBuffer(reading)) {
    if (Object.prototype.hasOwnProperty.call(reading, "value")) {
      return unwrapReadingValue(reading.value);
    }
    if (Object.prototype.hasOwnProperty.call(reading, "raw")) {
      return unwrapReadingValue(reading.raw);
    }
  }
  return reading;
}

function flattenClientReadings(readings = {}) {
  return Object.fromEntries(
    Object.entries(readings || {}).map(([name, reading]) => [name, unwrapReadingValue(reading)])
  );
}

function buildGaugeReadingSignature(readings = {}) {
  const partScanData = String(findGaugeReadingValue(readings, [
    "Part Scan Data",
    "part_scan_data",
    "part_qr_code",
    "scan_data",
    "qr_code",
  ]) || "").trim();
  const gaugeStatus = String(findGaugeReadingValue(readings, ["Gauge Status", "gauge_status", "status", "Status"]) ?? "").trim();
  const gaugeJudgement = String(findGaugeReadingValue(readings, [
    "Gauge Judgement",
    "gauge_judgement",
    "judgement",
    "judgment",
    "result",
    "Result",
  ]) ?? "").trim();
  const cycleTime = String(findGaugeReadingValue(readings, [
    "Cycle Time In Sec",
    "Cycle Time Sec",
    "cycle_time_in_sec",
    "cycle_time_sec",
    "cycle_time",
  ]) ?? "").trim();
  const cycleMode = String(findGaugeReadingValue(readings, [
    "Cycle Mode Auto/Manual",
    "Cycle Mode Auto Manual",
    "cycle_mode_auto_manual",
    "cycle_mode",
    "mode",
  ]) ?? "").trim();

  if (!partScanData && !gaugeStatus && !gaugeJudgement) return "";
  return [partScanData, gaugeStatus, gaugeJudgement, cycleTime, cycleMode].join("|");
}

function canonicalGaugeReadingName(name = "") {
  const normalized = normalizeRegisterName(name);
  if (GAUGE_STATUS_NAMES.has(normalized) || (normalized.includes("dia") && normalized.includes("status"))) {
    return "gauge_status";
  }
  if (GAUGE_JUDGEMENT_NAMES.has(normalized)) {
    return "gauge_judgement";
  }
  return "";
}

function findConfiguredRegisterDevice(machine, names = []) {
  const normalizedTargets = new Set(names.map(normalizeRegisterName));
  const register = Array.isArray(machine?.registerConfig)
    ? machine.registerConfig.find((item) => normalizedTargets.has(normalizeRegisterName(item?.name || item?.parameter)))
    : null;
  return String(register?.device || register?.stringDevice || "").trim().toUpperCase();
}

function utcDateTimeString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (number, size = 2) => String(number).padStart(size, "0");
  const datePart = [
    safeDate.getUTCFullYear(),
    pad(safeDate.getUTCMonth() + 1),
    pad(safeDate.getUTCDate()),
  ].join("-");
  const timePart = [
    pad(safeDate.getUTCHours()),
    pad(safeDate.getUTCMinutes()),
    pad(safeDate.getUTCSeconds()),
  ].join(":");
  return `${datePart} ${timePart}.${pad(safeDate.getUTCMilliseconds(), 3)}`;
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
  return hasScan && (hasResult || hasLeakValue);
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

function getFallbackDevices(envName, defaults = []) {
  return String(process.env[envName] || defaults.join(","))
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function getLeakQrDeviceCandidates(configuredDevice = "") {
  const primaryDevice = String(process.env.PLC_LEAK_SCAN_DEVICE || "D301").trim().toUpperCase();
  const configured = normalizeDeviceStart(configuredDevice);
  const fallbackDevices = getFallbackDevices("PLC_LEAK_SCAN_FALLBACK_DEVICES", [
    "D300",
    "D301",
    "D100",
    "D101",
    "D102",
  ]);
  return Array.from(new Set([configured, primaryDevice, ...fallbackDevices].filter(Boolean)));
}

function isLikelyLeakQrCode(value, minLength = Number(process.env.PLC_LEAK_SCAN_MIN_LENGTH || 4)) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^[A-Z]\d$/i.test(text)) return false;
  return text.length >= Math.max(1, Number(minLength || 4));
}

async function readLeakQrCode(sock, configuredDevice = "", configuredLength = 14) {
  const length = Number(process.env.PLC_LEAK_SCAN_LENGTH || configuredLength || 14);
  const matches = [];
  for (const device of getLeakQrDeviceCandidates(configuredDevice)) {
    if (!device) continue;
    let target = null;
    try {
      target = resolveStringReadTarget(device, length);
    } catch {
      continue;
    }
    const value = await readString(sock, target.startDevice, target.length).catch(() => "");
    if (isLikelyLeakQrCode(value)) matches.push({ value, device });
  }
  return matches.sort((a, b) => String(b.value).length - String(a.value).length)[0] || { value: "", device: "" };
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
  let rawReadings = {};
  try {
    rawReadings = row.raw_readings_json ? JSON.parse(row.raw_readings_json) : {};
  } catch {
    rawReadings = {};
  }
  const next = {
    ...(rawReadings && typeof rawReadings === "object" && !Array.isArray(rawReadings) ? rawReadings : {}),
    ...row,
  };

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
  Object.keys(next).forEach((column) => {
    if (isStoppageOrBreakdownKey(column)) delete next[column];
  });

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
      machine_type: getMachineTypeName(machineFallback),
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
    machine_type: getMachineTypeName(machineFallback),
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
  if (isGaugeMachine(machine)) return liveReading;
  if (isLeakTestMachine(machine) && liveReading.is_online) return liveReading;

  const liveShot = getComparableShotNumber(liveReading);
  const dbShot = getComparableShotNumber(dbReading);
  if (liveShot !== null && dbShot !== null && liveShot > dbShot) return liveReading;

  const liveTime = new Date(liveReading.recorded_at || liveReading.created_at || 0).getTime();
  const dbTime = new Date(dbReading.recorded_at || dbReading.created_at || 0).getTime();
  if (Number.isFinite(liveTime) && (!Number.isFinite(dbTime) || liveTime > dbTime)) return liveReading;

  return dbReading;
}

function buildLiveFallbackReadings(machineSnapshots = []) {
  return machineSnapshots.map((machine) => {
    if (machine.latestReading?.has_data) {
      return formatDbReading(machine.latestReading, machine);
    }
    return formatDbReading(null, machine);
  });
}

function buildReadingsForDBFromLiveSnapshot(liveReading = {}) {
  return Object.fromEntries(
    Object.entries(liveReading)
      .filter(([name]) => !LIVE_READING_METADATA_COLUMNS.has(name))
      .filter(([name]) => !STOPPAGE_READING_KEYS.has(name))
  );
}

async function persistLiveSnapshotIfAhead(machine = {}, dbReading = {}) {
  if (!isUbeMachine(machine) || isGaugeMachine(machine) || !machine.latestReading?.has_data) return null;

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

const UBE_PART_NAME_REGISTER_NAMES = new Set([
  "part_name",
  "part",
  "part_no",
  "part_number",
  "part_code",
  "model_name",
  "model_code",
  "die_name",
  "die_no",
  "die_number",
  "die_code",
  "current_part",
  "current_part_name",
  "current_die",
  "current_die_name",
]);

function isLikelyPartName(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text === "-") return false;
  if (/^[\u0000\s]+$/.test(text)) return false;
  return /[A-Za-z0-9]/.test(text) && text.length >= 3;
}

function getConfiguredUbePartNameTargets(machine = {}) {
  if (!Array.isArray(machine.registerConfig)) return [];
  return machine.registerConfig
    .filter((parameter) => parameter && parameter.enabled !== false)
    .filter((parameter) => UBE_PART_NAME_REGISTER_NAMES.has(normalizeRegisterName(
      parameter.name || parameter.parameter || parameter.label
    )))
    .map((parameter) => {
      const sourceDevice = String(parameter.stringDevice || parameter.device || "").trim();
      if (!sourceDevice) return null;
      const target = resolveStringReadTarget(sourceDevice, parameter.stringLength || UBE_PART_NAME_LENGTH);
      return {
        startDevice: target.startDevice,
        length: target.length,
        source: parameter.name || parameter.parameter || parameter.label || sourceDevice,
      };
    })
    .filter(Boolean);
}

function getUbePartNameTargets(machine = {}) {
  const envDevices = String(process.env.PLC_UBE_PART_NAME_DEVICES || UBE_PART_NAME_DEVICE)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((device) => {
      const target = resolveStringReadTarget(device, UBE_PART_NAME_LENGTH);
      return { startDevice: target.startDevice, length: target.length, source: device };
    });

  const targets = [...getConfiguredUbePartNameTargets(machine), ...envDevices];
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.startDevice}:${target.length}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readUbePartName(sock, machine = {}) {
  for (const target of getUbePartNameTargets(machine)) {
    const value = await readString(sock, target.startDevice, target.length).catch(() => "");
    if (isLikelyPartName(value)) return value.trim();
  }
  return "";
}

const LEAK_PARAMETER_ALIASES = new Map(
  Object.entries({
    part_qr_code: [
      "part_qr_code",
      "part_qr",
      "scan_data",
      "scan",
      "qr",
      "qr_code",
      "part_scan",
      "part_scan_data",
      "part_name",
    ],
    body_leak_value: ["body_leak_value", "body_leak", "leak_value"],
    gall_1: ["gall_1", "gall1", "gall_01", "gall01"],
    gall_2: ["gall_2", "gall2", "gall_02", "gall02"],
    result: ["result", "judgement", "judgment", "status"],
    auto_bit: ["auto", "auto_bit", "auto_mode", "running_mode", "cycle_mode_auto"],
    manual: ["manual", "manual_mode"],
    dry: ["dry", "dry_mode"],
    wey: ["wey", "wet", "wet_mode"],
    both: ["both", "both_mode"],
    cycle_time: ["cycle_time", "cycle_time_sec", "cycle_time_in_sec"],
  }).flatMap(([canonicalName, aliases]) =>
    aliases.map((alias) => [normalizeRegisterName(alias), canonicalName])
  )
);

function canonicalLeakParameterName(parameter = {}) {
  const normalized = normalizeRegisterName(parameter.name || parameter.parameter || parameter.label);
  return LEAK_PARAMETER_ALIASES.get(normalized) || null;
}

function normalizeDeviceStart(device = "") {
  const raw = String(device || "").trim().toUpperCase();
  if (!raw) return "";
  try {
    return parseDeviceRange(raw).startDevice;
  } catch {
    return raw;
  }
}

function normalizeLeakReadParameters(registerConfig = []) {
  if (!Array.isArray(registerConfig) || !registerConfig.length) return LEAK_TEST_PARAMETERS;

  const defaultsByName = new Map(LEAK_TEST_PARAMETERS.map((parameter) => [parameter.name, parameter]));
  const normalized = [];
  const seen = new Set();

  for (const parameter of registerConfig) {
    if (!parameter || parameter.enabled === false) continue;
    const canonicalName = canonicalLeakParameterName(parameter);
    if (!canonicalName || seen.has(canonicalName)) continue;

    const defaults = defaultsByName.get(canonicalName) || {};
    const isText = isStringRegisterType(defaults.type || parameter.type);
    const configuredDevice = String(parameter.device || "").trim();
    const configuredStringDevice = String(parameter.stringDevice || "").trim();
    const next = {
      ...parameter,
      name: canonicalName,
      type: defaults.type || parameter.type,
      hidden: defaults.hidden,
      scale: parameter.scale ?? defaults.scale,
    };

    if (isText) {
      const sourceDevice = configuredStringDevice || configuredDevice || defaults.stringDevice || defaults.device || "";
      let target = null;
      try {
        target = sourceDevice ? resolveStringReadTarget(sourceDevice, parameter.stringLength || defaults.stringLength || 1) : null;
      } catch {
        target = null;
      }
      next.stringDevice = target?.startDevice || sourceDevice;
      next.stringLength = target?.length || parameter.stringLength || defaults.stringLength || 1;
      next.device = "";
    } else {
      const sourceDevice = configuredDevice || configuredStringDevice || defaults.device || "";
      next.device = normalizeDeviceStart(sourceDevice);
      next.stringDevice = "";
      next.stringLength = "";
    }

    normalized.push(next);
    seen.add(canonicalName);
  }

  for (const parameter of LEAK_TEST_PARAMETERS) {
    if (!seen.has(parameter.name)) normalized.push(parameter);
  }

  return normalized;
}

const LEGACY_COLUMN_BY_NORMALIZED_PARAMETER = new Map(
  Object.entries(LEGACY_COLUMNS_BY_PARAMETER).map(([name, column]) => [normalizeRegisterName(name), column])
);
const LEGACY_COLUMN_BY_DEVICE = new Map(
  EXCEL_PARAMETERS
    .filter((parameter) => parameter.device && LEGACY_COLUMNS_BY_PARAMETER[parameter.name])
    .map((parameter) => [String(parameter.device).trim().toUpperCase(), LEGACY_COLUMNS_BY_PARAMETER[parameter.name]])
);

function getLegacyColumnForParameter(parameter = {}) {
  const name = parameter.name || parameter.parameter || parameter.label;
  return LEGACY_COLUMNS_BY_PARAMETER[name] ||
    LEGACY_COLUMN_BY_NORMALIZED_PARAMETER.get(normalizeRegisterName(name)) ||
    LEGACY_COLUMN_BY_DEVICE.get(String(parameter.device || "").trim().toUpperCase()) ||
    null;
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
  const machineKind =
    typeof machineOrKind === "object"
      ? (isLeakTestMachine(machineOrKind) ? "leaktest" : isGaugeMachine(machineOrKind) ? "gauge" : "ube")
      : machineOrKind;
  if (machineKind === "gauge") {
    return Object.fromEntries(
      Object.entries(readings)
        .filter(([name]) => !DROPPED_READING_COLUMNS.has(name))
        .filter(([name]) => !PARAMETER_BY_NAME.get(name)?.hidden)
        .map(([name, value]) => [name, { value, column: readingColumnName(name) }])
    );
  }
  const allowedNames = machineKind === "leaktest" ? LEAK_CLIENT_READING_NAMES : UBE_CLIENT_READING_NAMES;

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
    firstRow.machine_type === "leaktest" ||
    firstRow.part_qr_code ||
    firstRow.body_leak_value !== undefined ||
    firstRow.gall_1 !== undefined ||
    firstRow.gall_2 !== undefined ||
    firstRow.result !== undefined
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
  const cacheKey = machineSnapshots
    .map((machine) => `${machine.key || machine.ip || ""}:${machine.ip || ""}:${machine.kind || ""}`)
    .join("|");
  if (
    latestReadingsCache.data &&
    latestReadingsCache.key === cacheKey &&
    Date.now() - latestReadingsCache.at < PLC_LATEST_DB_CACHE_MS
  ) {
    return latestReadingsCache.data;
  }
  if (latestReadingsCache.promise && latestReadingsCache.key === cacheKey) {
    return Promise.race([
      latestReadingsCache.promise,
      sleep(PLC_LATEST_DB_TIMEOUT_MS).then(() => buildLiveFallbackReadings(machineSnapshots)),
    ]);
  }

  latestReadingsCache.key = cacheKey;
  latestReadingsCache.promise = getLatestReadingsForMachinesUnlocked(machineSnapshots)
    .then((data) => {
      latestReadingsCache.data = data;
      latestReadingsCache.at = Date.now();
      latestReadingsCache.promise = null;
      return data;
    })
    .catch((error) => {
      latestReadingsCache.promise = null;
      throw error;
    });

  return Promise.race([
    latestReadingsCache.promise,
    sleep(PLC_LATEST_DB_TIMEOUT_MS).then(() => buildLiveFallbackReadings(machineSnapshots)),
  ]);
}

async function getLatestReadingsForMachinesUnlocked(machineSnapshots = getMachines()) {
  await ensureTableOnce();

  const machines = machineSnapshots.length ? machineSnapshots : getMachines();
  const ubeMachines = machines.filter((m) => isUbeMachine(m) && !isGaugeMachine(m));
  const leakMachines = machines.filter((m) => isLeakTestMachine(m));
  const gaugeMachines = machines.filter((m) => isGaugeMachine(m));
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

  if (gaugeMachines.length) {
    for (const machine of gaugeMachines) {
      const machineKey = machine.key || machine.ip;
      const { rows } = await db.query(
        `SELECT TOP 1
          [Id] AS id,
          [Recorded_At] AS recorded_at,
          [Machine_Key] AS machine_key,
          [Machine_Name] AS machine_name,
          [PLC_IP] AS plc_ip,
          [PLC_Port] AS plc_port,
          [Part_Scan_Data] AS part_scan_data,
          [Cycle_Time_In_Sec] AS cycle_time_in_sec,
          [Gauge_Status] AS gauge_status,
          [Gauge_Judgement] AS gauge_judgement,
          [Cycle_Mode_Auto_Manual] AS cycle_mode_auto_manual,
          [Cycle_Start] AS cycle_start,
          [Cycle_Complete] AS cycle_complete
         FROM ${GAUGE_TABLE}
         WHERE ([Machine_Key] = ? OR [PLC_IP] = ?)
         ORDER BY [Recorded_At] DESC, [Id] DESC`,
        [machineKey, machine.ip]
      );
      if (rows[0]) {
        rowByKey.set(String(machineKey), rows[0]);
      }
    }
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

async function getReadingHistory({ ip, limit = 200, from, to, page, pageSize, shotNumber, shift, shotResult } = {}) {
  await ensureTableOnce();

  const isPaged = page !== undefined || pageSize !== undefined;
  const safeLimit = clampLimit(pageSize || limit);
  const safePage = clampPage(page);
  const offset = (safePage - 1) * safeLimit;
  const targetId = ip || "";
  const configuredMachines = await getConfiguredMachines();
  const targetMachine = configuredMachines.find(
    (m) => (m.key || m.ip) === targetId || m.ip === targetId
  );
  let gaugeTarget = targetMachine?.kind === "gauge" ? targetMachine : null;
  if (targetId && !gaugeTarget) {
    const { rows: gaugeTargetRows } = await db.query(
      `SELECT TOP 1 [Machine_Key] AS machine_key, [Machine_Name] AS machine_name, [PLC_IP] AS plc_ip, [PLC_Port] AS plc_port
       FROM ${GAUGE_TABLE}
       WHERE [Machine_Key] = ? OR [PLC_IP] = ?
       ORDER BY [Recorded_At] DESC, [Id] DESC`,
      [targetId, targetId]
    );
    if (gaugeTargetRows[0]) {
      gaugeTarget = {
        key: gaugeTargetRows[0].machine_key || targetId,
        name: gaugeTargetRows[0].machine_name || "Gauge",
        ip: gaugeTargetRows[0].plc_ip || targetId,
        port: gaugeTargetRows[0].plc_port || 1026,
        kind: "gauge",
      };
    }
  }

  const appendProductionFilters = (filters, values) => {
    if (shotNumber) {
      const searchValue = String(shotNumber).trim();
      filters.push(`(
        (TRY_CONVERT(BIGINT, ?) IS NOT NULL AND TRY_CONVERT(BIGINT, shot_number) = TRY_CONVERT(BIGINT, ?))
        OR
        (TRY_CONVERT(BIGINT, ?) IS NULL AND LTRIM(RTRIM(CAST(shot_number AS NVARCHAR(80)))) = ?)
      )`);
      values.push(searchValue, searchValue, searchValue, searchValue);
    }
    const resultMap = { ok: 1, warm: 3, ng: 5 };
    if (resultMap[shotResult]) {
      filters.push("TRY_CONVERT(INT, shot_status) = ?");
      values.push(resultMap[shotResult]);
    }
    if (shift && shift !== "all") {
      const hourExpr = "COALESCE(TRY_CONVERT(INT, shot_hour), DATEPART(hour, recorded_at))";
      const minuteExpr = "COALESCE(TRY_CONVERT(INT, shot_minute), DATEPART(minute, recorded_at))";
      if (shift === "A") filters.push(`(${hourExpr} >= 6 AND (${hourExpr} < 14 OR (${hourExpr} = 14 AND ${minuteExpr} < 30)))`);
      if (shift === "B") filters.push(`((${hourExpr} > 14 OR (${hourExpr} = 14 AND ${minuteExpr} >= 30)) AND ${hourExpr} < 23)`);
      if (shift === "C") filters.push(`(${hourExpr} < 6 OR ${hourExpr} >= 23)`);
    }
  };
  const productionDateExpr = `
    CASE
      WHEN COALESCE(TRY_CONVERT(INT, shot_hour), DATEPART(hour, recorded_at)) < 6
        THEN DATEADD(day, -1, CAST(recorded_at AS date))
      ELSE CAST(recorded_at AS date)
    END
  `;
  const productionSelect = `*, CONVERT(VARCHAR(10), ${productionDateExpr}, 23) AS production_date`;
  const appendProductionDateFilters = (filters, values) => {
    if (from) {
      filters.push(`${productionDateExpr} >= CAST(? AS date)`);
      values.push(from);
    }
    if (to) {
      filters.push(`${productionDateExpr} <= CAST(? AS date)`);
      values.push(to);
    }
  };
  const buildProductionKpisSql = (where) => `
        WITH filtered AS (
          SELECT *
          FROM ${TABLE}
          ${where}
        )
        SELECT
          (SELECT SUM(CASE WHEN TRY_CONVERT(INT, shot_status) = 1 THEN 1 ELSE 0 END) FROM filtered) AS ok,
          (SELECT SUM(CASE WHEN TRY_CONVERT(INT, shot_status) = 3 THEN 1 ELSE 0 END) FROM filtered) AS warm,
          (SELECT SUM(CASE WHEN TRY_CONVERT(INT, shot_status) = 5 THEN 1 ELSE 0 END) FROM filtered) AS off_count
      `;
  const normalizeProductionKpis = (row = {}) => ({
    ok: Number(row.ok || 0),
    warm: Number(row.warm || 0),
    off: Number(row.off_count || 0),
  });

  if (!targetId) {
    const filters = [];
    const values = [];
    appendProductionDateFilters(filters, values);
    appendProductionFilters(filters, values);
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    if (isPaged) {
      const [{ rows }, { rows: countRows }, { rows: kpiRows }] = await Promise.all([
        db.query(
          `SELECT ${productionSelect}
           FROM ${TABLE}
           ${where}
           ORDER BY recorded_at DESC, id DESC
           OFFSET ${offset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`,
          values
        ),
        db.query(`SELECT COUNT(1) AS total FROM ${TABLE} ${where}`, values),
        db.query(buildProductionKpisSql(where), values),
      ]);
      return {
        rows: sortHistoryRows(rows.map(formatDbRowForClient)),
        total: Number(countRows[0]?.total || 0),
        page: safePage,
        pageSize: safeLimit,
        kpis: normalizeProductionKpis(kpiRows[0]),
      };
    }
    const { rows } = await db.query(
      `SELECT TOP (${safeLimit}) ${productionSelect}
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
    if (shotNumber) {
      filters.push("LTRIM(RTRIM([Part_QR_Code])) LIKE ?");
      values.push(`%${String(shotNumber).trim()}%`);
    }
    const leakResultMap = { ok: "OK", ng: "NG" };
    if (leakResultMap[shotResult]) {
      filters.push("UPPER(LTRIM(RTRIM([Result]))) = ?");
      values.push(leakResultMap[shotResult]);
    }
    if (shift && shift !== "all") {
      const hourExpr = "DATEPART(hour, Cycle_End_Time)";
      const minuteExpr = "DATEPART(minute, Cycle_End_Time)";
      if (shift === "A") filters.push(`(${hourExpr} >= 6 AND (${hourExpr} < 14 OR (${hourExpr} = 14 AND ${minuteExpr} < 30)))`);
      if (shift === "B") filters.push(`((${hourExpr} > 14 OR (${hourExpr} = 14 AND ${minuteExpr} >= 30)) AND ${hourExpr} < 23)`);
      if (shift === "C") filters.push(`(${hourExpr} < 6 OR ${hourExpr} >= 23)`);
    }

    const leakRowsCte = `WITH leak_rows AS (
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
      )`;

    const leakSelect = `
      SELECT
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
      WHERE duplicate_rank = 1`;

    const rowValues = [...values, Number(targetMachine.port || 1027)];
    if (isPaged) {
      const [{ rows }, { rows: countRows }, { rows: kpiRows }] = await Promise.all([
        db.query(
          `${leakRowsCte}
          ${leakSelect}
          ORDER BY Cycle_End_Time DESC, Id DESC
          OFFSET ${offset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`,
          rowValues
        ),
        db.query(
          `${leakRowsCte}
          SELECT COUNT(1) AS total
          FROM leak_rows
          WHERE duplicate_rank = 1`,
          values
        ),
        db.query(
          `${leakRowsCte}
          SELECT
            SUM(CASE WHEN UPPER(LTRIM(RTRIM([Result]))) = 'OK' THEN 1 ELSE 0 END) AS ok,
            0 AS warm,
            SUM(CASE WHEN UPPER(LTRIM(RTRIM([Result]))) = 'NG' THEN 1 ELSE 0 END) AS off_count
          FROM leak_rows
          WHERE duplicate_rank = 1`,
          values
        ),
      ]);
      return {
        rows: sortHistoryRows(rows.map(formatDbRowForClient)),
        total: Number(countRows[0]?.total || 0),
        page: safePage,
        pageSize: safeLimit,
        kpis: normalizeProductionKpis(kpiRows[0]),
      };
    }

    const { rows } = await db.query(
      `${leakRowsCte}
      ${leakSelect}
      ORDER BY Cycle_End_Time DESC, Id DESC
      OFFSET 0 ROWS FETCH NEXT ${safeLimit} ROWS ONLY`,
      rowValues
    );
    return sortHistoryRows(rows.map(formatDbRowForClient));
  }

  if (gaugeTarget) {
    const values = [];

    const selectSql = `
      SELECT
        [Id] AS id,
        [Recorded_At] AS recorded_at,
        [Machine_Key] AS machine_key,
        [Machine_Name] AS machine_name,
        [PLC_IP] AS plc_ip,
        [PLC_Port] AS plc_port,
        [Part_Scan_Data] AS part_scan_data,
        [Cycle_Time_In_Sec] AS cycle_time_in_sec,
        [Gauge_Status] AS gauge_status,
        [Gauge_Judgement] AS gauge_judgement,
        [Cycle_Mode_Auto_Manual] AS cycle_mode_auto_manual,
        [Cycle_Start] AS cycle_start,
        [Cycle_Complete] AS cycle_complete
      FROM ${GAUGE_TABLE}
      WHERE ([Machine_Key] = ? OR [PLC_IP] = ?)`;
    values.push(gaugeTarget.key || gaugeTarget.ip, gaugeTarget.ip || targetId);

    if (from) { values.push(from); }
    if (to) { values.push(to); }
    if (shotNumber) { values.push(`%${String(shotNumber).trim()}%`); }
    const filteredSelectSql = `${selectSql}
      ${from ? " AND [Recorded_At] >= ?" : ""}
      ${to ? " AND [Recorded_At] < DATEADD(day, 1, CAST(? AS date))" : ""}
      ${shotNumber ? " AND LTRIM(RTRIM([Part_Scan_Data])) LIKE ?" : ""}`;

    if (isPaged) {
      const [{ rows }, { rows: countRows }] = await Promise.all([
        db.query(
          `SELECT
             id, recorded_at, machine_key, machine_name, plc_ip, plc_port,
             part_scan_data, cycle_time_in_sec, gauge_status, gauge_judgement,
             cycle_mode_auto_manual, cycle_start, cycle_complete
           FROM (
             SELECT gauge_rows.*,
               ROW_NUMBER() OVER (
                 PARTITION BY COALESCE(NULLIF([part_scan_data], ''), CONCAT('row-', [id]))
                 ORDER BY [recorded_at] DESC, [id] DESC
               ) AS duplicate_rank
             FROM (${filteredSelectSql}) gauge_rows
           ) deduped_gauge_rows
           WHERE duplicate_rank = 1
           ORDER BY recorded_at DESC, id DESC
           OFFSET ${offset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`,
          values
        ),
        db.query(
          `SELECT COUNT(1) AS total
           FROM (
             SELECT gauge_count.*,
               ROW_NUMBER() OVER (
                 PARTITION BY COALESCE(NULLIF([part_scan_data], ''), CONCAT('row-', [id]))
                 ORDER BY [recorded_at] DESC, [id] DESC
               ) AS duplicate_rank
             FROM (${filteredSelectSql}) gauge_count
           ) deduped_gauge_count
           WHERE duplicate_rank = 1`,
          values
        ),
      ]);
      return {
        rows: sortHistoryRows(rows.map(formatDbRowForClient)),
        total: Number(countRows[0]?.total || 0),
        page: safePage,
        pageSize: safeLimit,
        kpis: { ok: 0, warm: 0, off: 0 },
      };
    }

    const { rows } = await db.query(
      `SELECT TOP (${safeLimit})
         id, recorded_at, machine_key, machine_name, plc_ip, plc_port,
         part_scan_data, cycle_time_in_sec, gauge_status, gauge_judgement,
         cycle_mode_auto_manual, cycle_start, cycle_complete
       FROM (
         SELECT gauge_rows.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(NULLIF([part_scan_data], ''), CONCAT('row-', [id]))
             ORDER BY [recorded_at] DESC, [id] DESC
           ) AS duplicate_rank
         FROM (${filteredSelectSql}) gauge_rows
       ) deduped_gauge_rows
       WHERE duplicate_rank = 1
       ORDER BY recorded_at DESC, id DESC`,
      values
    );
    return sortHistoryRows(rows.map(formatDbRowForClient));
  }

  const machineKey = targetMachine?.key || targetMachine?.machine_key || targetId;
  const machineIp = targetMachine?.ip || targetMachine?.plc_ip || targetId;
  const legacyKey = targetId;
  const filters = ["(machine_key = ? OR plc_ip = ? OR plc_ip = ?)"];
  const values = [machineKey, machineIp, legacyKey];
  appendProductionDateFilters(filters, values);
  appendProductionFilters(filters, values);

  if (isPaged) {
    const where = `WHERE ${filters.join(" AND ")}`;
    const [{ rows }, { rows: countRows }, { rows: kpiRows }] = await Promise.all([
      db.query(
        `SELECT ${productionSelect}
         FROM ${TABLE}
         ${where}
         ORDER BY recorded_at DESC, id DESC
         OFFSET ${offset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`,
        values
      ),
      db.query(`SELECT COUNT(1) AS total FROM ${TABLE} ${where}`, values),
      db.query(buildProductionKpisSql(where), values),
    ]);
    return {
      rows: sortHistoryRows(rows.map(formatDbRowForClient)),
      total: Number(countRows[0]?.total || 0),
      page: safePage,
      pageSize: safeLimit,
      kpis: normalizeProductionKpis(kpiRows[0]),
    };
  }

  const { rows } = await db.query(
    `SELECT TOP (${safeLimit}) ${productionSelect}
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

async function updatePreviousMinorStoppageMachine() {
  return null;
}

function buildUbeTimestampSaveKey(machine, readings = {}) {
  const machineKey = machine.key || machine.ip;
  const shotNumber = normalizeReadingForDB("shot_number", readings.shot_number ?? readings["SHOT NO."]);
  const shotDate = getReadingProductionDate(readings) || normalizeReadingForDB("shot_date", readings.shot_date);
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

async function applyCycleMinorStoppage() {}

function withoutStoppageEventFields(readings = {}) {
  const copy = { ...readings };
  STOPPAGE_READING_KEYS.forEach((key) => {
    delete copy[key];
  });
  return copy;
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

function getRegisterMetadata(machine, name) {
  const normalizedName = String(name || "").trim().toLowerCase();
  const register = Array.isArray(machine.registerConfig)
    ? machine.registerConfig.find((item) => String(item?.name || "").trim().toLowerCase() === normalizedName)
    : null;
  return {
    key: readingColumnName(name),
    label: register?.label || register?.display_name || register?.name || name,
    type: register?.type || null,
    unit: register?.unit || "",
  };
}

async function persistGenericMachineReading(machine, partName, readings = {}, eventTime = null) {
  const machineKey = machine.key || machine.ip;
  if (!machineKey) return { skipped: true, reason: "missing-machine-key" };
  const cleanReadings = withoutStoppageEventFields(readings);

  const recordedAt = utcDateTimeString(new Date());
  const normalizedEventTime =
    normalizeReadingForDB("cycle_end_time", eventTime || cleanReadings.cycle_end_time) ||
    normalizeReadingForDB("shot_datetime", cleanReadings.shot_datetime) ||
    recordedAt;
  const result = await db.run(
    `INSERT INTO ${MACHINE_READINGS_TABLE} (
      recorded_at, machine_config_id, machine_key, machine_name, machine_type,
      plc_ip, plc_port, part_name, event_time, raw_readings_json
    )
    OUTPUT INSERTED.id
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recordedAt,
      machine.id || null,
      machineKey,
      machine.name || null,
      getMachineTypeName(machine),
      machine.ip || null,
      machine.port || null,
      partName || cleanReadings.part_name || cleanReadings.part_qr_code || cleanReadings.scan_data || null,
      normalizedEventTime,
      JSON.stringify(cleanReadings),
    ]
  );
  const readingId = result.rows[0]?.id;
  if (!readingId) return { skipped: true, reason: "missing-reading-id" };

  for (const [name, value] of Object.entries(cleanReadings)) {
    if (value === undefined || typeof value === "function") continue;
    const metadata = getRegisterMetadata(machine, name);
    const normalizedNumber = Number(value);
    const numericValue = value !== "" && Number.isFinite(normalizedNumber) ? normalizedNumber : null;
    const boolValue = value === true ? 1 : value === false ? 0 : null;
    const textValue = value === null || value === undefined ? null : String(value);

    await db.run(
      `INSERT INTO ${MACHINE_READING_VALUES_TABLE} (
        reading_id, parameter_key, parameter_label, parameter_type, parameter_unit,
        numeric_value, text_value, bool_value, raw_value
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        readingId,
        metadata.key,
        metadata.label,
        metadata.type,
        metadata.unit,
        numericValue,
        textValue,
        boolValue,
        textValue,
      ]
    );
  }

  return { skipped: false, id: readingId };
}

async function saveToDBUnlocked(machine, partName, readings) {
  readings = withoutStoppageEventFields(readings);
  const productionDate = getReadingProductionDate(readings);
  if (productionDate) readings = { ...readings, shot_date: productionDate };
  const columns = ["recorded_at", "machine_key", "machine_name", "plc_ip", "plc_port", "part_name"];

  const plcRecordedAt =
    normalizeReadingForDB("cycle_end_time", readings.cycle_end_time) ||
    normalizeReadingForDB("shot_datetime", readings.shot_datetime);
  const shotDate = normalizeReadingForDB("shot_date", readings.shot_date);
  const shotNumber = normalizeReadingForDB("shot_number", readings.shot_number ?? readings["SHOT NO."]);
  const hasPlcRecordedAt = Boolean(plcRecordedAt);

  if (!hasPlcRecordedAt) {
    return { skipped: true, reason: "missing-plc-shot-datetime" };
  }

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

  if (hasPlcRecordedAt && (shotNumber === null || shotNumber === undefined || !shotDate)) {
    const duplicateFilters = [
      "(machine_key = ? OR plc_ip = ?)",
    ];
    const duplicateValues = [machine.key || machine.ip, machine.ip];

    duplicateFilters.push("ABS(DATEDIFF(second, recorded_at, ?)) <= ?");
    duplicateValues.push(plcRecordedAt, Number(process.env.PLC_DUPLICATE_SHOT_WINDOW_SEC || 15));

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

  addInsertValue(columns, values, "Counter", shotNumber);

  for (const [name, value] of Object.entries(readings)) {
    if (name.startsWith("__")) continue;
    if (DROPPED_READING_COLUMNS.has(name)) continue;
    if (STOPPAGE_READING_KEYS.has(name)) continue;
    const normalizedValue = normalizeReadingForDB(name, value);
    addInsertValue(columns, values, readingColumnName(name), normalizedValue);
    const legacyColumn = LEGACY_COLUMNS_BY_PARAMETER[name];
    if (legacyColumn) addInsertValue(columns, values, legacyColumn, normalizedValue);
  }

  const savedReadings = Object.fromEntries(
    Object.entries(readings).filter(([name]) =>
      !name.startsWith("__") && !DROPPED_READING_COLUMNS.has(name) && !STOPPAGE_READING_KEYS.has(name)
    )
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
  await persistGenericMachineReading(machine, partName, savedReadings, plcRecordedAt);
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
  await persistGenericMachineReading(machine, partName, {
    ...readings,
    result,
    running_mode: runningMode,
    part_qr_code: partQrCode,
    cycle_end_time: recordedAt,
  }, recordedAt);
  return { skipped: false };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SCHEMA ENSURE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function saveGaugeToDB(machine, partName, readings, options = {}) {
  const rawPartScanData = findGaugeReadingValue(readings, [
    "Part Scan Data",
    "part_scan_data",
    "part_qr_code",
    "scan_data",
    "qr_code",
  ]) || partName || null;
  const partScanData = rawPartScanData === null || rawPartScanData === undefined
    ? null
    : String(rawPartScanData).trim();
  const cycleTimeInSec = normalizeGaugeNumber(findGaugeReadingValue(readings, [
    "Cycle Time In Sec",
    "Cycle Time Sec",
    "cycle_time_in_sec",
    "cycle_time_sec",
    "cycle_time",
  ]));
  const gaugeStatus = findGaugeReadingValue(readings, ["Gauge Status", "gauge_status", "status", "Status"]);
  const gaugeJudgement = findGaugeReadingValue(readings, ["Gauge Judgement", "gauge_judgement", "judgement", "judgment", "result", "Result"]);
  const cycleMode = findGaugeReadingValue(readings, [
    "Cycle Mode Auto/Manual",
    "Cycle Mode Auto Manual",
    "cycle_mode_auto_manual",
    "cycle_mode",
    "mode",
  ]);
  const cycleStart = Number.parseInt(findGaugeReadingValue(readings, ["Cycle Start", "cycle_start"]), 10);
  const cycleComplete = Number.parseInt(findGaugeReadingValue(readings, ["Cycle Complete", "cycle_complete"]), 10);

  if (partScanData && !options.skipDuplicateCheck) {
    const duplicateWindowSec = Math.max(1, Number(process.env.PLC_GAUGE_DUPLICATE_SCAN_WINDOW_SEC || 300));
    const { rows } = await db.query(
      `SELECT TOP 1 [Id]
       FROM ${GAUGE_TABLE}
       WHERE ([Machine_Key] = ? OR [PLC_IP] = ?)
         AND [Part_Scan_Data] = ?
         AND [Recorded_At] >= DATEADD(second, -?, SYSUTCDATETIME())
       ORDER BY [Recorded_At] DESC, [Id] DESC`,
      [machine.key || machine.ip, machine.ip, partScanData, duplicateWindowSec]
    );
    if (rows.length) {
      return { skipped: true, reason: "duplicate-gauge-scan", partScanData };
    }
  }

  await db.run(
    `INSERT INTO ${GAUGE_TABLE} (
      [Recorded_At],[Machine_Key],[Machine_Name],[PLC_IP],[PLC_Port],
      [Part_Scan_Data],[Cycle_Time_In_Sec],[Gauge_Status],[Gauge_Judgement],
      [Cycle_Mode_Auto_Manual],[Cycle_Start],[Cycle_Complete]
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      utcDateTimeString(options.recordedAt || readings.cycle_end_time || new Date()),
      machine.key || machine.ip,
      machine.name,
      machine.ip,
      machine.port,
      partScanData,
      cycleTimeInSec,
      gaugeStatus === null || gaugeStatus === undefined || gaugeStatus === "" ? null : String(gaugeStatus),
      gaugeJudgement === null || gaugeJudgement === undefined || gaugeJudgement === "" ? null : String(gaugeJudgement),
      cycleMode === null || cycleMode === undefined || cycleMode === "" ? null : String(cycleMode),
      Number.isFinite(cycleStart) ? cycleStart : null,
      Number.isFinite(cycleComplete) ? cycleComplete : null,
    ]
  );
  await persistGenericMachineReading(machine, partName, {
    ...readings,
    part_scan_data: partScanData,
    cycle_time_in_sec: cycleTimeInSec,
    gauge_status: gaugeStatus,
    gauge_judgement: gaugeJudgement,
    cycle_mode_auto_manual: cycleMode,
    cycle_start: Number.isFinite(cycleStart) ? cycleStart : null,
    cycle_complete: Number.isFinite(cycleComplete) ? cycleComplete : null,
  }, options.recordedAt || readings.cycle_end_time || null);

  return { skipped: false };
}

async function ensureTable() {
  // Schema creation is centralized in backend/schema.mssql.sql.
  // Runtime monitor must not create ad-hoc PLC columns.
  return db.initializeSchema();
}
async function backfillRecentMinorStoppageMachine() {
  return;
}

async function backfillRecentMinorStoppage() {
  return;
}

async function hasUsablePlcSchema() {
  const { rows } = await db.query(`
    SELECT CASE
      WHEN OBJECT_ID(N'${TABLE}', N'U') IS NULL THEN 0
      WHEN COL_LENGTH(N'${TABLE}', 'id') IS NULL THEN 0
      WHEN COL_LENGTH(N'${TABLE}', 'recorded_at') IS NULL THEN 0
      ELSE 1
    END AS ok
  `);
  return Number(rows[0]?.ok || 0) === 1;
}

function ensureTableOnce() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      if (schemaUsableAt && Date.now() - schemaUsableAt < Number(process.env.PLC_SCHEMA_USABLE_CACHE_MS || 300000)) {
        return;
      }

      if (await hasUsablePlcSchema()) {
        schemaUsableAt = Date.now();
        if (String(process.env.PLC_RUN_STARTUP_BACKFILLS || "false").toLowerCase() === "true") {
          await backfillRecentMinorStoppage();
          await backfillRecentMinorStoppageMachine();
        }
        return;
      }

      await ensureTable();
      schemaUsableAt = Date.now();
      if (String(process.env.PLC_RUN_STARTUP_BACKFILLS || "false").toLowerCase() === "true") {
        await backfillRecentMinorStoppage();
        await backfillRecentMinorStoppageMachine();
      }
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
        machineType: getMachineTypeName(machine),
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
      machineType: getMachineTypeName(machine),
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
        kind: getMachineTypeName(machine),
        machineType: getMachineTypeName(machine),
      };
      io.emit("plc_config", nextConfig);
      callback?.({ ok: true, unchanged: true, config: nextConfig });
    });
  });

  // â”€â”€ UBE: Read All Registers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const readAll = async (
    machine,
    sock,
    {
      persist = true,
      emit = true,
      liveOnly = false,
      cycleTiming = null,
      persistStoppage = persist,
      skipBitParameters = false,
      skipStringParameters = false,
      continueOnReadError = false,
    } = {}
  ) => {
    const readings = {};
    const rawCache = new Map();
    const now = new Date();
    const isGauge = isGaugeMachine(machine);
    const configuredParameters = Array.isArray(machine.registerConfig) ? machine.registerConfig : [];
    const readParameters = configuredParameters.length
      ? (isGauge ? configuredParameters : mergeUbeReadParameters(configuredParameters))
      : isGauge
        ? []
        : UBE_READ_PARAMETERS;

    const partName = isGauge ? "" : await readUbePartName(sock, machine);
    const shotYearRaw = isGauge ? null : await readWord(sock, SHOT_DATE_TIME_DEVICES.year).catch(() => null);
    const shotMonthRaw = isGauge ? null : await readWord(sock, SHOT_DATE_TIME_DEVICES.month).catch(() => null);
    const shotDayRaw = isGauge ? null : await readWord(sock, SHOT_DATE_TIME_DEVICES.day).catch(() => null);
    const shotHour = isGauge ? null : await readWord(sock, SHOT_DATE_TIME_DEVICES.hour).catch(() => null);
    const shotMinute = isGauge ? null : await readWord(sock, SHOT_DATE_TIME_DEVICES.minute).catch(() => null);
    const shotSecond = isGauge ? null : await readWord(sock, SHOT_DATE_TIME_DEVICES.second).catch(() => null);
    const shotTime = buildShotTimeValue(shotHour, shotMinute, shotSecond);
    const shotDateTime = buildShotDateTimeValue(
      shotYearRaw,
      shotMonthRaw,
      shotDayRaw,
      shotHour,
      shotMinute,
      shotSecond
    );
    const cycleTimestamp = shotDateTime;

    reportSerial += 1;
    readings.part_name = partName;
    const shotDate = buildShotDateValue(shotYearRaw, shotMonthRaw, shotDayRaw);
    readings.shot_date = getProductionDate(shotDate, shotTime);
    readings.production_date = readings.shot_date;
    readings.shot_time = shotTime;
    readings.shot_datetime = shotDateTime;
    readings.shot_year = pad2(shotYearRaw);
    readings.shot_month = pad2(shotMonthRaw);
    readings.shot_day = pad2(shotDayRaw);
    readings.shot_hour = pad2(shotHour);
    readings.shot_minute = pad2(shotMinute);
    readings.shot_second = pad2(shotSecond);

    for (const parameter of readParameters) {
      const { name, device, stringDevice, computed } = parameter;
      try {
        if (computed === "serial") { readings[name] = reportSerial; continue; }
        if (computed === "shotTime") { readings[name] = shotTime; continue; }
        if (!device && !stringDevice) { readings[name] = null; continue; }
        if (skipStringParameters && (stringDevice || isStringRegisterType(parameter.type))) {
          readings[name] = null;
          continue;
        }
        if (skipBitParameters && ["M", "X", "Y"].includes(String(device || "").trim().toUpperCase()[0])) {
          readings[name] = null;
          continue;
        }

        readings[name] = await readConfiguredParameter(sock, parameter, rawCache);
        const canonicalGaugeName = isGauge ? canonicalGaugeReadingName(name) : "";
        if (canonicalGaugeName && readings[canonicalGaugeName] === undefined) {
          readings[canonicalGaugeName] = readings[name];
        }
        const legacyColumn = getLegacyColumnForParameter(parameter);
        if (legacyColumn && readings[legacyColumn] === undefined) {
          readings[legacyColumn] = readings[name];
        }
        const normalizedDevice = String(device || "").trim().toUpperCase();
        const isBitDevice = ["M", "X", "Y"].includes(normalizedDevice[0]);
        if (isBitDevice) {
          readings[`${readingColumnName(name)} duration (sec)`] = updateBitDuration(
            machine, name, readings[name], now
          );
        }
      } catch (error) {
        if (!continueOnReadError && isPlcConnectionError(error)) throw error;
        readings[name] = null;
      }
    }

    if (isGauge) {
      if (readings.gauge_status === undefined || readings.gauge_status === null || readings.gauge_status === "") {
        readings.gauge_status = await readWord(sock, process.env.PLC_GAUGE_STATUS_DEVICE || "D51")
          .then((value) => scaleValue({ name: "gauge_status", type: "decimal" }, value))
          .catch(() => null);
      }
      if (readings.gauge_judgement === undefined || readings.gauge_judgement === null || readings.gauge_judgement === "") {
        readings.gauge_judgement = await readWord(sock, process.env.PLC_GAUGE_JUDGEMENT_DEVICE || "D50")
          .then((value) => scaleValue({ name: "gauge_judgement", type: "decimal" }, value))
          .catch(() => null);
      }
    }

    readings.shot_number = readings["SHOT NO."] ?? null;
    readings.ok_shot = readings["HIGH SHOT COUNT"] ?? null;
    readings.ng_counter = readings["NG COUNTER"] ?? null;
    delete readings.ng_shot;

    for (const [parameterName, legacyColumn] of Object.entries(LEGACY_COLUMNS_BY_PARAMETER)) {
      if (readings[legacyColumn] === undefined && readings[parameterName] !== undefined) {
        readings[legacyColumn] = readings[parameterName];
      }
    }

    if (!isGauge) {
      Object.assign(readings, await readPlantEnvironment());
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
        readings.cycle_start_time = startedAt.toISOString();
        readings.cycle_end_time = endedAt.toISOString();
        readings.cycle_time = durationSec;
        readings["CYCLE TIME sec."] = durationSec;
      }
    }

    STOPPAGE_READING_KEYS.forEach((key) => delete readings[key]);

    // â”€â”€ machineKey + machineType always in payload â”€â”€
    const machineKey = machine.key || machine.ip;
    const machineType = getMachineTypeName(machine);

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
        kind: getMachineTypeName(machine),
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
      if (isGauge) {
        await saveGaugeToDB(machine, partName, readings);
      } else {
        await persistUbeReading(machine, partName, withoutStoppageEventFields(readings));
      }
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
    await persistUbeReading(machine, lastPayload.partName, withoutStoppageEventFields(finalReadings));
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
    const readParameters = normalizeLeakReadParameters(machine.registerConfig);
    let configuredQrDevice = "";
    let configuredQrLength = 14;

    for (const parameter of readParameters) {
      const { name, device, stringDevice, stringLength } = parameter;
      if (name === "part_qr_code") {
        const qrTargetDevice = stringDevice || device || configuredQrDevice;
        let qrTarget = null;
        try {
          qrTarget = qrTargetDevice
            ? resolveStringReadTarget(qrTargetDevice, stringLength || configuredQrLength || 14)
            : null;
        } catch {
          qrTarget = null;
        }
        configuredQrDevice = qrTarget?.startDevice || qrTargetDevice || configuredQrDevice;
        configuredQrLength = Number(qrTarget?.length || stringLength || configuredQrLength || 14);
      }
      try {
        if (stringDevice) {
          const target = resolveStringReadTarget(stringDevice, stringLength || 1);
          readings[name] = await readString(sock, target.startDevice, target.length);
          if (name === "result" && !readings[name]) {
            readings[name] = await readWord(sock, target.startDevice).catch(() => null);
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

    const configuredQrValue = readings.part_qr_code;
    const primaryQr = await readLeakQrCode(sock, configuredQrDevice, configuredQrLength);
    if (primaryQr.value) {
      readings.part_qr_code = primaryQr.value;
      readings.scan_source_device = primaryQr.device;
    }

    readings.scan_data = primaryQr.value || (isLikelyLeakQrCode(configuredQrValue) ? configuredQrValue : "");
    readings.part_qr_code = readings.scan_data;
    readings.result = normalizeLeakResult(readings.result);
    const partName = readings.scan_data || "";
    readings.machine = machine.name;
    readings.ip = machine.ip;
    readings.status = readings.result || "CYCLE COMPLETE";
    readings.cycle_end_time = liveOnly
      ? currentState.lastCycleAt || null
      : timestamp;
    if (liveOnly) {
      readings.cycle_time = currentState.cycleTime ?? null;
    }
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
      timestamp: liveOnly ? currentState.lastCycleAt || null : timestamp,
      observedAt: timestamp,
      liveOnly,
      config: {
        key: machineKey,
        ip: machine.ip,
        port: machine.port,
        kind: getMachineTypeName(machine),
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
        kind: getMachineTypeName(machine),
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
    const machineLabel = `[${getMachineTypeName(machine).toUpperCase()}] ${machine.name} (${machine.ip})`;
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
          const gaugeNeedsReadConfirmation = isGaugeMachine(machine);
          updateMachineState(machine, {
            connected: !gaugeNeedsReadConfirmation,
            error: gaugeNeedsReadConfirmation
              ? `Gauge PLC socket reconnected after ${reason}, waiting for register response.`
              : null,
            shotStatus: gaugeNeedsReadConfirmation
              ? "Gauge socket reconnected; waiting for register data."
              : "PLC reconnected; monitoring resumed.",
          });
          return sock;
        };

        // â”€ LEAK TEST LOOP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        if (isLeakTestMachine(machine)) {
          const cycleStartDevice = LEAK_TEST_CONTROL.cycleStartDevice;
          const cycleEndDevice = LEAK_TEST_CONTROL.cycleEndDevice;

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
              const cycleEndAt = new Date();
              await sleep(Number(process.env.PLC_LEAK_CYCLE_END_SETTLE_MS || 800));
              await readStableLeakTestCycle(machine, sock, cycleEndAt, { trigger: "cycle-end" });
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

                  const allowTransitionSave = LEAK_CHANGE_SAVE_ENABLED && !cycleEndDevice;

                  if (allowTransitionSave && previousLive && (qrChanged || cycleTimeReset)) {
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
                  } else if (allowTransitionSave && previousLive && fallbackDue) {
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

        if (isGaugeMachine(machine)) {
          let consecutiveReadFailures = 0;
          const cycleStartDevice = findConfiguredRegisterDevice(machine, [
            "Cycle Start",
            "cycle_start",
            "start",
          ]) || GAUGE_CONTROL.cycleStartDevice;
          const cycleEndDevice = findConfiguredRegisterDevice(machine, [
            "Cycle Complete",
            "Cycle End",
            "cycle_complete",
            "cycle_end",
            "complete",
          ]) || GAUGE_CONTROL.cycleEndDevice;
          const gaugePollMs = Number(process.env.PLC_GAUGE_POLL_MS || process.env.PLC_POLL_MS || 200);
          const gaugeLiveReadMs = Math.max(
            gaugePollMs,
            Number(process.env.PLC_GAUGE_LIVE_READ_MS || 1000)
          );
          let lastCycleStartBit = cycleStartDevice ? await readBit(sock, cycleStartDevice).catch(() => 0) : 0;
          let lastCycleEndBit = cycleEndDevice ? await readBit(sock, cycleEndDevice).catch(() => 0) : 0;
          let cycleStartAt = lastCycleStartBit === 1 ? new Date() : null;
          let cycleEndHandled = lastCycleEndBit === 1;
          let lastGaugeLiveReadAt = 0;
          let lastGaugeFallbackSignature = "";
          let lastGaugeFallbackReadAt = 0;

          const captureGaugeFallbackSnapshot = async (reason) => {
            const now = new Date();
            const payload = await readAll(machine, sock, {
              persist: false,
              emit: true,
              liveOnly: true,
              skipBitParameters: true,
              skipStringParameters: true,
              continueOnReadError: true,
              cycleTiming: cycleStartAt
                ? {
                    startedAt: cycleStartAt,
                    endedAt: now,
                    durationSec: Number(((now - cycleStartAt) / 1000).toFixed(2)),
                  }
                : null,
            });
            const gaugeReadings = flattenClientReadings(payload.readings || {});
            if (cycleStartDevice) gaugeReadings.cycle_start = Number.isFinite(Number(lastCycleStartBit)) ? lastCycleStartBit : null;
            if (cycleEndDevice) gaugeReadings.cycle_complete = Number.isFinite(Number(lastCycleEndBit)) ? lastCycleEndBit : null;

            const signature = buildGaugeReadingSignature(gaugeReadings);
            const hasGaugeData = Boolean(signature);
            const shouldSave =
              signature &&
              signature !== lastGaugeFallbackSignature &&
              String(process.env.PLC_GAUGE_SAVE_ON_FALLBACK_CHANGE || "true").toLowerCase() !== "false";

            if (shouldSave) {
              const saveResult = await saveGaugeToDB(machine, payload.partName, gaugeReadings, {
                trigger: reason,
                recordedAt: now,
              });
              if (!saveResult?.skipped) lastGaugeFallbackSignature = signature;
            } else if (signature) {
              lastGaugeFallbackSignature = signature;
            }

            const timeoutMessage = `Gauge PLC read timeout on ${cycleStartDevice || "cycle start"}/${cycleEndDevice || "cycle end"}; no register data received.`;
            updateMachineState(machine, {
              connected: hasGaugeData,
              error: hasGaugeData ? null : timeoutMessage,
              lastCycleAt: shouldSave ? now.toISOString() : machineState.get(machine.key || machine.ip)?.lastCycleAt,
              latestReading: hasGaugeData
                ? formatLiveReadingSnapshot(machine, payload.partName, gaugeReadings, payload.observedAt || now.toISOString())
                : formatDbReading(null, { ...machine, connected: false, error: timeoutMessage }),
              cycleTime: gaugeReadings.cycle_time ?? gaugeReadings.cycle_time_in_sec ?? null,
              shotStatus: shouldSave
                ? "Gauge fallback snapshot saved."
                : hasGaugeData
                  ? "Gauge fallback snapshot updated."
                  : "Gauge PLC read timeout; waiting for register data.",
            });

            return payload;
          };

          while (isMonitorCurrent()) {
            if (!monitoringRunning) { await sleep(gaugePollMs); continue; }

            const loopStartedAt = Date.now();
            let cycleStart = lastCycleStartBit;
            let cycleEnd = lastCycleEndBit;
            try {
              cycleStart = cycleStartDevice ? await readBit(sock, cycleStartDevice) : 0;
              cycleEnd = cycleEndDevice ? await readBit(sock, cycleEndDevice) : 0;
              consecutiveReadFailures = 0;
            } catch (error) {
              if (isPlcReadTimeoutError(error)) {
                await refreshSocketAfterTimeout(`gauge cycle bits ${cycleStartDevice}/${cycleEndDevice}`);
                consecutiveReadFailures = 0;
                if (Date.now() - lastGaugeFallbackReadAt >= Number(process.env.PLC_GAUGE_FALLBACK_READ_MS || 3000)) {
                  lastGaugeFallbackReadAt = Date.now();
                  await captureGaugeFallbackSnapshot("cycle-bit-timeout").catch((fallbackError) => {
                    updateMachineState(machine, {
                      connected: true,
                      error: `Gauge fallback read failed after bit timeout: ${fallbackError.message}`,
                    });
                  });
                }
                await sleep(gaugePollMs);
                continue;
              }
              consecutiveReadFailures += 1;
              updateMachineState(machine, {
                connected: true,
                error: `Gauge cycle bit read failed (${consecutiveReadFailures}/${PLC_MAX_CONSECUTIVE_READ_FAILURES}): ${error.message}`,
              });
              if (consecutiveReadFailures >= PLC_MAX_CONSECUTIVE_READ_FAILURES) {
                throw new Error(`Gauge cycle bit reads failed ${consecutiveReadFailures} times; reconnecting.`);
              }
              await sleep(gaugePollMs);
              continue;
            }

            const cycleStartedNow = cycleStartDevice
              ? cycleStart === 1 && lastCycleStartBit !== 1
              : !cycleStartAt;
            const cycleEndedNow = cycleEndDevice
              ? cycleEnd === 1 && lastCycleEndBit !== 1
              : false;

            if (cycleStartedNow) {
              cycleStartAt = new Date(loopStartedAt);
              cycleEndHandled = false;
              const payload = await readAll(machine, sock, {
                persist: false,
                emit: true,
                liveOnly: true,
                skipBitParameters: true,
                continueOnReadError: true,
                cycleTiming: { startedAt: cycleStartAt, endedAt: cycleStartAt, durationSec: 0 },
              });
              lastGaugeLiveReadAt = Date.now();
              updateMachineState(machine, {
                connected: true,
                error: null,
                shotStatus: `Gauge cycle started on ${cycleStartDevice}; waiting for ${cycleEndDevice}.`,
                latestReading: payload?.readings
                  ? formatLiveReadingSnapshot(machine, payload.partName, flattenClientReadings(payload.readings), payload.observedAt)
                  : machineState.get(machine.key || machine.ip)?.latestReading,
              });
            }

            const cycleActive = Boolean(cycleStartAt && !cycleEndHandled && cycleEnd !== 1);
            if (cycleActive && Date.now() - lastGaugeLiveReadAt >= gaugeLiveReadMs) {
              const now = new Date();
              const durationSec = Number(((now - cycleStartAt) / 1000).toFixed(2));
              const payload = await readAll(machine, sock, {
                persist: false,
                emit: true,
                liveOnly: true,
                skipBitParameters: true,
                continueOnReadError: true,
                cycleTiming: { startedAt: cycleStartAt, endedAt: now, durationSec },
              }).catch((error) => {
                if (isPlcReadTimeoutError(error)) return { timeout: true, error };
                consecutiveReadFailures += 1;
                updateMachineState(machine, {
                  connected: true,
                  error: `Gauge live register read failed (${consecutiveReadFailures}/${PLC_MAX_CONSECUTIVE_READ_FAILURES}): ${error.message}`,
                });
                return null;
              });

              if (payload?.timeout) {
                await refreshSocketAfterTimeout("gauge live registers");
                consecutiveReadFailures = 0;
              } else if (payload) {
                consecutiveReadFailures = 0;
                lastGaugeLiveReadAt = Date.now();
                const liveReadings = flattenClientReadings(payload.readings || {});
                updateMachineState(machine, {
                  connected: true,
                  error: null,
                  cycleTime: durationSec,
                  latestReading: formatLiveReadingSnapshot(machine, payload.partName, liveReadings, payload.observedAt),
                  shotStatus: `Gauge cycle running; live data updated.`,
                });
              }

              if (consecutiveReadFailures >= PLC_MAX_CONSECUTIVE_READ_FAILURES) {
                throw new Error(`Gauge live register reads failed ${consecutiveReadFailures} times; reconnecting.`);
              }
            }

            if ((cycleEndedNow || (cycleEnd === 1 && !cycleEndHandled)) && cycleStartAt) {
              cycleEndHandled = true;
              const cycleEndAt = new Date();
              const durationSec = Number(((cycleEndAt - cycleStartAt) / 1000).toFixed(2));
              updateMachineState(machine, {
                connected: true,
                error: null,
                shotStatus: `Gauge cycle ended on ${cycleEndDevice}; saving data.`,
                cycleTime: durationSec,
              });

              if (GAUGE_CONTROL.cycleEndDelayMs > 0) {
                await sleep(GAUGE_CONTROL.cycleEndDelayMs);
              }

              const payload = await readAll(machine, sock, {
                persist: false,
                emit: true,
                liveOnly: true,
                skipBitParameters: true,
                continueOnReadError: true,
                cycleTiming: { startedAt: cycleStartAt, endedAt: cycleEndAt, durationSec },
              });
              const gaugeReadings = flattenClientReadings(payload.readings || {});
              gaugeReadings.cycle_start = 1;
              gaugeReadings.cycle_complete = 1;
              gaugeReadings.cycle_start_time = cycleStartAt.toISOString();
              gaugeReadings.cycle_end_time = cycleEndAt.toISOString();
              gaugeReadings.cycle_time = durationSec;

              const saveResult = await saveGaugeToDB(machine, payload.partName, gaugeReadings, {
                trigger: "cycle-end",
                skipDuplicateCheck: true,
                recordedAt: cycleEndAt,
              });
              if (!saveResult?.skipped) {
                const completedPayload = {
                  ...payload,
                  liveOnly: false,
                  readings: formatReadingsForClient(gaugeReadings, machine),
                  cycleTime: durationSec,
                  timestamp: cycleEndAt.toISOString(),
                  observedAt: cycleEndAt.toISOString(),
                };
                io.emit(`plc_data:${machine.key || machine.ip}`, completedPayload);
                io.emit("plc_data", completedPayload);
                io.emit("cycle_complete", completedPayload);
                updateMachineState(machine, {
                  connected: true,
                  error: null,
                  lastCycleAt: cycleEndAt.toISOString(),
                  latestReading: formatLiveReadingSnapshot(machine, payload.partName, gaugeReadings, cycleEndAt.toISOString()),
                  cycleTime: durationSec,
                  shotStatus: "Gauge cycle complete; reading saved.",
                });
              }
              cycleStartAt = null;
            }

            if (cycleEnd === 0) cycleEndHandled = false;
            lastCycleStartBit = cycleStart;
            lastCycleEndBit = cycleEnd;
            await sleep(gaugePollMs);
          }
          closeSocket(sock);
          continue;
        }

        const cycleStartDevice = CYCLE_START_DEVICE;
        const cycleEndDevice = CYCLE_END_DEVICE;
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
        const captureUbeCycleSnapshot = async (startedAt, endedAt, durationSec) => {
          let snapshotSock = null;
          try {
            await sleep(UBE_CYCLE_END_DELAY_MS);
            snapshotSock = await connectPLC(machine);
            await readAll(machine, snapshotSock, {
              persist: true,
              emit: true,
              cycleTiming: startedAt && durationSec !== null
                ? { startedAt, endedAt, durationSec }
                : null,
            });
          } catch (error) {
            updateMachineState(machine, {
              connected: true,
              error: `Cycle snapshot failed: ${error.message}`,
            });
          } finally {
            closeSocket(snapshotSock);
          }
        };

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

            captureUbeCycleSnapshot(cycleStartAt, cycleEndAt, durationSec).catch((error) => {
              console.error(`PLC cycle snapshot task failed for ${machine.ip}:`, error.message);
            });
            cycleStartAt = null;
          } else if (loopStartedAt - lastLiveReadAt >= UBE_LIVE_READ_MS) {
            lastLiveReadAt = loopStartedAt;
            let liveReadError = null;
            const livePayload = await readAll(machine, sock, {
              persist: false,
              persistStoppage: true,
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
                  const saveResult = await persistUbeReading(
                    machine,
                    livePayload.partName,
                    withoutStoppageEventFields(liveFlatReadings)
                  );
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
      const label = getMachineTypeName(machine).toUpperCase();
      console.log(`Starting [${label}]: ${machine.name} (${machine.ip})`);
      monitorMachine(machine, token); // intentionally not awaited
      if (i < machines.length - 1) await sleep(500);
    }
  };

  const refreshConfiguredMachines = async () => {
    const configuredMachines = await getConfiguredMachines(true);
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
        machineType: getMachineTypeName(machine),
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
    const productionDate = liveReading.production_date || liveReading.shot_date;
    if (productionDate) {
      const normalizedProductionDate = normalizeReadingForDB("shot_date", productionDate);
      if (normalizedProductionDate) {
        if (from && normalizedProductionDate < String(from).slice(0, 10)) return false;
        if (to && normalizedProductionDate > String(to).slice(0, 10)) return false;
        return true;
      }
    }

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
    getReadingHistory: async (args = {}) => {
      const history = await getReadingHistory(args);
      return Array.isArray(history) ? mergeLiveReadingsIntoHistory(history, args) : history;
    },
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



