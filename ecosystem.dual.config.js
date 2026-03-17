module.exports = {
  apps: [
    // ========================================
    // BACKEND API - PRODUCTION (Port 3000)
    // ========================================
    {
      name: 'morita-backend-prod',
      script: './build/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      error_file: './logs/backend-prod-error.log',
      out_file: './logs/backend-prod-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ========================================
    // BACKEND API - DEVELOPMENT (Port 3001)
    // ========================================
    {
      name: 'morita-backend-dev',
      script: './build/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },

      error_file: './logs/backend-dev-error.log',
      out_file: './logs/backend-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ========================================
    // DISCORD BOT - PRODUCTION
    // ========================================
    {
      name: 'morita-bot-prod',
      script: './build/discord-bot/start.js',
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
      cron_restart: '0 3 * * *',

      env: {
        NODE_ENV: 'production',
        BOT_API_PORT: 3002
      },

      error_file: './logs/bot-prod-error.log',
      out_file: './logs/bot-prod-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      log_type: 'json',
      max_size: '10M',
      retain: 10
    },

    // ========================================
    // DISCORD BOT - DEVELOPMENT
    // ========================================
    {
      name: 'morita-bot-dev',
      script: './build/discord-bot/start.js',
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
