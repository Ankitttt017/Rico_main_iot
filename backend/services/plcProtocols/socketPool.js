const net = require("net");

const POOL_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.PLC_SOCKET_POOL_ENABLED || "").trim().toLowerCase()
);
const DEFAULT_IDLE_MS = Math.max(Number(process.env.PLC_SOCKET_IDLE_MS || 10000), 1000);

const pool = new Map();

function createSocketClient({ ip, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (handler) => (value) => {
      if (settled) {
        return;
      }
      settled = true;
      handler(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("error", done((error) => reject(error)));
    socket.once("timeout", done(() => reject(new Error("PLC connect timeout"))));
    socket.connect(
      Number(port),
      ip,
      done(() => {
        socket.setTimeout(0);
        resolve(socket);
      })
    );
  });
}

function attachSocketLifecycle(key, socket) {
  const cleanup = () => {
    const entry = pool.get(key);
    if (entry && entry.socket === socket) {
      pool.delete(key);
    }
  };
  socket.once("close", cleanup);
  socket.once("error", cleanup);
}

async function acquireSocket({ ip, port, timeoutMs }) {
  if (!POOL_ENABLED) {
    const socket = await createSocketClient({ ip, port, timeoutMs });
    return { socket, pooled: false, key: null };
  }

  const key = `${ip}:${port}`;
  const existing = pool.get(key);
  if (existing && existing.socket && !existing.socket.destroyed && !existing.inUse) {
    existing.inUse = true;
    return { socket: existing.socket, pooled: true, key };
  }

  const socket = await createSocketClient({ ip, port, timeoutMs });
  pool.set(key, {
    socket,
    inUse: true,
    lastUsedAt: Date.now(),
  });
  attachSocketLifecycle(key, socket);
  return { socket, pooled: true, key };
}

function releaseSocket({ socket, pooled, key }) {
  if (!pooled) {
    try {
      socket.destroy();
    } catch (_error) {
      // noop
    }
    return;
  }

  const entry = pool.get(key);
  if (!entry || entry.socket !== socket || socket.destroyed) {
    try {
      socket.destroy();
    } catch (_error) {
      // noop
    }
    if (entry && entry.socket === socket) {
      pool.delete(key);
    }
    return;
  }

  entry.inUse = false;
  entry.lastUsedAt = Date.now();
}

async function withSocket({ ip, port, timeoutMs }, fn) {
  const lease = await acquireSocket({ ip, port, timeoutMs });
  try {
    return await fn(lease.socket);
  } finally {
    releaseSocket(lease);
  }
}

function cleanupIdleSockets() {
  if (!POOL_ENABLED) {
    return;
  }
  const now = Date.now();
  for (const [key, entry] of pool.entries()) {
    if (entry.inUse) {
      continue;
    }
    if (now - entry.lastUsedAt > DEFAULT_IDLE_MS) {
      try {
        entry.socket.destroy();
      } catch (_error) {
        // noop
      }
      pool.delete(key);
    }
  }
}

if (POOL_ENABLED) {
  const interval = setInterval(cleanupIdleSockets, Math.max(DEFAULT_IDLE_MS / 2, 1000));
  interval.unref?.();
}

module.exports = {
  withSocket,
};
