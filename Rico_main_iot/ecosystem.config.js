module.exports = {
  apps: [
    {
      name: "rico-main-iot-backend",
      script: "server.js",
      cwd: "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot\\Rico_main_iot\\backend",
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
      error_file: "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot\\Rico_main_iot\\backend\\backend.err.log",
      out_file: "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot\\Rico_main_iot\\backend\\backend.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
}

