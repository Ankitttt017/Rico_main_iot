const { sleep, withTimeout, hashToRegisterValue } = require("./utils");
const { withSocket } = require("./socketPool");

const DEFAULT_CONNECT_TIMEOUT_MS = Number(process.env.PLC_CONNECT_TIMEOUT_MS || 2000);
const DEFAULT_START_ACK_TIMEOUT_MS = Number(process.env.PLC_START_ACK_TIMEOUT_MS || 3000);
const DEFAULT_END_ACK_TIMEOUT_MS = Number(process.env.PLC_END_ACK_TIMEOUT_MS || 120000);
const DEFAULT_SLMP_POLL_INTERVAL_MS = Number(process.env.PLC_SLMP_POLL_INTERVAL_MS || 150);

const DEVICE_CODES = {
  D: 0xa8,
  M: 0x90,
  X: 0x9c,
  Y: 0x9d,
  W: 0xb4,
  L: 0x92,
  F: 0x93,
  V: 0x94,
  B: 0xa0,
  R: 0xaf,
};

function toByte(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 0), 255);
}

function toUInt16(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 0), 0xffff);
}

function normalizeDevice(value, fallback = "D") {
  const key = String(value || "").trim().toUpperCase();
  return DEVICE_CODES[key] ? key : fallback;
}

function parseSignalMap(raw) {
  if (!raw) {
    return null;
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.map((entry) => ({
      key: String(entry?.key || entry?.signal || entry?.name || "").trim().toUpperCase(),
      device: entry?.device ? String(entry.device).trim().toUpperCase() : null,
    }));
  } catch (_error) {
    return null;
  }
}

function resolveDevice(machine, signalKey) {
  const fallback = normalizeDevice(process.env.PLC_SLMP_DEVICE || "D", "D");
  if (!machine) {
    return fallback;
  }
  if (machine.plc_slmp_device) {
    return normalizeDevice(machine.plc_slmp_device, fallback);
  }
  const map = parseSignalMap(machine.plc_signal_map);
  if (!map) {
    return fallback;
  }
  const found = map.find((entry) => entry.key === String(signalKey || "").trim().toUpperCase());
  if (found?.device) {
    return normalizeDevice(found.device, fallback);
  }
  return fallback;
}

function buildDeviceSpec(address, device) {
  const buffer = Buffer.alloc(4);
  buffer.writeUIntLE(Math.max(0, Number(address) || 0), 0, 3);
  buffer.writeUInt8(DEVICE_CODES[device] || DEVICE_CODES.D, 3);
  return buffer;
}

function buildFrame({ command, subcommand, data = Buffer.alloc(0), monitoringTimer = 0x0010 }) {
  const networkNo = toByte(process.env.PLC_SLMP_NETWORK_NO || 0);
  const plcNo = toByte(process.env.PLC_SLMP_PLC_NO || 0xff);
  const ioNo = toUInt16(process.env.PLC_SLMP_IO_NO || 0x03ff);
  const stationNo = toByte(process.env.PLC_SLMP_STATION_NO || 0);

  const requestDataLength = 2 + 2 + 2 + data.length;
  const frame = Buffer.alloc(9 + requestDataLength);

  frame.writeUInt16LE(0x0050, 0); // subheader 3E binary (0x50,0x00)
  frame.writeUInt8(networkNo, 2);
  frame.writeUInt8(plcNo, 3);
  frame.writeUInt16LE(ioNo, 4);
  frame.writeUInt8(stationNo, 6);
  frame.writeUInt16LE(requestDataLength, 7);
  frame.writeUInt16LE(toUInt16(monitoringTimer), 9);
  frame.writeUInt16LE(command, 11);
  frame.writeUInt16LE(subcommand, 13);
  if (data.length > 0) {
    data.copy(frame, 15);
  }
  return frame;
}

async function sendAndReceivePacket(socket, frame, timeoutMs) {
  return withTimeout(
    new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);

      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
      };

      const onError = (error) => {
        cleanup();
        reject(error);
      };

      const onData = (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length < 9) {
          return;
        }
        const payloadLength = buffer.readUInt16LE(7);
        const totalLength = 9 + payloadLength;
        if (buffer.length >= totalLength) {
          cleanup();
          resolve(buffer.subarray(0, totalLength));
        }
      };

      socket.on("data", onData);
      socket.on("error", onError);
      socket.write(frame);
    }),
    timeoutMs,
    "PLC packet timeout"
  );
}

