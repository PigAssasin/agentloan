// PM2 process config — run on VPS with: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name:        "arcbank-bot",
      script:      "./node_modules/.bin/ts-node",
      args:        "-P tsconfig.hardhat.json agents/liquidation-bot.ts",
      cwd:         "/root/arcbank",
      interpreter: "node",
      env: {
        TS_NODE_PROJECT:     "tsconfig.hardhat.json",
        NEXT_PUBLIC_ARC_RPC: "https://rpc.testnet.arc.network",
        // DRY_RUN must be set explicitly in .env.local — not defaulted here
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
  ],
};
