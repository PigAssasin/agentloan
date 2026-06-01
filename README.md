# ArcBank

<div align="center">

**Decentralized lending protocol built for the AI Agent Economy on Arc Testnet**

[![Live App](https://img.shields.io/badge/Live%20App-arcbank.vercel.app-000000?style=for-the-badge)](https://arcbank.vercel.app)
[![Docs](https://img.shields.io/badge/Docs-arcbank.vercel.app/docs-111111?style=for-the-badge)](https://arcbank.vercel.app/docs)
[![Arc Testnet](https://img.shields.io/badge/Network-Arc%20Testnet%205042002-0066FF?style=for-the-badge)](https://testnet.arcscan.app)
[![Tests](https://img.shields.io/badge/Tests-56%20passing-22c55e?style=for-the-badge)](#testing)

</div>

---

## What is ArcBank?

ArcBank is an Aave-style DeFi lending protocol built natively on Arc Testnet — a USDC-native chain with sub-cent gas and ~0.48s block times.

**For users:** Supply crypto assets as collateral, borrow against them at variable rates, earn yield automatically.

**For builders:** A complete reference implementation of a DeFi lending protocol with AI agent infrastructure — liquidation bots, signal markets, and Circle SCA wallets.

---

## Architecture Overview

```
┌─────────────────── Users ────────────────────┐
│  Supply collateral → Borrow → Earn yield      │
│  Dashboard / Markets / Profile / Docs         │
└───────────────────────────────────────────────┘
                       │
┌─────────────── Smart Contracts ───────────────┐
│  LendingPool.sol  (Aave-style scaled balances) │
│  PriceOraclePyth  (real-time Pyth feeds)       │
│  InterestRateStrategy  (2-slope variable rate) │
└───────────────────────────────────────────────┘
                       │
┌──────────────── AI Agent Layer ───────────────┐
│                                               │
│  Liquidation Bot  (watchBlocks + Multicall3)  │
│    └─ Circle SCA wallet (gasless, no key)     │
│    └─ ERC-8004 identity #30907                │
│    └─ ERC-8183 job registration               │
│                                               │
│  Signal Agent  (5s HF scan, x402 payment)    │
│    └─ Sells early warnings to bots            │
│    └─ ERC-8004 identity #31772                │
│    └─ 1 xUSDC = 1000 signals (24h)           │
│                                               │
│  Guardian Agent  (frontend, browser-based)    │
│    └─ Alerts when your HF < threshold         │
│                                               │
│  Yield Optimizer  (frontend, browser-based)   │
│    └─ Alerts when supply APY > threshold      │
└───────────────────────────────────────────────┘
```

---

## Live Contracts (Arc Testnet · Chain ID 5042002)

| Contract | Address |
|---|---|
| **LendingPool** | [`0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec`](https://testnet.arcscan.app/address/0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec) |
| **PriceOraclePyth** | [`0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999`](https://testnet.arcscan.app/address/0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999) |
| **InterestRateStrategy** | [`0x22B2A153F7694e49096ef91D627a80c5b6602Ffd`](https://testnet.arcscan.app/address/0x22B2A153F7694e49096ef91D627a80c5b6602Ffd) |
| **xUSDC** (testnet) | [`0xFa090bd1A524D861542888B6c5e7965dde1F4f35`](https://testnet.arcscan.app/address/0xFa090bd1A524D861542888B6c5e7965dde1F4f35) |
| **xEURC** (testnet) | [`0x11aC6A7f4c3235e4edda971838640bE9e55aC222`](https://testnet.arcscan.app/address/0x11aC6A7f4c3235e4edda971838640bE9e55aC222) |
| **xclrBTC** (testnet) | [`0x938ae31cc6418acc6730cF1AFFE53E91c143B078`](https://testnet.arcscan.app/address/0x938ae31cc6418acc6730cF1AFFE53E91c143B078) |

| Agent | Address | ERC-8004 ID |
|---|---|---|
| **Liquidation Bot** | `0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a` | #30907 |
| **Signal Agent** | `0x555cc39B822392E45A0B69776d6AeEadfcC5af3D` | #31772 |

---

## How to Use

### As a User (Browser Only)

1. **Add Arc Testnet to MetaMask:**
   - RPC: `https://rpc.testnet.arc.network`
   - Chain ID: `5042002`
   - Symbol: `USDC`

2. **Get testnet tokens:** Visit [arcbank.vercel.app/faucet](https://arcbank.vercel.app/faucet)

3. **Supply collateral** → **Borrow xUSDC** → Watch your Health Factor

---

## How to Join the Network

There are 3 ways to participate beyond just using the app:

### Option A — Run a Liquidation Bot

Earn 5% bonus by liquidating undercollateralized positions.

```bash
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank
npm install --legacy-peer-deps

# Create .env.local
cat > .env.local << 'EOF'
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
BOT_PRIVATE_KEY=0x<your-dedicated-bot-wallet-private-key>
POOL_START_BLOCK=0
DRY_RUN=true
SIGNAL_AGENT_URL=http://localhost:3001
EOF

# Test first (DRY_RUN=true — no transactions)
npm run agent:dry

# Run live
npm run agent:run

# Or via PM2 on a server
pm2 start run-bot.sh --name arcbank-bot
```

**Requirements:**
- Node.js 22+
- A dedicated wallet with some xUSDC for liquidation capital
- Arc Testnet USDC for gas (get from [faucet.circle.com](https://faucet.circle.com))

**How profits work:**
- You repay 50% of a borrower's debt
- You receive their collateral + 5% bonus instantly
- Example: repay $25,000 xUSDC → receive $26,250 worth of xclrBTC

---

### Option B — Run a Signal Agent

Earn xUSDC by selling early liquidation warnings to other bots.

```bash
# Setup (VPS recommended — needs to run 24/7)
mkdir /root/signal-agent && cd /root/signal-agent

# Copy from repo
cp /path/to/arcbank/signal-agent/signal-server.js .
cp /path/to/arcbank/signal-agent/package.json .
npm install

# Generate a wallet for receiving payments
node -e "
const { generatePrivateKey, privateKeyToAccount } = require('/root/viem-sdk/node_modules/viem/accounts');
const pk = generatePrivateKey();
const acc = privateKeyToAccount(pk);
console.log('Private Key:', pk);
console.log('Address:', acc.address);
"

# Configure environment (save your private key securely)
export SIGNAL_AGENT_ADDRESS=0x<your-wallet-address>
export SIGNAL_AGENT_PORT=3001
export NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network

# Fund wallet with USDC for gas (~1 USDC)
# Then register on ERC-8004 for on-chain identity
# See: npm run signal:register in the arcbank repo

# Start
node signal-server.js

# Or via PM2
pm2 start signal-server.js --name signal-agent
```

**How payments work:**
- Bots call your `/v1/signals` endpoint
- You respond 402 with price info
- Bot pays 1 xUSDC to your wallet
- You issue a session UUID: 1000 signals / 24h
- **Revenue:** 1 xUSDC per bot subscription

**Signal pricing economics:**
| Item | Value |
|---|---|
| Price per session | 1 xUSDC |
| Signals per session | 1,000 |
| Session validity | 24 hours |
| Gas cost per payment tx | ~0.006 USDC |
| Net profit per session | ~0.994 xUSDC |

---

### Option C — Liquidate via the UI (No Code)

Go to [arcbank.vercel.app/app](https://arcbank.vercel.app/app) → **JOBS** tab → Click **[LIQUIDATE]** on any liquidatable position. Requires xUSDC in your wallet.

---

## Local Development

### Prerequisites

- Node.js 22+
- MetaMask with Arc Testnet

### Setup

```bash
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Environment Variables

```bash
# .env.local — never commit this file
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network

# Required for running the Liquidation Bot
BOT_PRIVATE_KEY=0x<dedicated-bot-wallet-key>

# Optional: Circle Developer-Controlled Wallet (gasless liquidations)
CIRCLE_API_KEY=TEST_API_KEY:...
CIRCLE_ENTITY_SECRET=<32-byte-hex>
CIRCLE_WALLET_ID=<wallet-id>
CIRCLE_BOT_ADDRESS=0x<circle-wallet-address>

# Optional: Signal Agent connection (set your VPS URL in Vercel Dashboard, not here)
# SIGNAL_AGENT_URL=http://<your-vps-ip>:3001

# Required for contract deployment only
DEPLOYER_PRIVATE_KEY=0x<deployer-key>
```

> **Security:** Never commit `.env.local`. Never hardcode private keys. Store `SIGNAL_AGENT_URL` in Vercel Dashboard under Settings > Environment Variables (not in `vercel.json`).

---

## Testing

```bash
# Run all 56 tests
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test

# Specific suites
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test test/LendingPool.test.ts
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test test/agents/backtest.test.ts
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test test/agents/signal-client.test.ts
```

**Test coverage:**
- Core protocol: deposit, borrow, repay, withdraw, liquidation
- Interest rate model: slope calculations
- Backtest: BTC price crash -20%/-40%/-60%
- Agent: liquidator flow, signal client, job manager

---

## Project Structure

```
arcbank/
├── contracts/              # Solidity smart contracts
│   ├── LendingPool.sol     # Core protocol
│   ├── PriceOraclePyth.sol # Pyth Network oracle
│   └── libraries/          # Math + validation
│
├── agents/                 # DeFi bot infrastructure
│   ├── liquidation-bot.ts  # Main bot (watchBlocks, Multicall3)
│   └── lib/
│       ├── pool-reader.ts  # Chain reads + HF scanning
│       ├── liquidator.ts   # Execute liquidations
│       ├── oracle-updater.ts # Pyth price push
│       ├── signal-client.ts  # x402 payment client
│       ├── execute-strategy.ts # Circle SCA or private key
│       ├── job-manager.ts  # ERC-8183 coordination
│       ├── arc-registry.ts # ERC-8004 identity
│       ├── auto-refill.ts  # Bot wallet auto-funding
│       └── notifier.ts     # Telegram notifications
│
├── signal-agent/           # Signal Agent server (run separately)
│   ├── signal-server.js    # Express x402 HTTP server
│   └── package.json        # Own dependencies
│
├── src/                    # Next.js frontend
│   ├── app/
│   │   ├── app/page.tsx    # Dashboard (POSITIONS/AGENTS/JOBS/SIGNAL)
│   │   ├── markets/        # Protocol overview
│   │   ├── faucet/         # Get testnet tokens
│   │   └── docs/           # Documentation (9 pages)
│   └── components/
│       ├── agents/         # AgentsTab, JobsTab, SignalMarketTab
│       └── modals/         # Supply, Borrow, Repay, Liquidate
│
├── config/
│   └── contracts.ts        # All contract addresses (single source)
│
├── run-bot.sh              # PM2 startup script for Liquidation Bot
└── ecosystem.config.js     # PM2 config
```

---

## Security

Self-audited. All critical/high findings patched.

| Fix | Description |
|---|---|
| H-1/H-2 | `_updateAllIndexes()` before HF check in all state-changing functions |
| C-1/C-2 | Supply cap + liquidation collateral accounting fixed |
| ReserveLogic | `uint128` overflow guard on interest index accrual |
| PriceOracle | `.call()` instead of `.transfer()` for fee withdrawal |
| Bot | Collateral token can never equal debt token |
| execute-strategy | Graceful fallback when neither Circle nor private key available |
| Signal Server | Replay attack prevention via `usedTxHashes` set |

**Known limitations:**
- Not professionally audited — testnet use only
- Signal Agent sessions stored in memory only — lost on restart (TODO: disk persistence for production)
- `usedTxHashes` replay prevention resets on process restart

> **Testnet only.** All tokens have no real-world value. Do not use with real funds.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Arc Testnet · EVM · USDC gas token · ~0.48s blocks |
| Smart Contracts | Solidity 0.8.20 · OpenZeppelin 5 · Hardhat |
| Oracle | Pyth Network (pull oracle, updated every 15s by bot) |
| Frontend | Next.js 16 · TypeScript · wagmi v2 · viem · RainbowKit |
| Bot Wallet | Circle Developer-Controlled Wallets (SCA, gasless) |
| Agent Identity | Arc ERC-8004 on-chain AI agent registry |
| Job Coordination | Arc ERC-8183 AgenticCommerce contract |
| Signal Payments | x402-inspired protocol (HTTP 402 + xUSDC transfer) |
| Infrastructure | Vercel (frontend) · PM2 on VPS (bots) |

---

## Add Arc Testnet to MetaMask

| Field | Value |
|---|---|
| Network Name | Arc Testnet |
| RPC URL | `https://rpc.testnet.arc.network` |
| Chain ID | `5042002` |
| Currency Symbol | `USDC` |
| Explorer | `https://testnet.arcscan.app` |

---

## License

MIT — built on [Arc Testnet](https://arc.io)