function parseResponse(packet) {
  if (packet.length < 11) {
    throw new Error("Invalid SLMP response length");
  }
  const payloadLength = packet.readUInt16LE(7);
  const endCodeOffset = 9;
  if (packet.length < endCodeOffset + 2) {
    throw new Error("Invalid SLMP response payload");
  }
  const endCode = packet.readUInt16LE(endCodeOffset);
  if (endCode !== 0x0000) {
    throw new Error(`SLMP end code 0x${endCode.toString(16).padStart(4, "0")}`);
  }
  const dataOffset = endCodeOffset + 2;
  const dataLength = Math.max(0, payloadLength - 2);
  return packet.subarray(dataOffset, dataOffset + dataLength);
}

async function readWords(socket, { device, address, count, timeoutMs }) {
  const deviceSpec = buildDeviceSpec(address, device);
  const points = Buffer.alloc(2);
  points.writeUInt16LE(count, 0);
  const data = Buffer.concat([deviceSpec, points]);
  const frame = buildFrame({ command: 0x0401, subcommand: 0x0000, data });
  const packet = await sendAndReceivePacket(socket, frame, timeoutMs);
  const payload = parseResponse(packet);
  const values = [];
  for (let i = 0; i < count; i += 1) {
    const offset = i * 2;
    if (offset + 2 <= payload.length) {
      values.push(payload.readUInt16LE(offset));
    }
  }
  return values;
}

async function writeWords(socket, { device, address, values, timeoutMs }) {
  const deviceSpec = buildDeviceSpec(address, device);
  const points = Buffer.alloc(2);
  points.writeUInt16LE(values.length, 0);
  const dataWords = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => {
    dataWords.writeUInt16LE(value & 0xffff, index * 2);
  });
  const data = Buffer.concat([deviceSpec, points, dataWords]);
  const frame = buildFrame({ command: 0x1401, subcommand: 0x0000, data });
  const packet = await sendAndReceivePacket(socket, frame, timeoutMs);
  parseResponse(packet);
}

async function handshake({ ip, port, partId, stationNo, machine }) {
  const startRegister = Number(machine?.plc_start_register);
  const statusRegister = Number(machine?.plc_status_register);
  const partRegister =
    machine?.plc_part_register === null || machine?.plc_part_register === undefined
      ? null
      : Number(machine.plc_part_register);
  const stationRegister =
    machine?.plc_station_register === null || machine?.plc_station_register === undefined
      ? null
      : Number(machine.plc_station_register);
  const resetRegister =
    machine?.plc_reset_register === null || machine?.plc_reset_register === undefined
      ? null
      : Number(machine.plc_reset_register);
  const startValue = Number(machine?.plc_start_value ?? 1);
  const startedValue = Number(machine?.plc_started_value ?? 2);
  const endOkValue = Number(machine?.plc_end_ok_value ?? 3);
  const endNgValue = Number(machine?.plc_end_ng_value ?? 4);

  if (!Number.isFinite(startRegister) || !Number.isFinite(statusRegister)) {
    throw new Error("SLMP registers missing (plc_start_register/plc_status_register)");
  }

  return withSocket({ ip, port, timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS }, async (socket) => {
    const deviceStart = resolveDevice(machine, "TRIGGER");
    const deviceStatus = resolveDevice(machine, "STATUS");
    const devicePart = resolveDevice(machine, "PART_ID_HASH");
    const deviceStation = resolveDevice(machine, "STATION_HASH");
    const deviceReset = resolveDevice(machine, "RESET");

    const waitForStatus = async (acceptedValues, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const values = await readWords(socket, {
          device: deviceStatus,
          address: statusRegister,
          count: 1,
          timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
        });
        const status = values[0];
        if (acceptedValues.includes(status)) {
          return status;
        }
        await sleep(DEFAULT_SLMP_POLL_INTERVAL_MS);
      }
      throw new Error(`PLC SLMP status timeout (${acceptedValues.join(",")})`);
    };

    let startCommandActive = false;
    try {
      if (partRegister !== null) {
        await writeWords(socket, {
          device: devicePart,
          address: partRegister,
          values: [hashToRegisterValue(partId)],
          timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
        });
      }
      if (stationRegister !== null) {
        await writeWords(socket, {
          device: deviceStation,
          address: stationRegister,
          values: [hashToRegisterValue(stationNo)],
          timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
        });
      }

      await writeWords(socket, {
        device: deviceStart,
        address: startRegister,
        values: [startValue],
        timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      });
      startCommandActive = true;

      let firstStatus = await waitForStatus([startedValue, endOkValue, endNgValue], DEFAULT_START_ACK_TIMEOUT_MS);
      const startAck = { type: "ACK_START", partId, protocol: "SLMP", value: firstStatus };

      let finalStatus = firstStatus;
      if (firstStatus !== endOkValue && firstStatus !== endNgValue) {
        finalStatus = await waitForStatus([endOkValue, endNgValue], DEFAULT_END_ACK_TIMEOUT_MS);
      }

      await writeWords(socket, {
        device: deviceStart,
        address: startRegister,
        values: [0],
        timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      });
      startCommandActive = false;

      if (resetRegister !== null) {
        await writeWords(socket, {
          device: deviceReset,
          address: resetRegister,
          values: [0],
          timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
        });
      }

      const endAck = {
        type: finalStatus === endOkValue ? "ACK_END_OK" : "ACK_END_NG",
        partId,
        protocol: "SLMP",
        value: finalStatus,
      };

      return {
        ok: true,
        startAck,
        endAck,
        protocol: "SLMP",
      };
    } finally {
      if (startCommandActive) {
        try {
          await writeWords(socket, {
            device: deviceStart,
            address: startRegister,
            values: [0],
            timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
          });
        } catch (_error) {
          // noop
        }
      }
    }
  });
}

