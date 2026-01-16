module.exports = {
  apps: [
    // ========================================
    // BACKEND API
    // ========================================
    // {
    //   name: 'morita-backend',
    //   script: './build/app.js',
    //   instances: 1,
    //   exec_mode: 'fork',
    //   watch: false,
    //   max_memory_restart: '500M',

    //   // Development (localhost)
    //   env_development: {
    //     NODE_ENV: 'development',
    //     PORT: 3000,
    //     ENV_FILE: '.env.development'
    //   },

    //   // Staging (server for client testing)
    //   env_staging: {
    //     NODE_ENV: 'staging',
    //     PORT: 3001,
    //     ENV_FILE: '.env.staging'
    //   },

    //   // Production
    //   env_production: {
    //     NODE_ENV: 'production',
    //     PORT: 3000,
    //     ENV_FILE: '.env.production'
    //   },

    //   error_file: './logs/backend-error.log',
    //   out_file: './logs/backend-out.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    //   merge_logs: true,
    //   autorestart: true,
    //   max_restarts: 10,
    //   min_uptime: '10s'
    // },

    // ========================================
    // DISCORD BOT
    // ========================================
    {
      name: 'morita-bot',
      script: './build/discord-bot/start.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,

      // Increased memory limit for Discord bot
      max_memory_restart: '600M',

      // Enhanced restart strategy - prevents PM2 from killing itself
      autorestart: true,
      max_restarts: 20,               // More restart attempts before giving up
      min_uptime: '60s',              // Bot needs time to connect to Discord
      restart_delay: 5000,            // Wait 5 seconds between restarts
      exp_backoff_restart_delay: 100, // Exponential backoff (100ms, 200ms, 400ms, etc.)

      // Graceful shutdown for Discord connections
      kill_timeout: 10000,            // Wait 10 seconds for Discord to disconnect properly

      // Optional: Auto-restart daily at 3 AM to prevent memory leaks
      cron_restart: '0 3 * * *',

      // Development (localhost with dev bot)
      env_development: {
        NODE_ENV: 'development',
        ENV_FILE: '.env.development'
      },

      // Staging (server with staging bot)
      env_staging: {
        NODE_ENV: 'staging',
        ENV_FILE: '.env.staging'
      },

      // Production (live bot)
      env_production: {
        NODE_ENV: 'production',
        ENV_FILE: '.env.production',
        BOT_API_PORT: 3002
      },

      // Enhanced logging
      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      log_type: 'json',               // Structured logging for better debugging

      // Log rotation to prevent disk space issues
      max_size: '10M',                // Rotate logs at 10MB
      retain: 10                       // Keep last 10 log files
    }
  ]
};
