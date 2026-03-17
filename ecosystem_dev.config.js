module.exports = {
  apps: [
    {
      name: 'morita-bot-dev',
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

      // Development environment
      env: {
        NODE_ENV: 'development',
        ENV_FILE: '.env.development',
        BOT_API_PORT: 3003
      },

      // Enhanced logging
      error_file: './logs/bot-dev-error.log',
      out_file: './logs/bot-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      log_type: 'json',               // Structured logging for better debugging

      // Log rotation to prevent disk space issues
      max_size: '10M',                // Rotate logs at 10MB
      retain: 10                       // Keep last 10 log files
    }
  ]
};
