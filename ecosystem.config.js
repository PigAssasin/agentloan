// PM2 process config — run on VPS with: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name:        "arcbank-bot",
      script:      "/root/arcbank/run-bot.sh",
      cwd:         "/root/arcbank",
      interpreter: "bash",
      env: {
        NEXT_PUBLIC_ARC_RPC: "https://rpc.testnet.arc.network",
      },
      // Auto-restart settings
      restart_delay:  5000,   // wait 5s before restarting after crash
      max_restarts:   20,     // give up after 20 rapid crashes
      min_uptime:     "10s",  // must stay up 10s to count as stable start
      // Logging
      out_file:  "logs/bot-out.log",
      error_file:"logs/bot-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
    {
      name:        "coordinator-agent",
      script:      "/root/arcbank/run-coordinator.sh",
      cwd:         "/root/arcbank",
      interpreter: "bash",
      env: {
        NEXT_PUBLIC_ARC_RPC: "https://rpc.testnet.arc.network",
      },
      restart_delay:  10000,
      max_restarts:   10,
      min_uptime:     "15s",
      out_file:  "logs/coordinator-out.log",
      error_file:"logs/coordinator-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
