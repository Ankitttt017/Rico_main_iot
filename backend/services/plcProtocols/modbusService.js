// UPGRADE 1 COMPLETE — 32-bit Part/Station hash via FC16 dual-register writes
const { sleep, withTimeout, hashToRegisterValue, split32To16 } = require("./utils");
const { withSocket } = require("./socketPool");
const plcLatchManager = require("../plcLatchManager");


const DEFAULT_CONNECT_TIMEOUT_MS = Number(process.env.PLC_CONNECT_TIMEOUT_MS || 2000);
const DEFAULT_START_ACK_TIMEOUT_MS = Number(process.env.PLC_START_ACK_TIMEOUT_MS || 10000);
const DEFAULT_END_ACK_TIMEOUT_MS = Number(process.env.PLC_END_ACK_TIMEOUT_MS || 120000);
const DEFAULT_MODBUS_POLL_INTERVAL_MS = Number(process.env.PLC_MODBUS_POLL_INTERVAL_MS || 150);
const DEFAULT_SIGNAL_HOLD_MS = Math.max(Number(process.env.PLC_SIGNAL_HOLD_MS || 700), 100);
const STRICT_START_ACK_REQUIRED = String(process.env.PLC_STRICT_START_ACK_REQUIRED || "true").trim().toLowerCase() !== "false";

function resolveTimingConfig(machine = {}) {
  let snapshot = {};
  try {
    snapshot = typeof machine?.plc_registers === "string" ? JSON.parse(machine.plc_registers) : machine?.plc_registers || {};
  } catch (_error) {
    snapshot = {};
  }
  return {
    signalHoldMs: Math.max(Number(snapshot?.signalHoldMs || snapshot?.plcSignalHoldMs || DEFAULT_SIGNAL_HOLD_MS), 100),
    pollIntervalMs: Math.max(Number(snapshot?.pollIntervalMs || snapshot?.plcPollIntervalMs || 50), 50),
    startAckTimeoutMs: Math.max(Number(snapshot?.startAckTimeoutMs || machine?.plc_start_ack_timeout_ms || DEFAULT_START_ACK_TIMEOUT_MS), 300),
    endAckTimeoutMs: Math.max(Number(snapshot?.endAckTimeoutMs || machine?.plc_end_ack_timeout_ms || DEFAULT_END_ACK_TIMEOUT_MS), 1000),
  };
}

function parseMachineSnapshot(machine = {}) {
  try {
    return typeof machine?.plc_registers === "string" ? JSON.parse(machine.plc_registers) : machine?.plc_registers || {};
  } catch (_error) {
    return {};
  }
}

function resolveAckConfig(machine = {}) {
  const snapshot = parseMachineSnapshot(machine);
  const confirmation = snapshot?.confirmationSignal || snapshot?.confirmation || {};
  const register = Number(
    confirmation?.register ??
    snapshot?.confirmationRegister ??
    machine?.plc_heartbeat_register
  );
  const value = Number(confirmation?.value ?? snapshot?.confirmationValue ?? 1);
  const enabled = Number.isFinite(register) && Number.isFinite(value);
  return {
    enabled,
    register: enabled ? normalizeModbusRegisterAddress(register) : null,
    value: enabled ? Math.trunc(value) : null,
  };
}

function resolveBinAckConfig(machine = {}) {
  let signalMap = [];
  try {
    signalMap = typeof machine?.plc_signal_map === "string" ? JSON.parse(machine.plc_signal_map) : machine?.plc_signal_map || [];
  } catch (e) { signalMap = []; }
  
  if (!Array.isArray(signalMap)) signalMap = [];

  const found = signalMap.find(row => {
    const s = String(row.signal || row.label || "").toUpperCase();
    return s.includes("BIN") && (s.includes("ACK") || s.includes("DEP") || s.includes("KEEP") || s.includes("PLACE"));
  });

  if (found && Number.isFinite(Number(found.register))) {
    return {
      enabled: true,
      register: normalizeModbusRegisterAddress(found.register),
      value: Number(found.value ?? 1),
      label: found.signal || found.label || "BIN_ACK"
    };
  }
  return { enabled: false };
}

