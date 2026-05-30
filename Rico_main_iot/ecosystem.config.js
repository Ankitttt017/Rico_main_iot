module.exports = {
  apps: [
    {
      name: "rico-main-iot-backend",
      script: "server.js",
      cwd: "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot_Production\\Rico_main_iot\\backend",
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 5000
      },
      error_file: "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot_Production\\Rico_main_iot\\backend\\backend.err.log",
      out_file: "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot_Production\\Rico_main_iot\\backend\\backend.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
}
