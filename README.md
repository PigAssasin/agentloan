# ArcBank

<div align="center">

**Decentralized lending protocol on Arc Testnet**

[![Live App](https://img.shields.io/badge/Live%20App-arcbank.vercel.app-000000?style=for-the-badge)](https://arcbank.vercel.app)
[![Docs](https://img.shields.io/badge/Docs-arcbank.vercel.app/docs-111111?style=for-the-badge)](https://arcbank.vercel.app/docs)
[![Arc Testnet](https://img.shields.io/badge/Network-Arc%20Testnet%205042002-0066FF?style=for-the-badge)](https://testnet.arcscan.app)
[![Tests](https://img.shields.io/badge/Tests-50%20passing-22c55e?style=for-the-badge)](#testing)

</div>

---

## Overview

ArcBank is an Aave-style DeFi lending protocol built natively on [Arc Testnet](https://arc.io) — a USDC-native EVM chain with sub-cent gas and ~0.48s block times.

Supply assets to earn variable yield. Borrow against your collateral. Get protected by autonomous DeFi agents.

```
Supply xUSDC / xEURC / xclrBTC
         ↓
  Earn scaled interest (Aave-style indexes)
         ↓
  Borrow xUSDC against collateral
         ↓
  Monitor Health Factor in real-time (Pyth oracle)
         ↓
  Liquidation Bot protects protocol 24/7
```

---

## Features

### Protocol
- **Aave v2 scaled balances** — interest accrues automatically, no claiming needed
- **2-slope interest rate model** — 5% base → 80% kink → 145% slope 2
- **Real-time Pyth oracle** — prices updated every 15s on-chain
- **Health Factor monitoring** — liquidation at HF < 1.0 with 5% bonus
- **On-chain faucet cooldown** — 24h per wallet, can't be bypassed

### DeFi Agents
- **Liquidation Bot** — autonomous 24/7, watchBlocks + Multicall3, self-funded via auto-refill
- **Guardian Agent** — frontend HF threshold alert with repay suggestion
- **Yield Optimizer** — frontend APY threshold alert with deposit suggestion
- **Arc ERC-8004 identity** — bot registered on-chain as AI agent (ID #30907)

### Tech
- **Mobile responsive** — all pages optimized for mobile
- **50 contract tests** — unit + integration + backtests (-20/-40/-60% price crash)
- **Security audited** — self-audited, all critical/high findings patched

---

## Live Contracts (Arc Testnet · Chain ID 5042002)

| Contract | Address |
|---|---|
| **LendingPool** | [`0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec`](https://testnet.arcscan.app/address/0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec) |
| **PriceOraclePyth** | [`0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999`](https://testnet.arcscan.app/address/0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999) |
| **InterestRateStrategy** | [`0x22B2A153F7694e49096ef91D627a80c5b6602Ffd`](https://testnet.arcscan.app/address/0x22B2A153F7694e49096ef91D627a80c5b6602Ffd) |
| **xUSDC** (mock) | [`0xFa090bd1A524D861542888B6c5e7965dde1F4f35`](https://testnet.arcscan.app/address/0xFa090bd1A524D861542888B6c5e7965dde1F4f35) |
| **xEURC** (mock) | [`0x11aC6A7f4c3235e4edda971838640bE9e55aC222`](https://testnet.arcscan.app/address/0x11aC6A7f4c3235e4edda971838640bE9e55aC222) |
| **xclrBTC** (mock) | [`0x938ae31cc6418acc6730cF1AFFE53E91c143B078`](https://testnet.arcscan.app/address/0x938ae31cc6418acc6730cF1AFFE53E91c143B078) |
| **Liquidation Bot** (ERC-8004 #30907) | [`0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a`](https://testnet.arcscan.app/address/0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a) |

---

## Risk Parameters

| Token | LTV | Liq. Threshold | Liq. Bonus | Borrowable |
|---|---|---|---|---|
| xUSDC | 80% | 85% | +5% | ✅ |
| xEURC | 80% | 85% | +5% | ❌ |
| xclrBTC | 70% | 75% | +5% | ❌ |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Arc Testnet · EVM · USDC gas token · Chain ID 5042002 |
| Smart Contracts | Solidity 0.8.20 · OpenZeppelin 5 · Hardhat · viaIR |
| Oracle | Pyth Network (pull oracle, real-time) |
| Frontend | Next.js 16 · TypeScript · wagmi v2 · viem · RainbowKit |
| Styling | RawBlock design system (4px borders, Archivo Black) |
| Deployment | Vercel (frontend) · PM2 on VPS (liquidation bot) |
| Tests | Hardhat · Mocha · Chai · 50 tests |

---

## Project Structure

```
arcbank/
├── contracts/
│   ├── LendingPool.sol          # Core — deposit, borrow, repay, liquidate
│   ├── PriceOraclePyth.sol      # Pyth Network pull oracle
│   ├── InterestRateStrategy.sol # 2-slope variable rate model
│   ├── libraries/
│   │   ├── ReserveLogic.sol     # Scaled balance index accrual
│   │   └── ValidationLogic.sol  # Health factor math
│   ├── types/DataTypes.sol      # Shared structs
│   └── mocks/                   # MockERC20, MockAggregator (testnet)
│
├── agents/                      # DeFi Agent infrastructure
│   ├── liquidation-bot.ts       # Autonomous bot (watchBlocks + Multicall3)
│   ├── lib/
│   │   ├── pool-reader.ts       # Incremental borrow scan + batch HF reads
│   │   ├── liquidator.ts        # Execute liquidations + profit check
│   │   ├── oracle-updater.ts    # Pyth price push (every 15s)
│   │   ├── auto-refill.ts       # Auto-fund bot wallet from deployer
│   │   ├── arc-registry.ts      # Arc ERC-8004 identity registration
│   │   └── notifier.ts          # Telegram notifications (optional)
│   └── config.ts
│
├── src/
│   ├── app/
│   │   ├── page.tsx             # Landing page
│   │   ├── app/page.tsx         # Dashboard (POSITIONS + AGENTS tabs)
│   │   ├── markets/             # Markets overview with live prices
│   │   ├── profile/             # User positions summary
│   │   ├── faucet/              # Testnet token faucet
│   │   ├── docs/                # Full documentation (9 pages)
│   │   └── api/bot-activity/    # Bot status API
│   ├── components/
│   │   ├── agents/              # BotStatusPanel, GuardianPanel, YieldOptimizerPanel
│   │   ├── dashboard/           # SupplyPanel, BorrowPanel, HealthFactorBanner
│   │   ├── modals/              # Supply, Borrow, Repay, Withdraw flows
│   │   └── shared/              # Navbar, Modal, TokenIcon, ArcBankLogo
│   ├── hooks/
│   │   ├── use-lending-pool.ts  # All contract reads (useUserAccountData, useReserveData)
│   │   ├── use-realtime-hf.ts   # Price lag detection (CoinGecko vs on-chain)
│   │   └── use-market-prices.ts # Live prices (30s refresh)
│   └── providers/               # Web3Provider, ClientProviders (route-based)
│
├── test/
│   ├── LendingPool.test.ts      # Core protocol (deposit, borrow, repay, liquidate)
│   ├── InterestRateStrategy.test.ts
│   ├── MockERC20.test.ts
│   ├── ValidationLogic.test.ts
│   ├── integration.test.ts
│   └── agents/
│       ├── pool-reader.test.ts  # HF reads, APY
│       ├── liquidator.test.ts   # Price drop → liquidation flow
│       └── backtest.test.ts     # -20/-40/-60% BTC crash scenarios
│
├── scripts/
│   ├── deploy-all.ts            # Full deploy + seed
│   ├── redeploy-pool-pyth.ts    # Redeploy LendingPool only
│   ├── register-agent.ts        # Arc ERC-8004 one-time registration
│   ├── seed-pool.js             # Seed liquidity into pool
│   └── update-prices-quick.js  # Manual Pyth price push
│
├── config/
│   ├── contracts.ts             # All contract addresses (single source of truth)
│   └── networks.ts              # Arc Testnet chain definition
│
├── ecosystem.config.js          # PM2 bot process config
└── docs/
    ├── DEPLOYMENT.md            # Operations reference
    └── VPS_DEPLOY.md            # Bot deployment guide
```

---

## Local Development

### Requirements

- Node.js 22+
- MetaMask with Arc Testnet added:
  - **RPC:** `https://rpc.testnet.arc.network`
  - **Chain ID:** `5042002`
  - **Symbol:** `USDC`

### Setup

```bash
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and connect MetaMask.

### Environment

```bash
# .env.local
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network

# Only for contract deployment — never commit
DEPLOYER_PRIVATE_KEY=
```

---

## Testing

```bash
# Run all 50 tests
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test

# Run specific suite
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test test/LendingPool.test.ts
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test test/agents/backtest.test.ts
```

Test coverage:
- `LendingPool.test.ts` — deposit, borrow, repay, withdraw, liquidation, scaled balances
- `backtest.test.ts` — price crash -20% / -40% / -60% scenarios
- `liquidator.test.ts` — bot liquidation flow end-to-end
- `pool-reader.test.ts` — HF reads, APY calculation

---

## Liquidation Bot

Autonomous bot running on a dedicated VPS via PM2. Monitors all borrower positions every ~15 seconds.

```
watchBlocks (~0.48s/block)
  └─ isRunning guard (prevents concurrent iterations)
      ├─ Every 20 blocks: scan new Borrow events (incremental)
      ├─ Oracle stale > 15s: push fresh Pyth prices on-chain
      ├─ Multicall3: batch-read HF for all borrowers (1 RPC call)
      └─ HF < 1.0: approve → liquidate → earn 5% bonus
```

**Auto-refill:** Bot wallet automatically topped up from deployer when balance < 10 USDC.

**Arc ERC-8004:** Bot registered as on-chain AI agent, identity NFT ID #30907.

To run the bot:
```bash
# Dry run (no transactions)
DRY_RUN=true npm run agent:dry

# Live
npm run agent:run

# Via PM2 (production)
pm2 start ecosystem.config.js
```

---

## Deployment

### Frontend (Vercel)
```bash
vercel deploy --prod
```

### Contracts (Arc Testnet)
```bash
# Full redeploy
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/deploy-all.ts --network arcTestnet

# LendingPool only (keeps oracle + tokens)
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/redeploy-pool-pyth.ts --network arcTestnet

# Seed pool liquidity
node scripts/seed-pool.js

# Update Pyth prices
node scripts/update-prices-quick.js
```

---

## Security

Self-audited. All critical/high severity findings have been patched.

| Fix | Description |
|---|---|
| H-1 | `_updateAllIndexes()` before HF check in all state-changing functions |
| H-2 | `liquidate()` now calls `_updateAllIndexes()` before health factor gate |
| C-1 | Supply cap checked after index update |
| C-2 | Liquidation collateral accounting corrected |
| C-3 | `MockAggregator.setAnswer` protected with `onlyOwner` |
| ReserveLogic | `uint128` overflow guard on index accrual |
| PriceOracle | `.call()` instead of `.transfer()` for fee withdrawal |
| Bot | Collateral token never equals debt token in liquidation plan |

> **Testnet only.** Not professionally audited. Do not use with real funds.

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
