const net = require("net");
const ScannerConnection = require("../models/ScannerConnection");
const { emitRealtime } = require("./realtimeService");
const { normalizeIp } = require("../utils/networkAddress");

const PROBE_TIMEOUT_MS = Math.max(Number(process.env.SCANNER_PROBE_TIMEOUT_MS || 2000), 300);
const DATA_PERSIST_THROTTLE_MS = Math.max(Number(process.env.SCANNER_DATA_PERSIST_THROTTLE_MS || 1000), 250);

const connectedScanners = new Map();

function toIsoString(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toStatus(value) {
  return String(value || "").trim().toUpperCase() === "CONNECTED" ? "CONNECTED" : "DISCONNECTED";
}

function toPublicSnapshot(entry, source = "MEMORY") {
  if (!entry) {
    return null;
  }
  const status = toStatus(entry.status);
  return {
    scannerIp: normalizeIp(entry.scannerIp),
    status,
    connected: status === "CONNECTED",
    connectedAt: toIsoString(entry.connectedAt),
    lastDataAt: toIsoString(entry.lastDataAt),
    openSockets: Math.max(Number(entry.openSockets || 0), 0),
    source,
  };
}

async function upsertConnectionRow(scannerIp, patch = {}) {
  const normalizedIp = normalizeIp(scannerIp);
  if (!normalizedIp) {
    return null;
  }

  const next = {
    scanner_ip: normalizedIp,
    status: toStatus(patch.status),
    connected_at: toDate(patch.connected_at),
    last_data_at: toDate(patch.last_data_at),
  };

  const existing = await ScannerConnection.findOne({ where: { scanner_ip: normalizedIp } });
  if (!existing) {
    return ScannerConnection.create(next);
  }

  if (!Object.prototype.hasOwnProperty.call(patch, "connected_at")) {
    next.connected_at = existing.connected_at;
  }
  if (!Object.prototype.hasOwnProperty.call(patch, "last_data_at")) {
    next.last_data_at = existing.last_data_at;
  }
  if (!Object.prototype.hasOwnProperty.call(patch, "status")) {
    next.status = existing.status;
  }

  await existing.update(next);
  return existing;
}

function ensureMemoryEntry(scannerIp) {
  const normalizedIp = normalizeIp(scannerIp);
  if (!normalizedIp) {
    return null;
  }
  const existing = connectedScanners.get(normalizedIp);
  if (existing) {
    return existing;
  }
  const entry = {
    scannerIp: normalizedIp,
    status: "DISCONNECTED",
    connectedAt: null,
    lastDataAt: null,
    openSockets: 0,
    lastPersistDataMs: 0,
  };
  connectedScanners.set(normalizedIp, entry);
  return entry;
}

function emitConnectionUpdate(entry) {
  const payload = toPublicSnapshot(entry, "MEMORY");
  if (!payload) {
    return;
  }
  emitRealtime("scanner_connection", payload);
}

function markScannerConnected({ scannerIp } = {}) {
  const entry = ensureMemoryEntry(scannerIp);
  if (!entry) {
    return null;
  }

  const now = new Date();
  entry.openSockets = Math.max(0, Number(entry.openSockets || 0)) + 1;
  entry.status = "CONNECTED";
  entry.connectedAt = now;
  connectedScanners.set(entry.scannerIp, entry);

  upsertConnectionRow(entry.scannerIp, {
    status: "CONNECTED",
    connected_at: now,
  }).catch((error) => {
    console.error("Scanner connection upsert failed:", error.message);
  });

  emitConnectionUpdate(entry);
  return toPublicSnapshot(entry, "MEMORY");
}

function markScannerData({ scannerIp } = {}) {
  const entry = ensureMemoryEntry(scannerIp);
  if (!entry) {
    return null;
  }

  const now = new Date();
  entry.status = "CONNECTED";
  entry.lastDataAt = now;
  if (!entry.connectedAt) {
    entry.connectedAt = now;
  }
  if (entry.openSockets <= 0) {
    entry.openSockets = 1;
  }
  connectedScanners.set(entry.scannerIp, entry);

  const nowMs = Date.now();
  const lastPersistMs = Number(entry.lastPersistDataMs || 0);
  if (nowMs - lastPersistMs >= DATA_PERSIST_THROTTLE_MS) {
    entry.lastPersistDataMs = nowMs;
    upsertConnectionRow(entry.scannerIp, {
      status: "CONNECTED",
      connected_at: entry.connectedAt,
      last_data_at: now,
    }).catch((error) => {
      console.error("Scanner data upsert failed:", error.message);
    });
  }

  return toPublicSnapshot(entry, "MEMORY");
}

function markScannerDisconnected({ scannerIp } = {}) {
  const entry = ensureMemoryEntry(scannerIp);
  if (!entry) {
    return null;
  }

  const nextOpenSockets = Math.max(0, Number(entry.openSockets || 0) - 1);
  entry.openSockets = nextOpenSockets;
  if (nextOpenSockets === 0) {
    entry.status = "DISCONNECTED";
  }
  connectedScanners.set(entry.scannerIp, entry);

  upsertConnectionRow(entry.scannerIp, {
    status: entry.status,
    connected_at: entry.connectedAt,
    last_data_at: entry.lastDataAt,
  }).catch((error) => {
    console.error("Scanner disconnect upsert failed:", error.message);
  });

  emitConnectionUpdate(entry);
  return toPublicSnapshot(entry, "MEMORY");
}

function getConnectedScannersMemory() {
  return Array.from(connectedScanners.values())
    .map((entry) => toPublicSnapshot(entry, "MEMORY"))
    .filter(Boolean)
    .sort((a, b) => String(a.scannerIp).localeCompare(String(b.scannerIp)));
}

async function getScannerConnectionSnapshot(scannerIp) {
  const normalizedIp = normalizeIp(scannerIp);
  if (!normalizedIp) {
    return null;
  }

  const memory = connectedScanners.get(normalizedIp) || null;
  if (memory) {
    return toPublicSnapshot(memory, "MEMORY");
  }

  const row = await ScannerConnection.findOne({ where: { scanner_ip: normalizedIp } });
  if (!row) {
    return null;
  }

  return toPublicSnapshot(
    {
      scannerIp: row.scanner_ip,
      status: row.status,
      connectedAt: row.connected_at,
      lastDataAt: row.last_data_at,
      openSockets: row.status === "CONNECTED" ? 1 : 0,
    },
    "DB"
  );
}

async function listScannerConnectionSnapshots() {
  const rows = await ScannerConnection.findAll({ order: [["scanner_ip", "ASC"]] });
  const dbMap = new Map(
    rows.map((row) => [
      normalizeIp(row.scanner_ip),
      toPublicSnapshot(
        {
          scannerIp: row.scanner_ip,
          status: row.status,
          connectedAt: row.connected_at,
          lastDataAt: row.last_data_at,
          openSockets: row.status === "CONNECTED" ? 1 : 0,
        },
        "DB"
      ),
    ])
  );

  for (const [scannerIp, entry] of connectedScanners.entries()) {
    dbMap.set(scannerIp, toPublicSnapshot(entry, "MEMORY"));
  }

  return Array.from(dbMap.values())
    .filter(Boolean)
    .sort((a, b) => String(a.scannerIp).localeCompare(String(b.scannerIp)));
}

function probeScannerEndpoint({ ip, port, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const scannerIp = normalizeIp(ip);
    const scannerPort = Number(port);
    if (!scannerIp || !Number.isFinite(scannerPort) || scannerPort <= 0) {
      resolve({
        reachable: false,
        error: "Valid scanner IP and port are required",
      });
      return;
    }

    const socket = new net.Socket();
    let settled = false;

    const done = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.destroy();
      } catch (_error) {
        // noop
      }
      resolve(payload);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done({ reachable: true, error: null }));
    socket.once("timeout", () => done({ reachable: false, error: "Scanner connect timeout" }));
    socket.once("error", (error) => done({ reachable: false, error: String(error.message || "Scanner connect failed") }));
    socket.connect(scannerPort, scannerIp);
  });
}

async function resetAllScannerConnectionStates() {
  await ScannerConnection.update(
    { status: "DISCONNECTED" },
    { where: { status: "CONNECTED" } }
  );
}

module.exports = {
  markScannerConnected,
  markScannerData,
  markScannerDisconnected,
  getConnectedScannersMemory,
  getScannerConnectionSnapshot,
  listScannerConnectionSnapshots,
  probeScannerEndpoint,
  resetAllScannerConnectionStates,
};
