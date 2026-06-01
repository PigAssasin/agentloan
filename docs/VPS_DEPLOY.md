# ArcBank Bot — VPS Deploy Guide

## 1. VPS Requirements

- Ubuntu 22.04 LTS (DigitalOcean/Vultr/etc.)
- 1 vCPU, 1GB RAM is sufficient
- Node.js 24 LTS

## 2. One-Time Server Setup

SSH into your VPS then run:

```bash
# Install Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Clone repo
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank

# Install dependencies
npm ci

# Create logs directory
mkdir -p logs
```

## 3. Configure Environment

```bash
# Create .env.local with your bot credentials
cat > .env.local << 'EOF'
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
BOT_PRIVATE_KEY=0x<your-dedicated-bot-wallet-private-key>
POOL_START_BLOCK=<LendingPool deploy block from testnet.arcscan.app>
DRY_RUN=false
EOF
```

> **IMPORTANT:** `BOT_PRIVATE_KEY` must be a DEDICATED wallet — NOT the deployer key.
> Generate a new wallet: `node -e "const {generatePrivateKey,privateKeyToAccount} = require('viem/accounts'); const pk=generatePrivateKey(); console.log('KEY:',pk,'\\nADDR:',privateKeyToAccount(pk).address)"`

## 4. Fund Bot Wallet

The bot wallet needs xUSDC to repay debt during liquidations:

```bash
# Use the ArcBank faucet at https://arcbank.vercel.app/faucet
# Or send xUSDC from your deployer wallet
```

## 5. Register Bot on Arc ERC-8004 (one-time)

```bash
npm run agent:register
# Copy the printed BOT_AGENT_ID and add to .env.local:
echo "BOT_AGENT_ID=<id>" >> .env.local
```

## 6. Test with DRY_RUN First

```bash
DRY_RUN=true npm run agent:dry
```

Expected output:
```
🤖 ArcBank Liquidation Bot
   Mode:    DRY_RUN (no txs)
   Wallet:  0x...
👂 Watching blocks...
··········
```

## 7. Start Bot with PM2

```bash
pm2 start ecosystem.config.js

# Check status
pm2 status

# Watch logs live
pm2 logs arcbank-bot

# Stop
pm2 stop arcbank-bot
```

## 8. Auto-Start on Reboot

```bash
pm2 save
pm2 startup
# Run the command it prints (starts with: sudo env PATH=...)
```

## 9. Updates

When new code is deployed:

```bash
cd arcbank
git pull
npm ci
pm2 restart arcbank-bot
```

## 10. Monitor Bot Health

```bash
# Last 100 log lines
pm2 logs arcbank-bot --lines 100

# CPU/memory usage
pm2 monit
```

## Gas Budget

- Pyth oracle update: ~0.006 USDC/tx
- At 15s interval: ~5,760 updates/day = ~34.5 testnet USDC/day
- Arc testnet USDC faucet: 40 USDC/2h = 480 USDC/day per wallet
- Bot wallet starting balance of 700 USDC = ~20 days without refilling
