#!/bin/bash
# AgentLoan Bot — One-click deploy script
# Run on VPS: bash <(curl -s https://raw.githubusercontent.com/PigAssasin/agentloan/main/docs/VPS_ONECLICK.sh)
# OR: paste this entire script into the terminal

set -e
echo "=== AgentLoan Bot Deploy ==="

# 1. Clone or update repo
if [ -d "/root/arcbank/.git" ]; then
  echo "Pulling latest..."
  cd /root/arcbank && git pull origin main
else
  echo "Cloning repo..."
  rm -rf /root/arcbank
  git clone https://github.com/PigAssasin/agentloan.git /root/arcbank
fi

cd /root/arcbank

# 2. Create required directories
mkdir -p logs agents/state

# 3. Install dependencies
echo "Installing npm dependencies..."
npm ci

# 4. Create .env.local if not exists
if [ ! -f ".env.local" ]; then
  cat > .env.local << 'EOF'
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
BOT_PRIVATE_KEY=REPLACE_WITH_YOUR_BOT_PRIVATE_KEY
POOL_START_BLOCK=0
DRY_RUN=true
EOF
  echo "Created .env.local — EDIT IT before starting bot!"
else
  echo ".env.local already exists — keeping it"
fi

# 5. Test DRY_RUN (30s test)
echo ""
echo "=== Testing bot (DRY_RUN, 15s) ==="
timeout 15 DRY_RUN=true TS_NODE_PROJECT=tsconfig.hardhat.json \
  npx ts-node agents/liquidation-bot.ts 2>&1 | head -20 || true

echo ""
echo "=== AgentLoan deploy complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit /root/arcbank/.env.local — set BOT_PRIVATE_KEY and DRY_RUN=false"
echo "  2. pm2 start /root/arcbank/ecosystem.config.js"
echo "  3. pm2 save && pm2 startup"
echo ""
echo "Monitor: pm2 logs arcbank-bot"
