require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const db = require("./src/config/db");
const partRoutes = require("./src/routes/partRoutes");
const lineRoutes = require("./src/routes/lineRoutes");
const machineRoutes = require("./src/routes/machine");
const createPlcMonitorRoutes = require("./src/modules/plcMonitor/plcMonitorRoutes");
const { startPlcMonitor } = require("./src/modules/plcMonitor/plcMonitorService");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "rico-main-iot-backend" });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rico-main-iot-backend" });
});

app.use("/api", partRoutes);
app.use("/api", machineRoutes);
app.use("/api/lines", lineRoutes);

const plcMonitor = startPlcMonitor(io);
app.use("/api/plc-monitor", createPlcMonitorRoutes(plcMonitor));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

async function start() {
  if (process.env.DB_AUTO_MIGRATE === "true") {
    await db.initializeSchema();
  }

  server.listen(PORT, () => {
    console.log(`Rico IoT Server running on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start Rico IoT server:", error);
  process.exit(1);
});
