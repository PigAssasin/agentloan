#!/bin/bash
# AgentLoan — One-command setup script
# Works on Linux/macOS. On Windows use Git Bash or WSL.
# Usage: bash setup.sh

set -e

echo ""
echo "╔═══════════════════════════════════╗"
echo "║       AgentLoan Setup Script        ║"
echo "╚═══════════════════════════════════╝"
echo ""

# ── 1. Node version check ─────────────────────────────────
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 22 ]; then
  echo "❌ Node.js 22+ required. Install from https://nodejs.org"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# ── 2. Install dependencies ───────────────────────────────
echo ""
echo "📦 Installing dependencies..."
npm install --legacy-peer-deps --silent
echo "✅ Dependencies installed"

# ── 3. Create .env.local if missing ──────────────────────
if [ ! -f ".env.local" ]; then
  echo ""
  echo "📝 Creating .env.local from template..."
  cat > .env.local << 'EOF'
# Arc Testnet RPC
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network

# ── Liquidation Bot ──────────────────────────────────────
# Generate a dedicated wallet: npm run wallet:new
BOT_PRIVATE_KEY=

# Where to look for signal (optional — bot works without it)
SIGNAL_AGENT_URL=http://localhost:3001

# ── Signal Agent ─────────────────────────────────────────
# Address of the wallet that receives xUSDC payments
SIGNAL_AGENT_ADDRESS=

# ── Contract Deployment (only needed if redeploying) ─────
DEPLOYER_PRIVATE_KEY=

# ── Optional: Circle SCA Wallet (gasless liquidations) ───
# Get from console.circle.com
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_ID=
CIRCLE_BOT_ADDRESS=
EOF
  echo "✅ .env.local created — fill in BOT_PRIVATE_KEY to run the bot"
else
  echo "✅ .env.local already exists"
fi

# ── 4. Summary ────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║                  Setup complete!                  ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  1. Add Arc Testnet to MetaMask:"
echo "     RPC: https://rpc.testnet.arc.network"
echo "     Chain ID: 5042002 | Symbol: USDC"
echo ""
echo "  2. Generate a bot wallet:"
echo "     npm run wallet:new"
echo "     → paste the private key into .env.local as BOT_PRIVATE_KEY"
echo ""
echo "  3. Get testnet tokens:"
echo "     https://agentloan.vercel.app/faucet"
echo ""
echo "  4. Run the frontend:"
echo "     npm run dev → http://localhost:3000"
echo ""
echo "  5. Run the liquidation bot (DRY_RUN first):"
echo "     npm run agent:dry"
echo "     npm run agent:run   ← live mode"
echo ""
echo "  6. (Optional) Run your own Signal Agent:"
echo "     cd signal-agent && bash setup.sh"
echo ""
