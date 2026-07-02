"use strict";

const net = require("net");

const ip = process.argv[2] || "192.168.119.207";
const port = Number(process.argv[3] || 1026);
const deviceRange = String(process.argv[4] || "D2601-2614").trim().toUpperCase();

const DEVICE_CODE = { M: 0x90, D: 0xa8, R: 0xaf };

function parseDevice(device) {
  const match = String(device || "").trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid PLC device: ${device}`);
  return { type: match[1], addr: Number.parseInt(match[2], 10) };
}

function parseDeviceRange(range) {
  const [startRaw, endRaw] = range.split("-").map((item) => item.trim()).filter(Boolean);
  const start = parseDevice(startRaw || range);
  if (!endRaw) return { startDevice: `${start.type}${start.addr}`, length: 1 };
  const end = parseDevice(/^\d+$/.test(endRaw) ? `${start.type}${endRaw}` : endRaw);
  if (start.type !== end.type || end.addr < start.addr) throw new Error(`Invalid range: ${range}`);
  return { startDevice: `${start.type}${start.addr}`, length: end.addr - start.addr + 1 };
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

function decodeWords(buffer, length) {
  const words = [];
  let text = "";
  for (let index = 0; index < length; index += 1) {
    const value = buffer.readUInt16LE(index * 2);
    words.push(value);
    const low = value & 0xff;
    const high = (value >> 8) & 0xff;
    if (low >= 32 && low <= 126) text += String.fromCharCode(low);
    if (high >= 32 && high <= 126) text += String.fromCharCode(high);
  }
  return { words, text: text.trim().replace(/[^A-Za-z0-9\-_]/g, "") };
}

async function main() {
  console.error(`Reading ${deviceRange} from ${ip}:${port}`);
  const target = parseDeviceRange(deviceRange);
  const expectedPayloadBytes = target.length * 2;
  const expectedBytes = 11 + expectedPayloadBytes;
  const packet = buildPacket(target.startDevice, target.length);

  const socket = new net.Socket();
  socket.setTimeout(8000);

  const payload = await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const cleanup = () => {
      socket.removeAllListeners("data");
      socket.removeAllListeners("error");
      socket.removeAllListeners("timeout");
      socket.removeAllListeners("close");
      socket.destroy();
    };
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total < expectedBytes) return;
      settled = true;
      const response = Buffer.concat(chunks);
      cleanup();
      resolve(response.slice(11, 11 + expectedPayloadBytes));
    });
    socket.on("error", (error) => {
      settled = true;
      cleanup();
      reject(error);
    });
    socket.on("timeout", () => {
      settled = true;
      cleanup();
      reject(new Error("PLC read timeout"));
    });
    socket.on("close", () => {
      if (settled) return;
      settled = true;
      reject(new Error(`PLC socket closed before response; received ${total} bytes`));
    });
    socket.connect(port, ip, () => {
      console.error(`Connected; requesting ${target.startDevice} length ${target.length}`);
      socket.write(packet);
    });
  });

  const decoded = decodeWords(payload, target.length);
  console.error(`Received ${payload.length} payload bytes`);
  console.log(JSON.stringify({
    ip,
    port,
    range: deviceRange,
    startDevice: target.startDevice,
    length: target.length,
    words: decoded.words,
    text: decoded.text,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