async function probe({ ip, port, machine, timeoutMs }) {
  const statusRegister = Number(machine?.plc_status_register);
  const deviceStatus = resolveDevice(machine, "STATUS");
  return withSocket({ ip, port, timeoutMs }, async (socket) => {
    if (Number.isFinite(statusRegister)) {
      const values = await readWords(socket, {
        device: deviceStatus,
        address: statusRegister,
        count: 1,
        timeoutMs: timeoutMs || DEFAULT_CONNECT_TIMEOUT_MS,
      });
      return {
        protocol: "SLMP",
        connected: true,
        statusRegister,
        statusValue: values[0],
      };
    }
    return { protocol: "SLMP", connected: true };
  });
}

async function reset({ ip, port, machine }) {
  const resetRegister = Number(machine?.plc_reset_register);
  const startRegister = Number(machine?.plc_start_register);
  const resetValue = Number(machine?.plc_reset_value ?? 9);

  const deviceReset = resolveDevice(machine, "RESET");
  const deviceStart = resolveDevice(machine, "TRIGGER");
  return withSocket({ ip, port, timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS }, async (socket) => {
    if (Number.isFinite(resetRegister)) {
      await writeWords(socket, {
        device: deviceReset,
        address: resetRegister,
        values: [resetValue],
        timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      });
    }
    if (Number.isFinite(startRegister)) {
      await writeWords(socket, {
        device: deviceStart,
        address: startRegister,
        values: [0],
        timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      });
    }
    return {
      protocol: "SLMP",
      connected: true,
      resetRegister: Number.isFinite(resetRegister) ? resetRegister : null,
      resetValue: Number.isFinite(resetRegister) ? resetValue : null,
      startRegister: Number.isFinite(startRegister) ? startRegister : null,
      startValue: Number.isFinite(startRegister) ? 0 : null,
    };
  });
}

async function sendCommand({ ip, port, command, machine, partId, stationNo }) {
  const normalized = String(command || "").trim().toUpperCase();
  const commandRegister = Number(machine?.plc_start_register);
  const resetRegister = Number(machine?.plc_reset_register);
  if (!Number.isFinite(commandRegister)) {
    throw new Error("SLMP command register (plc_start_register) is required");
  }

  const commandValue =
    normalized === "RESET_OPERATION"
      ? 0
      : normalized === "BLOCK_OPERATION"
      ? Number(machine?.plc_block_value ?? 2)
      : Number(machine?.plc_start_value ?? 1);

  const deviceCommand = resolveDevice(machine, "TRIGGER");
  const deviceReset = resolveDevice(machine, "RESET");
  await withSocket({ ip, port, timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS }, async (socket) => {
    if (normalized === "START_OPERATION" && Number.isFinite(machine?.plc_part_register)) {
      await writeWords(socket, {
        device: resolveDevice(machine, "PART_ID_HASH"),
        address: Number(machine.plc_part_register),
        values: [hashToRegisterValue(partId)],
        timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      });
    }
    if (normalized === "START_OPERATION" && Number.isFinite(machine?.plc_station_register)) {
      await writeWords(socket, {
        device: resolveDevice(machine, "STATION_HASH"),
        address: Number(machine.plc_station_register),
        values: [hashToRegisterValue(stationNo)],
        timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      });
    }
    await writeWords(socket, {
      device: deviceCommand,
      address: commandRegister,
      values: [commandValue],
      timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
    });
    if (normalized === "RESET_OPERATION" && Number.isFinite(resetRegister)) {
      const resetValue = Number(machine?.plc_reset_value ?? 9);
      await writeWords(socket, {
        device: deviceReset,
        address: resetRegister,
        values: [resetValue],
        timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      });
    }
  });

  return {
    protocol: "SLMP",
    command: normalized,
    register: commandRegister,
    value: commandValue,
  };
}

module.exports = {
  handshake,
  probe,
  reset,
  sendCommand,
};
