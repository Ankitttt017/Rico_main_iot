module.exports = {
  apps: [
    {
      name: "rico-main-iot-backend",
      script: "server.js",
      cwd: require("path").join(__dirname, "backend"),
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        PLC_CONNECT_TIMEOUT_MS: 15000,
        PLC_READ_TIMEOUT_MS: 12000,
        PLC_RECONNECT_MIN_MS: 2000,
        PLC_RECONNECT_MAX_MS: 30000,
        PLC_RECONNECT_BACKOFF_FACTOR: 1.6,
        PLC_RECONNECT_JITTER_MS: 1000
      },
      error_file: require("path").join(__dirname, "backend", "backend.err.log"),
      out_file: require("path").join(__dirname, "backend", "backend.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
}

