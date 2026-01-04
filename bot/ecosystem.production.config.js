// Загружаем переменные из .env.production
require('dotenv').config({ path: require('path').join(__dirname, '.env.production') });

module.exports = {
  apps: [
    {
      name: "step-one-bot-production",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        MINIAPP_BASE_URL: process.env.MINIAPP_BASE_URL,
      },
      error_file: "./logs/pm2-error-production.log",
      out_file: "./logs/pm2-out-production.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};

