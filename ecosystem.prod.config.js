module.exports = {
  apps: [
    // ========================================
    // BACKEND API - PRODUCTION (Port 3000)
    // ========================================
    {
      name: 'morita-backend-prod',
      script: './build/app.js',
      cwd: '/home/morita/public_html/morita_backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 0,
      min_uptime: '10s'
    },

    // ========================================
    // DISCORD BOT - PRODUCTION (Port 3002)
    // ========================================
    {
      name: 'morita-bot-prod',
      script: './build/discord-bot/start.js',
      cwd: '/home/morita/public_html/morita_backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '600M',

      autorestart: true,
      max_restarts: 0,
      min_uptime: '10s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,
      cron_restart: '0 3 * * *',

      env: {
        NODE_ENV: 'production',
        BOT_API_PORT: 3002
      },

      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      log_type: 'json',
      max_size: '10M',
      retain: 10
    }
  ]
};
