"use strict";

const net = require("net");
const {
  DEVICE_CODE,
  PLC_READ_TIMEOUT_MS,
} = require("../config/registerConfig");

const PLC_CONNECT_TIMEOUT_MS = Number(process.env.PLC_CONNECT_TIMEOUT_MS || 15000);

function closeSocket(sock) {
  if (!sock) return;
  try {
    sock.destroy();
  } catch (_) {
    // The monitor loop handles reconnecting.
  }
}

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

async function readControlSignal(sock, device) {
  const normalizedDevice = String(device || "").trim().toUpperCase();
  if (!normalizedDevice) return 0;
  if (["M", "X", "Y"].includes(normalizedDevice[0])) {
    return readBit(sock, normalizedDevice);
  }
  const value = await readWord(sock, normalizedDevice);
  return Number(value) === 0 ? 0 : 1;
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

  return result.trim().replace(/[^A-Za-z0-9\-_]/g, "");
}

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

module.exports = {
  closeSocket,
  connectPLC,
  parseDevice,
  parseDeviceRange,
  readBit,
  readControlSignal,
  readDWord,
  readReal32,
  readString,
  readWord,
  resolveStringReadTarget,
  sendReceive,
  withTimeout,
};