function normalizeModbusRegisterAddress(register) {
  const n = Number(register);
  if (!Number.isFinite(n)) return n;
  const raw = Math.trunc(n);
  if (raw >= 40001 && raw <= 49999) return raw - 40001;
  if (raw >= 400001 && raw <= 465536) return raw - 400001;
  return raw;
}

function buildReadHoldingFrame(transactionId, unitId, register, quantity) {
  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(transactionId, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(6, 4);
  frame.writeUInt8(unitId, 6);
  frame.writeUInt8(0x03, 7);
  frame.writeUInt16BE(register, 8);
  frame.writeUInt16BE(quantity, 10);
  return frame;
}

function buildWriteSingleRegisterFrame(transactionId, unitId, register, value) {
  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(transactionId, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(6, 4);
  frame.writeUInt8(unitId, 6);
  frame.writeUInt8(0x06, 7);
  frame.writeUInt16BE(register, 8);
  frame.writeUInt16BE(value & 0xffff, 10);
  return frame;
}

/**
 * FC16 — Write Multiple Registers (Modbus Function Code 0x10)
 * Used for 32-bit hash writes: writes 2 consecutive 16-bit registers.
 * @param {number} transactionId
 * @param {number} unitId
 * @param {number} startRegister - Base register address (N). Writes to N and N+1.
 * @param {number[]} values - Array of 16-bit values [highWord, lowWord]
 */
function buildWriteMultipleRegistersFrame(transactionId, unitId, startRegister, values) {
  const regCount = values.length;
  const byteCount = regCount * 2;
  // MBAP(6) + unitId(1) + FC(1) + startReg(2) + regCount(2) + byteCount(1) + data(byteCount)
  const frame = Buffer.alloc(6 + 1 + 1 + 2 + 2 + 1 + byteCount);
  let offset = 0;
  frame.writeUInt16BE(transactionId, offset); offset += 2;  // Transaction ID
  frame.writeUInt16BE(0, offset);             offset += 2;  // Protocol ID
  frame.writeUInt16BE(7 + byteCount, offset); offset += 2;  // Length
  frame.writeUInt8(unitId, offset);           offset += 1;  // Unit ID
  frame.writeUInt8(0x10, offset);             offset += 1;  // FC16
  frame.writeUInt16BE(startRegister, offset); offset += 2;  // Start Address
  frame.writeUInt16BE(regCount, offset);      offset += 2;  // Register Count
  frame.writeUInt8(byteCount, offset);        offset += 1;  // Byte Count
  for (const val of values) {
    frame.writeUInt16BE(val & 0xffff, offset); offset += 2;
  }
  return frame;
}

function parseModbusFC16WriteResponse(packet) {
  if (packet.length < 12) throw new Error("Invalid Modbus FC16 write response");
  const functionCode = packet.readUInt8(7);
  if (functionCode === 0x90) {
    const code = packet.readUInt8(8);
    throw new Error(`Modbus FC16 exception code ${code}`);
  }
  if (functionCode !== 0x10) throw new Error(`Unexpected Modbus function code ${functionCode}`);
}

function parseModbusReadResponse(packet) {
  if (packet.length < 9) {
    throw new Error("Invalid Modbus read response");
  }
  const functionCode = packet.readUInt8(7);
  if (functionCode === 0x83) {
    const code = packet.readUInt8(8);
    throw new Error(`Modbus exception code ${code}`);
  }
  if (functionCode !== 0x03) {
    throw new Error(`Unexpected Modbus function code ${functionCode}`);
  }
  const byteCount = packet.readUInt8(8);
  if (byteCount < 2 || packet.length < 9 + byteCount) {
    throw new Error("Invalid Modbus byte count");
  }
  return packet.readUInt16BE(9);
}

function parseModbusWriteResponse(packet) {
  if (packet.length < 12) {
    throw new Error("Invalid Modbus write response");
  }
  const functionCode = packet.readUInt8(7);
  if (functionCode === 0x86) {
    const code = packet.readUInt8(8);
    throw new Error(`Modbus exception code ${code}`);
  }
  if (functionCode !== 0x06) {
    throw new Error(`Unexpected Modbus function code ${functionCode}`);
  }
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
        if (buffer.length < 6) {
          return;
        }
        const length = buffer.readUInt16BE(4);
        const totalLength = 6 + length;
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

async function handshake({ ip, port, partId, stationNo, machine }) {
  const timing = resolveTimingConfig(machine);
  const unitId = Number(machine?.plc_unit_id || 1);
  const startRegister = normalizeModbusRegisterAddress(machine?.plc_start_register);
  const statusRegister = normalizeModbusRegisterAddress(machine?.plc_status_register);
  const partRegister =
    machine?.plc_part_register === null || machine?.plc_part_register === undefined
      ? null
      : normalizeModbusRegisterAddress(machine.plc_part_register);
  const stationRegister =
    machine?.plc_station_register === null || machine?.plc_station_register === undefined
      ? null
      : normalizeModbusRegisterAddress(machine.plc_station_register);
  const resetRegister =
    machine?.plc_reset_register === null || machine?.plc_reset_register === undefined
      ? null
      : normalizeModbusRegisterAddress(machine.plc_reset_register);
  const startValue = Number(machine?.plc_start_value ?? 1);
  const startedValue = Number(machine?.plc_started_value ?? 2);
  const endOkValue = Number(machine?.plc_end_ok_value ?? 3);
  const endNgValue = Number(machine?.plc_end_ng_value ?? 4);
  const ack = resolveAckConfig(machine);

  if (!Number.isFinite(startRegister) || !Number.isFinite(statusRegister)) {
    throw new Error("MODBUS registers missing (plc_start_register/plc_status_register)");
  }

  return withSocket({ ip, port, timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS }, async (socket) => {
    let transactionId = 0;
    const nextTransactionId = () => {
      transactionId += 1;
      if (transactionId > 65535) {
        transactionId = 1;
      }
      return transactionId;
    };

    const readRegister = async (register) => {
      const frame = buildReadHoldingFrame(nextTransactionId(), unitId, register, 1);
      const packet = await sendAndReceivePacket(socket, frame, DEFAULT_CONNECT_TIMEOUT_MS);
      return parseModbusReadResponse(packet);
    };

    const writeRegister = async (register, value) => {
      const frame = buildWriteSingleRegisterFrame(nextTransactionId(), unitId, register, value);
      const packet = await sendAndReceivePacket(socket, frame, DEFAULT_CONNECT_TIMEOUT_MS);
      parseModbusWriteResponse(packet);
    };

    const waitForStatus = async (acceptedValues, timeoutMs, transitionFrom = null) => {
      const deadline = Date.now() + timeoutMs;
      let lastValue = null;
      while (Date.now() < deadline) {
        const status = await readRegister(statusRegister);
        console.log(`[PLC:MODBUS:VERBOSE] [${new Date().toISOString()}] Register ${statusRegister} READ = ${status} (expected: ${acceptedValues.join(",")}${transitionFrom !== null ? ` via transition from ${transitionFrom}` : ""})`);
        
        if (transitionFrom !== null) {
          // Edge transition detection logic
          if (lastValue === transitionFrom && acceptedValues.includes(status)) {
            return status;
          }
        } else {
          if (acceptedValues.includes(status)) {
            return status;
          }
        }
        
        lastValue = status;
        await sleep(timing.pollIntervalMs);
      }
      throw new Error(`PLC Modbus status timeout (expected: ${acceptedValues.join(",")}${transitionFrom !== null ? ` via transition from ${transitionFrom}` : ""})`);
    };

    // FC16 dual-register write helper for 32-bit hashes
    const writeHashRegisters = async (baseRegister, strValue, label) => {
      const startTime = Date.now();
      const hash32 = hashToRegisterValue(strValue);
      const [highWord, lowWord] = split32To16(hash32);
      
      const frame = buildWriteMultipleRegistersFrame(nextTransactionId(), unitId, baseRegister, [highWord, lowWord]);
      const packet = await sendAndReceivePacket(socket, frame, DEFAULT_CONNECT_TIMEOUT_MS);
      parseModbusFC16WriteResponse(packet);

      const durationMs = Date.now() - startTime;
      console.log(
        `[PLC:MODBUS] ${label} WRITE SUCCESS | hash32=${hash32} (High: 0x${highWord.toString(16).padStart(4,'0')}, Low: 0x${lowWord.toString(16).padStart(4,'0')}) | duration=${durationMs}ms`
      );

      // Implementation DSC-5.1.2: Write Verification
      const verifyFrame = buildReadHoldingFrame(nextTransactionId(), unitId, baseRegister, 2);
      const verifyPacket = await sendAndReceivePacket(socket, verifyFrame, DEFAULT_CONNECT_TIMEOUT_MS);
      const verifyBuffer = verifyPacket.subarray(9);
      const readHigh = verifyBuffer.readUInt16BE(0);
      const readLow = verifyBuffer.readUInt16BE(2);

      if (readHigh !== highWord || readLow !== lowWord) {
        throw new Error(`MODBUS_WRITE_VERIFY_FAIL for ${label}: Expected 0x${highWord.toString(16)}${lowWord.toString(16)}, got 0x${readHigh.toString(16)}${readLow.toString(16)}`);
      }
    };

    let isLatchOwner = false;
    try {
      if (!plcLatchManager.isLatched(machine?.id)) {
        if (partRegister !== null) {
          await writeHashRegisters(partRegister, partId, "PART_ID_HASH");
        }
        if (stationRegister !== null) {
          await writeHashRegisters(stationRegister, stationNo, "STATION_HASH");
        }

        await writeRegister(startRegister, startValue);
        
        // ─── LATCH ACQUIRED ──────────────────────────────────────────────────────
        plcLatchManager.acquireLatch(machine?.id, {
          startRegister,
          blockRegister: null,
          activeValue: startValue,
          cycleToken: `${machine?.id}:${partId}:${Date.now()}`,
          stationNo,
          partId,
        });
        isLatchOwner = true;
      } else {
        console.log(`[PLC:MODBUS] Handshake resumed for latched machine ${machine?.id} — skipping START rewrite`);
      }

      // REQUEST + ACK model: wait for explicit ACK register/value when configured.
      if (ack.enabled) {
        const ackDeadline = Date.now() + timing.startAckTimeoutMs;
        let ackReceived = false;
        while (Date.now() < ackDeadline) {
          const ackValue = await readRegister(ack.register);
          if (ackValue === ack.value) {
            ackReceived = true;
            break;
          }
          await sleep(timing.pollIntervalMs);
        }
        if (!ackReceived && STRICT_START_ACK_REQUIRED) {
          throw new Error(`PLC START ACK timeout (register ${ack.register} expected ${ack.value})`);
        }
      }

      // HOLD is fallback safety only, not primary synchronization.
      await sleep(timing.signalHoldMs);

      let firstStatus;
      if (plcLatchManager.hasSeenRunning(machine?.id)) {
        firstStatus = startedValue;
      } else {
        try {
          firstStatus = await waitForStatus([startedValue], timing.startAckTimeoutMs);
        } catch (e) {
          // Fallback: If we missed the transition and it's already END_OK or END_NG
          firstStatus = await readRegister(statusRegister);
          if (![startedValue, endOkValue, endNgValue].includes(firstStatus)) {
            throw e;
          }
        }
      }
      
      if (firstStatus === startedValue || firstStatus === endOkValue || firstStatus === endNgValue) {
        plcLatchManager.markRunningSeen(machine?.id);
      }
      
      const startAck = { type: "ACK_START", partId, protocol: "MODBUS_TCP", value: firstStatus };

      let finalStatus = firstStatus;
      if (firstStatus !== endOkValue && finalStatus !== endNgValue) {
        // Detect END_OK edge transition: previous == startedValue && current == endOkValue (or endNgValue)
        finalStatus = await waitForStatus([endOkValue, endNgValue], timing.endAckTimeoutMs, startedValue);
      }

      // Point 21: Optional Bin Acknowledgement for NG Parts
      if (finalStatus === endNgValue) {
        const bin = resolveBinAckConfig(machine);
        if (bin.enabled) {
          console.log(`[PLC:MODBUS] WAITING_BIN_ACK on register ${bin.register} (expected ${bin.value})`);
          const binDeadline = Date.now() + timing.endAckTimeoutMs;
          let binAckReceived = false;
          while (Date.now() < binDeadline) {
            const val = await readRegister(bin.register);
            if (val === bin.value) {
              binAckReceived = true;
              break;
            }
            await sleep(timing.pollIntervalMs);
          }
          if (!binAckReceived) {
            console.warn(`[PLC:MODBUS] BIN_ACK timeout for register ${bin.register}`);
            // We don't throw here to avoid losing the NG result, but we log the warning.
          } else {
            console.log(`[PLC:MODBUS] BIN_ACK received on register ${bin.register}`);
          }
        }
      }

      // ─── REGISTER STABILITY HOLD ─────────────────────────────────────────
      // CRITICAL: Do NOT clear the START register here.
      // The status register must remain at its final value (endOkValue / endNgValue)
      // until cycleFinalizationService sends the dedicated reset command.
      // Clearing it prematurely causes the 1→0 flicker visible in the PLC monitor.
      // The reset sequence (write resetRegister=9, startRegister=0) is exclusively
      // handled by plcService.resetPlcState() called from cycleFinalizationService.
      startCommandActive = false; // Mark as intentionally NOT cleared here.

      const endAck = {
        type: finalStatus === endOkValue ? "ACK_END_OK" : "ACK_END_NG",
        partId,
        protocol: "MODBUS_TCP",
        value: finalStatus,
      };

      return {
        ok: true,
        startAck,
        endAck,
        protocol: "MODBUS_TCP",
      };
    } catch (error) {
      // Only release the latch on HARD FAILURES, not on timeout retries.
      // Timeout means the machine might still be running and we just lost connection.
      // We must hold the START register stable so the PLC doesn't abort its physical cycle.
      const isTimeout = String(error?.message || "").toUpperCase().includes("TIMEOUT");
      if (!isTimeout && isLatchOwner) {
        console.warn(`[PLC:MODBUS] Handshake HARD aborted — clearing START register ${startRegister} due to error: ${error.message}`);
        plcLatchManager.releaseLatch(machine?.id, "HANDSHAKE_ABORT_ERROR");
        try {
          await writeRegister(startRegister, 0);
        } catch (_e) {}
      }
      throw error;
    }
  });
}

async function probe({ ip, port, machine, timeoutMs }) {
  const unitId = Number(machine?.plc_unit_id || 1);
  const statusRegister = normalizeModbusRegisterAddress(machine?.plc_status_register);
  if (!Number.isFinite(statusRegister)) {
  return withSocket({ ip, port, timeoutMs }, async () => ({
    protocol: "MODBUS_TCP",
    connected: true,
  }));
  }

  return withSocket({ ip, port, timeoutMs }, async (socket) => {
    let transactionId = 0;
    const nextTransactionId = () => {
      transactionId += 1;
      if (transactionId > 65535) {
        transactionId = 1;
      }
      return transactionId;
    };

    const frame = buildReadHoldingFrame(nextTransactionId(), unitId, statusRegister, 1);
    const packet = await sendAndReceivePacket(socket, frame, timeoutMs || DEFAULT_CONNECT_TIMEOUT_MS);
    const statusValue = parseModbusReadResponse(packet);
    return {
      protocol: "MODBUS_TCP",
      connected: true,
      statusRegister,
      statusValue,
    };
  });
}

async function reset({ ip, port, machine }) {
  const unitId = Number(machine?.plc_unit_id || 1);
  const resetRegister = normalizeModbusRegisterAddress(machine?.plc_reset_register);
  const startRegister = normalizeModbusRegisterAddress(machine?.plc_start_register);
  const resetValue = Number(machine?.plc_reset_value ?? 9);

  if (!Number.isFinite(resetRegister)) {
    throw new Error("MODBUS reset register is required for reset command");
  }

  return withSocket({ ip, port, timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS }, async (socket) => {
    let transactionId = 0;
    const nextTransactionId = () => {
      transactionId += 1;
      if (transactionId > 65535) {
        transactionId = 1;
      }
      return transactionId;
    };

    const writeRegister = async (register, value) => {
      const frame = buildWriteSingleRegisterFrame(nextTransactionId(), unitId, register, value);
      const packet = await sendAndReceivePacket(socket, frame, DEFAULT_CONNECT_TIMEOUT_MS);
      parseModbusWriteResponse(packet);
    };

    await writeRegister(resetRegister, resetValue);
    if (Number.isFinite(startRegister)) {
      await writeRegister(startRegister, 0);
    }

    return {
      protocol: "MODBUS_TCP",
      connected: true,
      resetRegister,
      resetValue,
      startRegister: Number.isFinite(startRegister) ? startRegister : null,
      startValue: Number.isFinite(startRegister) ? 0 : null,
    };
  });
}

async function sendCommand({ ip, port, command, machine, partId, stationNo }) {
  const normalized = String(command || "").trim().toUpperCase();
  const unitId = Number(machine?.plc_unit_id || 1);
  const commandRegister = normalizeModbusRegisterAddress(machine?.plc_start_register);
  const resetRegister = normalizeModbusRegisterAddress(machine?.plc_reset_register);
  if (!Number.isFinite(commandRegister)) {
    throw new Error("MODBUS command register (plc_start_register) is required");
  }

  const commandValue =
    normalized === "RESET_OPERATION"
      ? 0
      : normalized === "BLOCK_OPERATION"
      ? Number(machine?.plc_block_value ?? 2)
      : Number(machine?.plc_start_value ?? 1);

  await withSocket({ ip, port, timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS }, async (socket) => {
    let transactionId = 0;
    const nextTransactionId = () => {
      transactionId += 1;
      if (transactionId > 65535) {
        transactionId = 1;
      }
      return transactionId;
    };

    const writeRegister = async (register, value) => {
      const frame = buildWriteSingleRegisterFrame(nextTransactionId(), unitId, register, value);
      const packet = await sendAndReceivePacket(socket, frame, DEFAULT_CONNECT_TIMEOUT_MS);
      parseModbusWriteResponse(packet);
    };

    if (normalized === "START_OPERATION" && partId && Number.isFinite(machine?.plc_part_register)) {
      const hash32p = hashToRegisterValue(partId);
      const [phigh, plow] = split32To16(hash32p);
      const pBase = normalizeModbusRegisterAddress(machine.plc_part_register);
      console.log(`[PLC:MODBUS] sendCommand PART_ID_HASH hash32=${hash32p} reg[${pBase}]=0x${phigh.toString(16)} reg[${pBase+1}]=0x${plow.toString(16)}`);
      const pFrame = buildWriteMultipleRegistersFrame(nextTransactionId(), unitId, pBase, [phigh, plow]);
      const pPacket = await sendAndReceivePacket(socket, pFrame, DEFAULT_CONNECT_TIMEOUT_MS);
      parseModbusFC16WriteResponse(pPacket);
    }
    if (normalized === "START_OPERATION" && stationNo && Number.isFinite(machine?.plc_station_register)) {
      const hash32s = hashToRegisterValue(stationNo);
      const [shigh, slow] = split32To16(hash32s);
      const sBase = normalizeModbusRegisterAddress(machine.plc_station_register);
      console.log(`[PLC:MODBUS] sendCommand STATION_HASH hash32=${hash32s} reg[${sBase}]=0x${shigh.toString(16)} reg[${sBase+1}]=0x${slow.toString(16)}`);
      const sFrame = buildWriteMultipleRegistersFrame(nextTransactionId(), unitId, sBase, [shigh, slow]);
      const sPacket = await sendAndReceivePacket(socket, sFrame, DEFAULT_CONNECT_TIMEOUT_MS);
      parseModbusFC16WriteResponse(sPacket);
    }
    await writeRegister(commandRegister, commandValue);
    if (normalized === "RESET_OPERATION" && Number.isFinite(resetRegister)) {
      const resetValue = Number(machine?.plc_reset_value ?? 9);
      await writeRegister(resetRegister, resetValue);
    }
  });

  return {
    protocol: "MODBUS_TCP",
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
