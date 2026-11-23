"use strict";

// Parses one QUAD telemetry message (one shot) into the raw PLC values the direct
// SLMP reader would have read, keyed by PLC device address (D1120, M4598, ...).
// Scaling is NOT done here: plcMonitorService applies the machine's own register
// config + scaleValue(), exactly as for a direct PLC read.

class QuadMessageError extends Error {}

function toDeviceKey(address) {
  return String(address || "").trim().toUpperCase();
}

function isGoodPoint(point) {
  return point && typeof point === "object" && String(point.quality || "GOOD").toUpperCase() === "GOOD";
}

// The direct reader uses readUInt16LE, so word registers are unsigned. QUAD reads some
// of them as int16; convert negatives back to the unsigned PLC value.
function toUnsignedWord(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number < 0 && number >= -32768 ? number + 65536 : number;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[^\x20-\x7e]/g, "").trim();
  return text || null;
}

// IPv4 address of the QUAD Pi ("gateway_ip"), or null.
function parseGatewayIp(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return null;
  return text.split(".").every((part) => Number(part) <= 255) ? text : null;
}

function parseAcquiredAt(value) {
  if (!value) return null;
  const date = new Date(String(value).trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseQuadTelemetry(input) {
  let message = input;
  if (Buffer.isBuffer(message)) message = message.toString("utf8");
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch (error) {
      throw new QuadMessageError(`invalid JSON: ${error.message}`);
    }
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new QuadMessageError("message is not a JSON object");
  }

  const eventUuid = String(message.event_uuid || "").trim();
  const machineId = String(message.machine_id || "").trim();
  const payload = message.payload;
  if (!eventUuid) throw new QuadMessageError("message has no event_uuid");
  if (!machineId) throw new QuadMessageError("message has no machine_id");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new QuadMessageError("message has no payload");
  }

  const rawByDevice = new Map();
  const textByDevice = new Map();
  for (const point of Object.values(payload)) {
    if (!point || typeof point !== "object") continue;
    const device = toDeviceKey(point.address);
    if (!/^[A-Z]+\d+$/.test(device)) continue; // CALC tags are QUAD calculations, not PLC values
    if (!isGoodPoint(point)) {
      rawByDevice.set(device, null);
      continue;
    }
    if (String(point.data_type || "").toLowerCase() === "string") {
      textByDevice.set(device, cleanText(point.value));
      continue;
    }
    rawByDevice.set(device, device[0] === "D" ? toUnsignedWord(point.raw_value) : point.raw_value ?? null);
  }

  const shot = message.shot && typeof message.shot === "object" ? message.shot : {};
  return {
    eventUuid,
    machineId,
    gatewayId: message.gateway_id || null,
    gatewayIp: parseGatewayIp(message.gateway_ip),
    acquiredAt: parseAcquiredAt(message.acquired_at),
    plcShotTime: shot.shot_time ? String(shot.shot_time).trim() : null,
    shotResult: shot.result || null,
    partName: cleanText(shot.part_name) || null,
    rawByDevice,
    textByDevice,
  };
}

// Raw value for a configured register. String registers (part name, D100-D110) are matched
// on their start device.
function getQuadRawValue(telemetry, parameter = {}) {
  const stringDevice = toDeviceKey(parameter.stringDevice || "").split("-")[0];
  if (stringDevice) return telemetry.textByDevice.has(stringDevice) ? telemetry.textByDevice.get(stringDevice) : null;
  const device = toDeviceKey(parameter.device);
  if (!device) return null;
  if (telemetry.rawByDevice.has(device)) return telemetry.rawByDevice.get(device);
  if (telemetry.textByDevice.has(device)) return telemetry.textByDevice.get(device);
  return null;
}

function parseQuadStatus(input) {
  let message = input;
  if (Buffer.isBuffer(message)) message = message.toString("utf8");
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch (_error) {
      message = { status: message };
    }
  }
  const status = String(message?.status || "").trim().toLowerCase();
  if (status !== "online" && status !== "offline") return null;
  return {
    online: status === "online",
    gatewayId: message?.gateway_id || null,
    gatewayIp: parseGatewayIp(message?.gateway_ip),
  };
}

module.exports = {
  QuadMessageError,
  parseQuadTelemetry,
  parseQuadStatus,
  getQuadRawValue,
  parseGatewayIp,
  toUnsignedWord,
};
