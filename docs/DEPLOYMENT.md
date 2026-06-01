# ArcBank — Deployment & Operations Guide

## Deployed Contracts (Arc Testnet, Chain ID: 5042002)

| Contract | Address |
|---|---|
| **LendingPool** | `0x6cdbe1cc2Cb9864D9c9118b87799D55967151433` |
| **PriceOraclePyth** | `0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999` |
| **InterestRateStrategy** | `0x22B2A153F7694e49096ef91D627a80c5b6602Ffd` |
| **xUSDC** (testnet) | `0xFa090bd1A524D861542888B6c5e7965dde1F4f35` |
| **xEURC** (testnet) | `0x11aC6A7f4c3235e4edda971838640bE9e55aC222` |
| **xclrBTC** (testnet) | `0x938ae31cc6418acc6730cF1AFFE53E91c143B078` |

**Deployer wallet**: `0x93A7daa58B2dDf25387cE072a95Bea96dc5f93FA`
**Pool seed**: 500,000 xUSDC + 200,000 xEURC + 10 xclrBTC

---

## Oracle — Pyth Network (Real-time)

| Token | Pyth Price ID |
|---|---|
| xclrBTC / BTC | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |
| xEURC / EUR | `0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b` |
| xUSDC / USDC | `0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |

- **Pyth on Arc Testnet**: `0x2880aB155794e7179c9eE2e38200202908C17B43`
- **Hermes API**: `https://hermes.pyth.network`
- **Staleness threshold**: 3600 seconds
- **Auto-refresh**: GitHub Action every 5 minutes via `scripts/update-pyth-prices.ts`

---

## Interest Rate Parameters

| Parameter | Value |
|---|---|
| Base rate | 5% / year |
| Slope 1 (0%–80% util) | 4% / year |
| Kink | 80% utilization |
| Slope 2 (80%–100% util) | 145% / year |
| Max rate cap | 1000% / year |

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

---

## Deploy / Maintenance Commands

```bash
# Full redeploy (all contracts)
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/deploy-all.ts --network arcTestnet

# Redeploy only LendingPool with Pyth oracle
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/redeploy-pool-pyth.ts --network arcTestnet

# Push latest Pyth prices on-chain
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/update-pyth-prices.ts --network arcTestnet

# Migrate user positions old pool → new pool
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/migrate-position.ts --network arcTestnet

# Run all tests (39 tests)
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test
```

---

## Environment Variables (.env.local)

```
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x6cdbe1cc2Cb9864D9c9118b87799D55967151433
NEXT_PUBLIC_PRICE_ORACLE_ADDRESS=0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999
NEXT_PUBLIC_X_USDC_ADDRESS=0xFa090bd1A524D861542888B6c5e7965dde1F4f35
NEXT_PUBLIC_X_EURC_ADDRESS=0x11aC6A7f4c3235e4edda971838640bE9e55aC222
NEXT_PUBLIC_X_CLR_BTC_ADDRESS=0x938ae31cc6418acc6730cF1AFFE53E91c143B078
DEPLOYER_PRIVATE_KEY=          ← NEVER commit
```

---

## Known Limitations

1. **Testnet only** — mock tokens, no real value
2. **Pyth on testnet** — same contract as mainnet Pyth but testnet environment
3. **WalletConnect** — disabled without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
4. **Not professionally audited** — self-audited only
