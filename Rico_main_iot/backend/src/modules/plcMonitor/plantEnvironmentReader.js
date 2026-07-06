"use strict";

const net = require("net");
const { DEVICE_CODE, PLC_READ_TIMEOUT_MS } = require("./config/registerConfig");

const ENV_PLC = {
  enabled: String(process.env.PLC_PLANT_ENV_ENABLED || "true").toLowerCase() !== "false",
  ip: process.env.PLC_PLANT_ENV_IP || "192.168.119.206",
  port: Number(process.env.PLC_PLANT_ENV_PORT || 5002),
  temperatureDevice: process.env.PLC_PLANT_ENV_TEMPERATURE_DEVICE || "D210",
  humidityDevice: process.env.PLC_PLANT_ENV_HUMIDITY_DEVICE || "D310",
  valueType: String(process.env.PLC_PLANT_ENV_VALUE_TYPE || "real32").toLowerCase(),
  temperatureScale: Number(process.env.PLC_PLANT_ENV_TEMPERATURE_SCALE || 1),
  humidityScale: Number(process.env.PLC_PLANT_ENV_HUMIDITY_SCALE || 1),
  connectTimeoutMs: Number(process.env.PLC_PLANT_ENV_CONNECT_TIMEOUT_MS || 3000),
  cacheMs: Number(process.env.PLC_PLANT_ENV_CACHE_MS || 3000),
};

let cached = { at: 0, data: null };
let inFlight = null;
let lastWarnAt = 0;

function parseDevice(device) {
  const match = String(device || "").trim().toUpperCase().match(/^([A-Z]+)([0-9A-F]+)$/);
  if (!match) throw new Error(`Invalid plant environment PLC device: ${device}`);
  const radix = ["X", "Y"].includes(match[1]) ? 16 : 10;
  return { type: match[1], addr: Number.parseInt(match[2], radix) };
}

function buildPacket(device, count) {
  const parsed = parseDevice(device);
  const command = Buffer.alloc(10);

  command.writeUInt16LE(0x0401, 0);
  command.writeUInt16LE(0, 2);
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

function closeSocket(sock) {
  if (!sock) return;
  try {
    sock.destroy();
  } catch {
    // Ignore close errors.
  }
}

function connectEnvironmentPlc() {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
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
    const onTimeout = () => fail(new Error("Plant environment PLC connection timeout"));

    sock.setTimeout(ENV_PLC.connectTimeoutMs);
    sock.connect(ENV_PLC.port, ENV_PLC.ip, () => {
      if (settled) return;
      settled = true;
      cleanup();
      sock.setTimeout(0);
      sock.setKeepAlive(true, 10000);
      sock.setNoDelay(true);
      resolve(sock);
    });
    sock.on("error", onError);
    sock.on("timeout", onTimeout);
  });
}

function sendReceive(sock, packet, expectedPayloadBytes, label) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalReceived = 0;
    const expectedBytes = 11 + expectedPayloadBytes;
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Plant environment PLC read timeout (${PLC_READ_TIMEOUT_MS}ms): ${label}`));
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
          reject(new Error(`Plant environment PLC returned error code 0x${endCode.toString(16)}`));
          return;
        }
        resolve(data.slice(11, expectedBytes));
      } catch (error) {
        reject(new Error(`Plant environment PLC response parse failed: ${error.message}`));
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
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

function normalizeNumber(value, scale = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number((number * scale).toFixed(2));
}

async function readValue(sock, device, scale) {
  const count = ENV_PLC.valueType === "word" || ENV_PLC.valueType === "uint16" ? 1 : 2;
  const response = await sendReceive(sock, buildPacket(device, count), count * 2, `read ${device}`);

  if (ENV_PLC.valueType === "dword" || ENV_PLC.valueType === "uint32") {
    return normalizeNumber(response.readUInt32LE(0), scale);
  }
  if (ENV_PLC.valueType === "int32") {
    return normalizeNumber(response.readInt32LE(0), scale);
  }
  if (ENV_PLC.valueType === "word" || ENV_PLC.valueType === "uint16") {
    return normalizeNumber(response.readUInt16LE(0), scale);
  }

  return normalizeNumber(response.readFloatLE(0), scale);
}

async function readPlantEnvironmentUnlocked() {
  if (!ENV_PLC.enabled) return {};

  let sock = null;
  try {
    sock = await connectEnvironmentPlc();
    const temperature = await readValue(sock, ENV_PLC.temperatureDevice, ENV_PLC.temperatureScale);
    const humidity = await readValue(sock, ENV_PLC.humidityDevice, ENV_PLC.humidityScale);
    return {
      plant_temperature: temperature,
      plant_humidity: humidity,
    };
  } finally {
    closeSocket(sock);
  }
}

function warnReadFailure(error) {
  const now = Date.now();
  if (now - lastWarnAt < 30000) return;
  lastWarnAt = now;
  console.warn(`Plant environment PLC read failed: ${error.message}`);
}

async function readPlantEnvironment() {
  const now = Date.now();
  if (cached.data && now - cached.at < ENV_PLC.cacheMs) return cached.data;
  if (inFlight) return inFlight;

  inFlight = readPlantEnvironmentUnlocked()
    .then((data) => {
      cached = { at: Date.now(), data };
      inFlight = null;
      return data;
    })
    .catch((error) => {
      warnReadFailure(error);
      inFlight = null;
      return {
        plant_temperature: null,
        plant_humidity: null,
      };
    });

  return inFlight;
}

module.exports = {
  readPlantEnvironment,
};
