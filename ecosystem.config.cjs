const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "controle-academia",
      cwd: __dirname,
      script: path.join(__dirname, "scripts", "start-production.mjs"),
      interpreter: process.execPath,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      min_uptime: "10s",
      max_restarts: 10,
      max_memory_restart: process.env.PM2_MAX_MEMORY_RESTART || "750M",
      kill_timeout: 10000,
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      out_file: process.env.PM2_OUT_LOG || "/var/log/controle-academia/out.log",
      error_file: process.env.PM2_ERROR_LOG || "/var/log/controle-academia/error.log",
      env: {
        NODE_ENV: "production",
        APP_HOST: process.env.APP_HOST || "127.0.0.1",
        PORT: process.env.PORT || "3000",
        TZ: process.env.TZ || "America/Sao_Paulo"
      }
    }
  ]
};
