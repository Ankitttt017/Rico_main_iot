module.exports = {
  apps: [
    {
      name: "rico-iot-backend",
      script: "server.js",
      cwd: "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot\\Rico_main_iot\\backend\\rico-iot",
     exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 5000
      },
      error_file: "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot\\Rico_main_iot\\backend\\rico-iot\\backend.err.log",
      out_file:   "C:\\Users\\IOT1\\Desktop\\Rico_Main_Iot\\Rico_main_iot\\backend\\rico-iot\\backend.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
}