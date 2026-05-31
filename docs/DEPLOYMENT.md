# sinX — Deployment & Operations Guide

## Deployed Contracts (Arc Testnet, Chain ID: 5042002)

| Contract | Address |
|---|---|
| **LendingPool** | `0xb26c073e9E6748449f1c308a03E523DC42e36958` |
| **PriceOracle** | `0x5a39248A333e9Bdfff468811636aeF19fc39BcFb` |
| **InterestRateStrategy** | `0x0e543078FFf77d34f8238F0625f01203d3d08CFD` |
| **xUSDC** (mock) | `0xccF81F1d0d806Ee9e59e994ed9B03723a776F76D` |
| **xEURC** (mock) | `0x48D9E6819127570a3fBB0940A47B945856eD125D` |
| **xclrBTC** (mock) | `0x71FCA423dc3A497Cb71C8409529095CBD013d915` |
| BTC/USD feed | `0xBb0eE093926758D51860Be2973C91603E4E2ea0e` |
| EUR/USD feed | `0x2547D28fE4CAe1488E6b21ad255d1298f34E601d` |
| USDC/USD feed | `0x2F0E5DA7451a9B1438b842Fa4d80e1863b868F1F` |

**Deployer wallet**: `0x93A7daa58B2dDf25387cE072a95Bea96dc5f93FA`  
**Deployer's pool position**: 500,000 xUSDC + 200,000 xEURC + 10 xclrBTC (seed liquidity)

---

## Oracle Prices (Mock — testnet only)

| Token | Price | Feed decimals |
|---|---|---|
| xclrBTC | $60,000 | 8 |
| xEURC | $1.08 | 8 |
| xUSDC | $1.00 | 8 |

> **Note**: MockAggregator returns `block.timestamp` as `updatedAt` — prices never go stale on testnet.
> To update prices: `npx hardhat run scripts/refresh-prices.ts --network arcTestnet`

---

## Interest Rate Parameters

| Parameter | Value |
|---|---|
| Base rate | 5% / year |
| Slope 1 (0%–80% util) | 4% / year |
| Kink | 80% utilization |
| Slope 2 (80%–100% util) | 145% / year |

At 0% utilization → Borrow APY = 5%, Supply APY = 0%  
At 80% utilization → Borrow APY = 9%, Supply APY ≈ 7.2%  
At 100% utilization → Borrow APY ≈ 154%, Supply APY ≈ 154%

---

## Risk Parameters

| Token | LTV | Liq. Threshold | Liq. Bonus | Borrowable |
|---|---|---|---|---|
| xUSDC | 80% | 85% | +5% | Yes |
| xEURC | 80% | 85% | +5% | No |
| xclrBTC | 70% | 75% | +5% | No |

---

## Faucet Limits

- **xUSDC**: 10,000 per mint, **24h on-chain cooldown** per wallet
- **xEURC**: 10,000 per mint, **24h on-chain cooldown** per wallet
- **xclrBTC**: 1 per mint, **24h on-chain cooldown** per wallet
- Cooldown stored in `lastMintTime[address]` mapping on-chain — cannot be bypassed by clearing browser data
- `ownerMint()` bypasses cooldown (owner only — for seeding)

---

## Re-deploy Instructions

### Full redeploy (all contracts)
```bash
npx hardhat run scripts/deploy-all.ts --network arcTestnet
# Then update config/contracts.ts and .env.local with new addresses
```

### Redeploy only LendingPool (bug fix, keep tokens/oracle)
```bash
npx hardhat run scripts/redeploy-pool.ts --network arcTestnet
```

### Redeploy only price feeds
```bash
npx hardhat run scripts/redeploy-feeds.ts --network arcTestnet
```

### Refresh oracle prices (if stale)
```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/refresh-prices.ts --network arcTestnet
```

---

## Environment Variables (.env.local)

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=   ← set before production
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_LENDING_POOL_ADDRESS=0xb26c073e9E6748449f1c308a03E523DC42e36958
NEXT_PUBLIC_PRICE_ORACLE_ADDRESS=0x5a39248A333e9Bdfff468811636aeF19fc39BcFb
NEXT_PUBLIC_X_USDC_ADDRESS=0xccF81F1d0d806Ee9e59e994ed9B03723a776F76D
NEXT_PUBLIC_X_EURC_ADDRESS=0x48D9E6819127570a3fBB0940A47B945856eD125D
NEXT_PUBLIC_X_CLR_BTC_ADDRESS=0x71FCA423dc3A497Cb71C8409529095CBD013d915
DEPLOYER_PRIVATE_KEY=                   ← NEVER commit, testnet only
```

---

## Known Limitations (Testnet)

1. **Mock tokens only** — xUSDC/xEURC/xclrBTC are not real Arc tokens. Real USDC/EURC/cirBTC pool is "COMING SOON" in Markets page.
2. **Mock oracle prices** — Prices are fixed ($60k BTC, $1.08 EUR, $1 USDC). Not connected to real Chainlink feeds.
3. **No interest compounding display** — UI shows principal amounts. Interest accrual happens via index math on-chain but UI doesn't show accrued interest separately.
4. **WalletConnect projectId** — Using dev fallback. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for production.
5. **Not audited** — Contracts have not been professionally audited. Testnet only.

---

## Architecture Overview

```
Frontend (Next.js 15 + wagmi v2 + viem)
    ↕ useReadContract / useWriteContract
LendingPool.sol
    ├── PriceOracle.sol → MockAggregator (block.timestamp)
    ├── InterestRateStrategy.sol (2-slope variable rate)
    └── MockERC20.sol × 3 (xUSDC, xEURC, xclrBTC)
         └── 24h on-chain faucet cooldown
```

---

## Running Hardhat Commands

```bash
# Always prefix with TS_NODE_PROJECT for scripts:
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/<file>.ts --network arcTestnet

# Tests use same prefix:
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test

# Compile only:
npx hardhat compile
```

---

## Git History — Key Milestones

| Commit | Description |
|---|---|
| `90ffec2` | Initial frontend — RawBlock UI, landing, dashboard, markets, profile |
| `0d5db00` | LendingPool complete — 16/16 tests pass |
| `50cd04e` | Integration tests — full deposit/borrow/crash/liquidation flow |
| `8ded8e5` | First deploy to Arc Testnet |
| `2fb2136` | Fix availableBorrows bug (borrow unlock) + totalRawCollateral |
| `d364143` | MockAggregator block.timestamp fix (oracle never stale) |
| `6099042` | On-chain 24h faucet cooldown — cannot bypass |
| `a65dbf3` | Wallet switch fix (no stale data from previous wallet) |
