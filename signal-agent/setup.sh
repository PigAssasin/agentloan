#!/bin/bash
# Signal Agent — Setup script
# Run this AFTER setting up the main agentloan repo
# Usage: cd signal-agent && bash setup.sh

set -e

echo ""
echo "╔═══════════════════════════════════╗"
echo "║     Signal Agent Setup Script     ║"
echo "╚═══════════════════════════════════╝"
echo ""

# ── Check we're in the right place ───────────────────────
if [ ! -f "signal-server.js" ]; then
  echo "❌ Run this from the signal-agent/ directory"
  exit 1
fi

# ── Install dependencies ──────────────────────────────────
echo "📦 Installing dependencies..."
npm install --silent
echo "✅ Dependencies installed"

# ── Setup viem from working SDK ──────────────────────────
if [ ! -d "/root/viem-sdk" ]; then
  echo ""
  echo "📦 Setting up viem SDK..."
  mkdir -p /root/viem-sdk
  cd /root/viem-sdk
  npm init -y > /dev/null
  npm install viem --silent
  cd - > /dev/null
  echo "✅ viem SDK installed at /root/viem-sdk"
fi

# ── Generate wallet ──────────────────────────────────────
echo ""
echo "🔑 Generating Signal Agent wallet..."
WALLET=$(node -e "
const { generatePrivateKey, privateKeyToAccount } = require('/root/viem-sdk/node_modules/viem/accounts');
const pk = generatePrivateKey();
const acc = privateKeyToAccount(pk);
console.log(pk + '|' + acc.address);
")
PK=$(echo $WALLET | cut -d'|' -f1)
ADDR=$(echo $WALLET | cut -d'|' -f2)

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║           Your Signal Agent Wallet                ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "║  Address:     $ADDR"
echo "║  Private Key: $PK"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "⚠️  SAVE THESE SECURELY — private key shown only once"
echo ""

# ── Create ecosystem PM2 config ──────────────────────────
cat > ecosystem.signal.config.js << CONF
module.exports = {
  apps: [{
    name: 'signal-agent',
    script: 'signal-server.js',
    cwd: '$(pwd)',
    env: {
      NEXT_PUBLIC_ARC_RPC: 'https://rpc.testnet.arc.network',
      SIGNAL_AGENT_PORT: '3001',
      SIGNAL_AGENT_ADDRESS: '$ADDR',
    },
    restart_delay: 5000,
    max_restarts: 20,
    out_file: '$(pwd)/logs/out.log',
    error_file: '$(pwd)/logs/err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
CONF

mkdir -p logs
echo "✅ PM2 config created: ecosystem.signal.config.js"

# ── Next steps ────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    Next Steps                             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "  1. Fund your wallet with USDC for gas (need ~1 USDC):"
echo "     Get from deployer wallet or https://faucet.circle.com"
echo "     Wallet: $ADDR"
echo ""
echo "  2. Register on Arc ERC-8004 (one-time, skip if already done):"
echo "     Add to agentloan/.env.local:"
echo "       SIGNAL_AGENT_PRIVATE_KEY=$PK"
echo "       SIGNAL_AGENT_ADDRESS=$ADDR"
echo "     Then run: cd ../agentloan && node scripts/register-signal-agent-quick.js"
echo "     Copy the printed SIGNAL_AGENT_ERC8004_ID"
echo ""
echo "  3. Add env vars to ecosystem.signal.config.js:"
echo "     SIGNAL_AGENT_ERC8004_ID=<id from step 2>"
echo ""
echo "  4. Start the Signal Agent:"
echo "     pm2 start ecosystem.signal.config.js"
echo "     pm2 save"
echo ""
echo "  5. Test it's working:"
echo "     curl http://localhost:3001/v1/status"
echo "     → should return: {\"online\":true,...}"
echo ""
echo "  6. Add SIGNAL_AGENT_URL to your bot's .env.local:"
echo "     SIGNAL_AGENT_URL=http://localhost:3001"
echo ""
