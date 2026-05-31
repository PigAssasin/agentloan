# ArcBank

**Decentralized lending and borrowing protocol built on [Arc Testnet](https://arc.io)**

🌐 **Live App** → [arcbank.vercel.app](https://arcbank.vercel.app)

---

## Overview

ArcBank is a DeFi lending protocol inspired by Aave v2, running exclusively on Arc Testnet (Chain ID: 5042002). Users can supply collateral, borrow stablecoins, and earn variable interest — all on-chain with no intermediaries.

- **Supply** xUSDC, xEURC, or xclrBTC to earn yield
- **Borrow** xUSDC against your collateral
- **Liquidate** undercollateralized positions to earn bonuses
- **Interest accrues** in real-time via Aave-style scaled balance indexes

---

## Live Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| LendingPool | [`0x893D0223f63A06CFf83F0e9ef4d58af1Ad2B95fb`](https://testnet.arcscan.app/address/0x893D0223f63A06CFf83F0e9ef4d58af1Ad2B95fb) |
| PriceOracle | [`0x052252c0EEdCb0064D9bD49c94DdfE81Bad6fEA5`](https://testnet.arcscan.app/address/0x052252c0EEdCb0064D9bD49c94DdfE81Bad6fEA5) |
| InterestRateStrategy | [`0x22B2A153F7694e49096ef91D627a80c5b6602Ffd`](https://testnet.arcscan.app/address/0x22B2A153F7694e49096ef91D627a80c5b6602Ffd) |
| xUSDC (testnet) | [`0xFa090bd1A524D861542888B6c5e7965dde1F4f35`](https://testnet.arcscan.app/address/0xFa090bd1A524D861542888B6c5e7965dde1F4f35) |
| xEURC (testnet) | [`0x11aC6A7f4c3235e4edda971838640bE9e55aC222`](https://testnet.arcscan.app/address/0x11aC6A7f4c3235e4edda971838640bE9e55aC222) |
| xclrBTC (testnet) | [`0x938ae31cc6418acc6730cF1AFFE53E91c143B078`](https://testnet.arcscan.app/address/0x938ae31cc6418acc6730cF1AFFE53E91c143B078) |

---

## How It Works

### Interest Rate Model (2-slope variable rate)

```
Utilization 0%  → Borrow APY: 5.0%  │ Supply APY: 0.0%
Utilization 80% → Borrow APY: 9.0%  │ Supply APY: 7.2%  ← kink point
Utilization 100%→ Borrow APY: ~154% │ Supply APY: ~154%
```

Interest accrues every block via a cumulative `liquidityIndex` and `borrowIndex`.
Your real balance = `scaledBalance × currentIndex / 1e27` — it grows automatically.

### Risk Parameters

| Asset | Max LTV | Liq. Threshold | Liq. Bonus | Borrowable |
|---|---|---|---|---|
| xUSDC | 80% | 85% | +5% | ✅ Yes |
| xEURC | 80% | 85% | +5% | ❌ No |
| xclrBTC | 70% | 75% | +5% | ❌ No |

### Health Factor

```
HF = Σ(collateral × liquidation_threshold) / total_debt

HF > 1.0  →  Safe
HF < 1.0  →  Liquidatable
HF = ∞    →  No debt
```

---

## Faucet

Get free testnet tokens at [arcbank.vercel.app/faucet](https://arcbank.vercel.app/faucet):

| Token | Amount | Cooldown |
|---|---|---|
| xUSDC | 10,000 / mint | 24h on-chain per wallet |
| xEURC | 10,000 / mint | 24h on-chain per wallet |
| xclrBTC | 1 / mint | 24h on-chain per wallet |

> Cooldown is enforced by the smart contract — cannot be bypassed by clearing browser data.

Pool is pre-seeded with **500,000 xUSDC · 200,000 xEURC · 10 xclrBTC** for immediate borrowing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Arc Testnet — EVM, Chain ID 5042002, USDC gas |
| Smart Contracts | Solidity ^0.8.20 · OpenZeppelin 5 · Hardhat |
| Price Feeds | Chainlink-compatible MockAggregator |
| Frontend | Next.js 16 · TypeScript · wagmi v2 · viem |
| Wallet | RainbowKit · MetaMask |
| Styling | RawBlock design system (brutalist, white/black) |
| Deployment | Vercel |

---

## Architecture

```
arcbank.vercel.app (Next.js 16)
    ↕  useReadContract / useWriteContract (wagmi v2)
LendingPool.sol                         ← deposit, borrow, repay, withdraw, liquidate
    ├── PriceOracle.sol                 ← Chainlink-compatible, staleness guard
    ├── InterestRateStrategy.sol        ← 2-slope variable rate (base 5%, kink 80%)
    ├── ValidationLogic.sol             ← health factor math (WAD 1e18)
    ├── ReserveLogic.sol                ← scaled balance index accrual (RAY 1e27)
    └── MockERC20.sol × 3              ← xUSDC · xEURC · xclrBTC (24h faucet cooldown)
```

---

## Local Development

### Prerequisites

- Node.js 20+
- MetaMask with Arc Testnet added (Chain ID: 5042002, RPC: `https://rpc.testnet.arc.network`)

### Setup

```bash
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank
npm install
cp .env.example .env.local   # fill in your values
npm run dev
```

### Environment Variables

```env
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x893D0223f63A06CFf83F0e9ef4d58af1Ad2B95fb
NEXT_PUBLIC_PRICE_ORACLE_ADDRESS=0x052252c0EEdCb0064D9bD49c94DdfE81Bad6fEA5
NEXT_PUBLIC_X_USDC_ADDRESS=0xFa090bd1A524D861542888B6c5e7965dde1F4f35
NEXT_PUBLIC_X_EURC_ADDRESS=0x11aC6A7f4c3235e4edda971838640bE9e55aC222
NEXT_PUBLIC_X_CLR_BTC_ADDRESS=0x938ae31cc6418acc6730cF1AFFE53E91c143B078

# Optional — WalletConnect (MetaMask injected wallet works without it)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# NEVER commit — testnet deployer only
DEPLOYER_PRIVATE_KEY=
```

### Smart Contract Commands

```bash
# Run tests (39 tests)
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test

# Compile
npx hardhat compile

# Full redeploy (tokens + oracle + pool)
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/deploy-all.ts --network arcTestnet

# Redeploy only pool (keep tokens/oracle)
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/redeploy-pool.ts --network arcTestnet
```

---

## Security

Smart contracts were self-audited. All critical and high severity findings have been patched:

- ✅ Supply cap stale index (C-1)
- ✅ Liquidation collateral accounting bug (C-2)
- ✅ Oracle `setAnswer` access control (C-3)
- ✅ Cross-reserve stale index in health factor checks (H-1, H-2)
- ✅ Borrow rate overflow cap (H-4)
- ✅ `initReserve` zero address and parameter validation (L-1, L-2, L-3)
- ✅ Rounding direction favors protocol (M-4)
- ✅ Residual ERC20 allowance cleared after repay (M-6)

> **Testnet only.** Not professionally audited. Do not use with real funds.

---

## Pages

| Page | URL | Description |
|---|---|---|
| Landing | [arcbank.vercel.app](https://arcbank.vercel.app) | Overview and entry point |
| Dashboard | [/app](https://arcbank.vercel.app/app) | Your positions, health factor, supply/borrow |
| Markets | [/markets](https://arcbank.vercel.app/markets) | Pool stats, APY, utilization |
| Profile | [/profile](https://arcbank.vercel.app/profile) | Detailed positions and wallet balances |
| Faucet | [/faucet](https://arcbank.vercel.app/faucet) | Mint testnet tokens |

---

## Disclaimer

ArcBank runs on Arc Testnet only. All tokens are testnet assets with no real-world value. This project is for educational and demonstration purposes. Smart contracts have not been professionally audited.

---

*Built on [Arc Network](https://arc.io) · Deployed on [Vercel](https://vercel.com)*
