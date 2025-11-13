// PM2 Configuration - Discord Bot Only
// Use this when Backend API is running via cPanel Node.js App
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'morita-bot',
      script: './build/discord-bot/start.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      
      // Set working directory to project root (where .env file is located)
      // This ensures dotenv.config() in start.ts can find the .env file
      cwd: path.resolve(__dirname),

      // Load environment variables from .env file
      env: {
        NODE_ENV: 'production'
      },
      // Note: env_file is not supported by PM2
      // The .env file is loaded by dotenv.config() in src/discord-bot/start.ts

      error_file: './bot-logs/bot-error.log',
      out_file: './bot-logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
