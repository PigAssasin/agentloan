# AgentLoan

<div align="center">

**DeFi lending protocol with an autonomous agent layer, built on Arc Testnet**

[![Live App](https://img.shields.io/badge/Live%20App-agentloan.vercel.app-000000?style=for-the-badge)](https://agentloan.vercel.app)
[![Docs](https://img.shields.io/badge/Docs-agentloan.vercel.app/docs-111111?style=for-the-badge)](https://agentloan.vercel.app/docs)
[![Arc Testnet](https://img.shields.io/badge/Network-Arc%20Testnet%205042002-0066FF?style=for-the-badge)](https://testnet.arcscan.app)
[![Tests](https://img.shields.io/badge/Tests-56%20passing-22c55e?style=for-the-badge)](#testing)

</div>

---

## What is it?

AgentLoan lets you supply crypto as collateral, borrow stablecoins, and earn yield — all on-chain with no intermediaries.

On top of the core lending protocol, it runs a layer of AI agents: an autonomous liquidation bot, a signal marketplace where bots pay each other for early warnings, and in-browser agents that alert users when their position is at risk.

Built on [Arc Testnet](https://arc.io) — USDC as gas, ~0.48s finality, sub-cent transactions.

---

## Quick Start (Browser)

1. Add Arc Testnet to MetaMask: `RPC: https://rpc.testnet.arc.network` · `Chain ID: 5042002` · `Symbol: USDC`
2. Get testnet tokens at [agentloan.vercel.app/faucet](https://agentloan.vercel.app/faucet)
3. Supply → Borrow → watch your Health Factor

---

## Join the Network

Three ways to participate beyond just using the app:

### Run a Liquidation Bot — earn 5% bonus

When a borrower's collateral drops too low (Health Factor < 1.0), the protocol needs someone to step in and repay their debt. You do that — and receive their collateral + 5% bonus in return.

```bash
git clone https://github.com/PigAssasin/agentloan.git
cd agentloan
bash setup.sh           # installs everything + creates .env.local
npm run wallet:new      # generate a dedicated bot wallet
# → paste the private key into .env.local as BOT_PRIVATE_KEY

npm run agent:dry       # test with no real transactions
npm run agent:run       # go live
```

**What you need:** Node.js 22+, some xUSDC for liquidation capital, a little USDC for gas.

**How the math works:** Repay $25k of debt → receive $26.25k of collateral. The 5% comes from the borrower, not the protocol.

---

### Run a Signal Agent — sell early warnings

A Signal Agent scans borrower positions every 5 seconds and sells early warnings (HF < 1.1) to liquidation bots via the [x402 protocol](https://x402.org). Bots pay 1 xUSDC for 1,000 signals.

```bash
git clone https://github.com/PigAssasin/agentloan.git
cd agentloan/signal-agent
bash setup.sh           # generates wallet, installs deps, creates PM2 config
# → follow the printed steps to fund wallet + start
```

See [signal-agent/README.md](signal-agent/README.md) for full details including the API reference and payment flow.

**Revenue:** 1 xUSDC per bot subscription. Gas costs ~0.006 USDC per payment verification. Net ~0.994 xUSDC profit per session.

---

### Liquidate via the UI — no code needed

Go to [agentloan.vercel.app/app](https://agentloan.vercel.app/app) → **JOBS** tab → click **LIQUIDATE** on any available position. Requires xUSDC in your wallet.

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
| Liquidation Bot | #30907 | `0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a` |
| Signal Agent | #31772 | `0x555cc39B822392E45A0B69776d6AeEadfcC5af3D` |

---

## Local Development

```bash
git clone https://github.com/PigAssasin/agentloan.git
cd agentloan
bash setup.sh    # or: npm install --legacy-peer-deps && cp .env.example .env.local
npm run dev      # http://localhost:3000
```

### Environment Variables

```bash
# .env.local — never commit this file

NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network

# Liquidation bot
BOT_PRIVATE_KEY=0x<dedicated-bot-wallet>

# Signal agent (optional — bot works without it)
SIGNAL_AGENT_URL=http://localhost:3001

# Circle SCA wallet (optional — enables gasless liquidations)
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_ID=
CIRCLE_BOT_ADDRESS=

# Only needed for contract redeployment
DEPLOYER_PRIVATE_KEY=0x<deployer>
```

> Never commit `.env.local`. Store `SIGNAL_AGENT_URL` in Vercel Dashboard, not in `vercel.json`.

---

## Testing

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test
```

56 tests covering: deposit/borrow/repay/liquidation, interest rate model, BTC price crash scenarios (-20%/-40%/-60%), agent flows.

---

## How the Agent Layer Works

```
Signal Agent (every 5s)
  └─ scans all positions for HF < 1.1
  └─ sells warnings via x402: 1 xUSDC = 1,000 signals (24h)

Liquidation Bot (every block, ~0.48s)
  └─ buys signals for 15-30s head start
  └─ when HF < 1.0: approve → liquidate → earn 5% bonus
  └─ Circle SCA wallet: gasless, no private key on server
  └─ ERC-8183 jobs: open to community bots too

Guardian Agent (browser)
  └─ alerts you when your HF drops below your threshold

JOBS tab (browser)
  └─ shows all liquidatable positions
  └─ anyone can click to liquidate and earn the bonus
```

---

## Security

Self-audited. Key fixes applied:

- `_updateAllIndexes()` called before health factor checks in all state-changing functions
- `uint128` overflow guard on interest index accrual
- Liquidation collateral token can never equal the debt token
- `.call()` instead of `.transfer()` for oracle fee withdrawal
- Graceful fallback when neither Circle wallet nor private key is configured
- x402 replay attack prevention via in-memory `usedTxHashes` set

**Known limitations:** Not professionally audited. Signal Agent sessions are in-memory and lost on restart. Testnet only — no real funds.

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
| Infra | Vercel + PM2 on VPS |

---

## License

MIT
