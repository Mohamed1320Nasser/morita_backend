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
      max_memory_restart: '300M',

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

      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
