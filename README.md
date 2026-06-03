# AgentLoan

<div align="center">

**DeFi lending protocol with an autonomous AI agent layer, built on Arc Testnet**

[![Live App](https://img.shields.io/badge/Live%20App-agentloan.vercel.app-000000?style=for-the-badge)](https://agentloan.vercel.app)
[![Docs](https://img.shields.io/badge/Docs-agentloan.vercel.app/docs-111111?style=for-the-badge)](https://agentloan.vercel.app/docs)
[![Arc Testnet](https://img.shields.io/badge/Network-Arc%20Testnet%205042002-0066FF?style=for-the-badge)](https://testnet.arcscan.app)
[![Tests](https://img.shields.io/badge/Tests-56%20passing-22c55e?style=for-the-badge)](#testing)

</div>

---

## What is it?

AgentLoan is a DeFi lending protocol where AI agents do the work:

- **Supply** crypto as collateral → earn yield
- **Borrow** stablecoins against your collateral
- **Autonomous agents** monitor positions, liquidate undercollateralized loans, and sell early warnings to other bots

Built on [Arc Testnet](https://arc.io) — USDC as gas, ~0.48s finality, sub-cent transactions. All tokens are testnet assets with no real-world value.

---

## Quick Start — Use the App (2 minutes)

**1. Add Arc Testnet to your wallet**
```
Network Name: Arc Testnet
RPC URL:      https://rpc.testnet.arc.network
Chain ID:     5042002
Symbol:       USDC
```

**2. Get testnet tokens**

Get native USDC for gas from [faucet.circle.com](https://faucet.circle.com), then mint xUSDC/xEURC/xclrBTC at [agentloan.vercel.app/faucet](https://agentloan.vercel.app/faucet).

**3. Supply → Borrow → Watch your Health Factor**

Keep Health Factor above 1.0. If it drops below, a liquidation bot will repay 50% of your debt and take collateral + 5% bonus.

---

## Join the Network — Run an Agent

Anyone can run an agent and earn. Three options, pick one:

---

### Option A — Liquidation Bot (earn 5% bonus)

The bot watches all borrower positions every ~0.5s. When Health Factor drops below 1.0, it repays their debt and receives collateral + 5% bonus.

**Prerequisites:** Node.js 22+, Linux/macOS VPS (or WSL), some xUSDC for liquidation capital + a little USDC for gas.

> **Recommended VPS:** 2GB RAM minimum. npm install requires ~1.5GB — on a 1GB droplet, create a swap file first: `dd if=/dev/zero of=/swapfile2 bs=1M count=2048 && mkswap /swapfile2 && swapon /swapfile2`

> **Note on directory name:** The repo clones as `agentloan/` but if you follow the VPS deploy guide, the bot runs from `/root/arcbank/` — this is intentional (the VPS directory kept the original name during a brand rename). Both work fine.

```bash
git clone https://github.com/PigAssasin/agentloan.git
cd agentloan
bash setup.sh                 # install deps + create .env.local

npm run wallet:new            # generate dedicated bot wallet
# Copy the private key → paste into .env.local as BOT_PRIVATE_KEY
# Fund the wallet with xUSDC (liquidation capital) + USDC (gas)

npm run agent:dry             # dry run — logs what it would do, no real txs
npm run agent:run             # go live
```

**How the math works:** Bot repays $25,000 of debt → receives $26,250 of collateral. The 5% bonus comes from the borrower's collateral, not the protocol.

**Run 24/7 with PM2 (recommended):**
```bash
npm install -g pm2
pm2 start ecosystem.config.js --only arcbank-bot
pm2 save && pm2 startup
```

---

### Option B — Signal Agent (earn xUSDC by selling early warnings)

A Signal Agent scans positions every 5 seconds for Health Factor < 1.1 and sells these early warnings to liquidation bots via x402 payment protocol. Bots pay 1 xUSDC for 1,000 signals (24h session) — they get a 15-30s head start on liquidations.

**Prerequisites:** Linux/macOS VPS, Node.js 20+.

```bash
git clone https://github.com/PigAssasin/agentloan.git
cd agentloan/signal-agent
bash setup.sh
# Follow the printed steps:
# 1. Fund your wallet with ~1 USDC for gas
# 2. Start: pm2 start ecosystem.signal.config.js
```

**Revenue model:** 1 xUSDC per session. Gas ~0.006 USDC per verification. Net ~0.994 xUSDC per bot subscription.

See [signal-agent/README.md](signal-agent/README.md) for the full API reference.

---

### Option C — Liquidate via UI (no code needed)

Go to [agentloan.vercel.app/app](https://agentloan.vercel.app/app) → **JOBS** tab → click **LIQUIDATE** on any available position. Requires xUSDC in your wallet.

---

## Agent Architecture

```
Coordinator Agent (every 30s, only when positions at risk)
  └─ reads pool state from Liquidation Bot
  └─ calls Gemini AI to decide liquidation priority
  └─ writes strategy to shared state file
  └─ learns from past outcomes (memory system)

Signal Agent (every 5s)
  └─ scans all positions for HF < 1.1
  └─ sells early warnings via x402: 1 xUSDC = 1,000 signals (24h)

Liquidation Bot (every block, ~0.48s)
  └─ reads Coordinator strategy for priority ordering
  └─ buys signals from Signal Agent (15-30s head start)
  └─ HF < 1.0 → approve → liquidate → earn 5% bonus
  └─ Circle SCA wallet: gasless, no private key on server
  └─ ERC-8183 jobs: signals open opportunity to community bots

Guardian Agent (browser, real-time)
  └─ alerts you when your HF drops below your threshold
  └─ calculates exact repay amount needed to restore safety

JOBS tab (browser)
  └─ shows all liquidatable + at-risk positions
  └─ anyone can click to liquidate and earn the bonus
```

---

## Deployed Contracts (Arc Testnet · Chain ID 5042002)

| Contract | Address |
|---|---|
| LendingPool | [`0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec`](https://testnet.arcscan.app/address/0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec) |
| PriceOraclePyth | [`0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999`](https://testnet.arcscan.app/address/0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999) |
| InterestRateStrategy | [`0x22B2A153F7694e49096ef91D627a80c5b6602Ffd`](https://testnet.arcscan.app/address/0x22B2A153F7694e49096ef91D627a80c5b6602Ffd) |
| xUSDC (mock) | [`0xFa090bd1A524D861542888B6c5e7965dde1F4f35`](https://testnet.arcscan.app/address/0xFa090bd1A524D861542888B6c5e7965dde1F4f35) |
| xEURC (mock) | [`0x11aC6A7f4c3235e4edda971838640bE9e55aC222`](https://testnet.arcscan.app/address/0x11aC6A7f4c3235e4edda971838640bE9e55aC222) |
| xclrBTC (mock) | [`0x938ae31cc6418acc6730cF1AFFE53E91c143B078`](https://testnet.arcscan.app/address/0x938ae31cc6418acc6730cF1AFFE53E91c143B078) |

| Agent | ERC-8004 ID | Address |
|---|---|---|
| Coordinator Agent | #34625 | `0x4dcE343E9c35112AAF9Ddce566689C3f36C73482` |
| Liquidation Bot | #30907 | `0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a` |
| Signal Agent | #31772 | `0x555cc39B822392E45A0B69776d6AeEadfcC5af3D` |

---

## Local Development

```bash
git clone https://github.com/PigAssasin/agentloan.git
cd agentloan
bash setup.sh    # installs deps + creates .env.local
npm run dev      # http://localhost:3000
```

### Environment Variables

```bash
# .env.local — never commit this file

NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network

# Liquidation bot (required to run the bot)
BOT_PRIVATE_KEY=0x<dedicated-bot-wallet>

# Signal agent URL (optional — bot works without it)
SIGNAL_AGENT_URL=http://<your-vps-ip>:3001

# Circle SCA wallet (optional — enables gasless liquidations)
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_ID=
CIRCLE_BOT_ADDRESS=

# Coordinator Agent LLM (optional — enables AI reasoning)
GEMINI_API_KEY=         # free at aistudio.google.com
DEEPSEEK_API_KEY=       # fallback

# Only needed for contract redeployment
DEPLOYER_PRIVATE_KEY=0x<deployer>
```

---

## Testing

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test
```

56 tests covering: deposit/borrow/repay/liquidation, interest rate model, BTC price crash scenarios (-20%/-40%/-60%), agent flows.

---

## Tech Stack

| | |
|---|---|
| Chain | Arc Testnet (EVM, USDC gas, 0.48s blocks) |
| Contracts | Solidity 0.8.20, OpenZeppelin 5, Hardhat |
| Oracle | Pyth Network (updated every 15s by bot) |
| Frontend | Next.js 16, wagmi v2, viem, RainbowKit |
| Bot wallet | Circle Developer-Controlled Wallets (SCA) |
| Agent identity | Arc ERC-8004 |
| Job coordination | Arc ERC-8183 |
| Signal payments | x402-inspired (HTTP 402 + xUSDC) |
| AI reasoning | Gemini 2.0 Flash (primary) + DeepSeek V3 (fallback) |
| Infra | Vercel + PM2 on VPS |

---

## Security

Self-audited. Key fixes applied:

- `_updateAllIndexes()` called before health factor checks in all state-changing functions
- `uint128` overflow guard on interest index accrual
- Liquidation collateral token can never equal the debt token
- `.call()` instead of `.transfer()` for oracle fee withdrawal
- Graceful fallback when neither Circle wallet nor private key is configured
- x402 replay attack prevention via in-memory `usedTxHashes` set

**Known limitations:** Not professionally audited. Testnet only — no real funds.

---

## License

MIT
