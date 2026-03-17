module.exports = {
  apps: [
    {
      name: "morita-bot",
      script: "src/discord-bot/start.ts",
      interpreter: "ts-node",
      instances: 1,
      exec_mode: "fork", // Important: Only ONE instance!

      // Auto-restart configuration
      autorestart: true,
      watch: false, // Set to true for auto-reload on file changes
      max_memory_restart: "500M",

      // Logging
      error_file: "logs/bot-error.log",
      out_file: "logs/bot-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,

      // Environment variables
      env: {
        NODE_ENV: "development",
        TS_NODE_TRANSPILE_ONLY: "true",
      },
      env_production: {
        NODE_ENV: "production",
      },

      // Kill timeout
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,

      // Pre-start hook: Kill any existing instances
      pre_start: "bash scripts/kill-bot.sh || true",
    },
  ],
};
