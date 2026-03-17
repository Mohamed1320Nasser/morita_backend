module.exports = {
  apps: [
    // ========================================
    // DISCORD BOT - DEVELOPMENT (Port 3003)
    // ========================================
    {
      name: 'morita-bot-dev',
      script: './build/discord-bot/start.js',
      cwd: '/home/public_html/morita_dev/morita_backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '600M',

      autorestart: true,
      max_restarts: 20,
      min_uptime: '60s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,

      env: {
        NODE_ENV: 'development',
        BOT_API_PORT: 3003
      },

      error_file: './logs/bot-dev-error.log',
      out_file: './logs/bot-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      log_type: 'json',
      max_size: '10M',
      retain: 10
    }
  ]
};
