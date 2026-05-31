# Arc Network — Architecture Graph

> **Arc Lending** sẽ chạy trên Arc Chain (Testnet Chain ID: 5042002)

---

## 1. Tổng quan kiến trúc Arc

```
┌──────────────────────────────────────────────────────────────────────┐
│                          ARC NETWORK                                 │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    EXECUTION LAYER                           │    │
│  │         Reth (Rust Ethereum) · Prague Hard Fork · EVM        │    │
│  │         Gas Token: USDC (18 dec internal / 6 dec ERC-20)     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              ▲                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   CONSENSUS LAYER                            │    │
│  │         Malachite BFT · Sub-second finality (~0.48s)         │    │
│  │         Permissioned validators · Deterministic finality      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Chain ID: 5042002  │  Block: ~0.48s  │  Gas: ~$0.01/tx            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Token Ecosystem (Testnet)

```
┌────────────────────────────────────────────────────────────────────┐
│                        NATIVE TOKENS                               │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  USDC  0x3600...0000                                      │     │
│  │  • Native gas token (18 dec internal)                     │     │
│  │  • ERC-20 interface (6 dec)                               │     │
│  │  • Dùng cho: Gas, Collateral, Borrow, Repay               │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  EURC  0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a        │     │
│  │  • Euro stablecoin (6 dec)                                │     │
│  │  • Dùng cho: Collateral, FX                               │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  USYC  0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C        │     │
│  │  • Yield-bearing money market token (6 dec)               │     │
│  │  • Dùng cho: Collateral có yield, Lending pool           │     │
│  └──────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Infrastructure Contracts (Testnet)

```
┌────────────────────────────────────────────────────────────────────┐
│                    CROSSCHAIN (CCTP v2)                            │
│                                                                    │
│  TokenMessengerV2    0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA   │
│  MessageTransmitterV2 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275  │
│  TokenMinterV2       0xb43db544E2c27092c107639Ad201b3dEfAbcF192   │
│  GatewayWallet       0x0077777d7EBA4688BDeF3E311b846F25870A19B9   │
│  GatewayMinter       0x0022222ABE238Cc2C7Bb1f21003F0a260052475B   │
├────────────────────────────────────────────────────────────────────┤
│                    UTILITY CONTRACTS                               │
│                                                                    │
│  Permit2             0x000000000022D473030F116dDEE9F6B43aC78BA3   │
│  Multicall3          0xcA11bde05977b3631167028862bE2a173976CA11   │
│  CREATE2 Factory     0x4e59b44847b379578588920cA78FbF26c0B4956C   │
├────────────────────────────────────────────────────────────────────┤
│                    USYC INFRASTRUCTURE                             │
│                                                                    │
│  Entitlements        0xcc205224862c7641930c87679e98999d23c26113   │
│  Teller              0x9fdF14c5B14173D74C08Af27AebFf39240dC105A   │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. RPC Endpoints (Testnet)

```
┌────────────────────────────────────────────────────────────────────┐
│                      RPC PROVIDERS                                 │
│                                                                    │
│  Primary         https://rpc.testnet.arc.network                  │
│  Blockdaemon     https://rpc.blockdaemon.testnet.arc.network      │
│  dRPC            https://rpc.drpc.testnet.arc.network             │
│  QuickNode       https://rpc.quicknode.testnet.arc.network        │
│                                                                    │
│  WebSocket (Primary)  wss://rpc.testnet.arc.network               │
│                                                                    │
│  Explorer        https://testnet.arcscan.app                      │
│  Faucet          https://faucet.circle.com                        │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5. Oracle Providers (Price Feeds cho Lending)

```
┌────────────────────────────────────────────────────────────────────┐
│                        ORACLES                                     │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────┐  │
│  │  Chainlink   │  │    Pyth      │  │  RedStone   │  │ Stork │  │
│  │  Push model  │  │  Pull model  │  │ Push/Pull   │  │ Pull  │  │
│  │  Crypto+FX   │  │  Real-time   │  │  Modular    │  │ Ultra │  │
│  └──────────────┘  └──────────────┘  └─────────────┘  │ low   │  │
│                                                        │latency│  │
│  → Dùng cho Lending: USDC/USD, EURC/USD, USYC/USD     └───────┘  │
│  → Staleness check bắt buộc: max 1 hour (theo rules)             │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6. App Kit SDK

```
┌────────────────────────────────────────────────────────────────────┐
│                     @circle-fin/app-kit                            │
│                                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │   Bridge   │  │    Swap    │  │    Send    │  │  Unified   │  │
│  │ Cross-chain│  │ Same-chain │  │  Transfers │  │  Balance   │  │
│  │  USDC move │  │ token swap │  │  P2P pay   │  │ Chain-agno │  │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │
│                                                                    │
│  Adapters: viem · ethers · Solana · Circle Wallets                │
│  Install:  @circle-fin/app-kit + @circle-fin/adapter-viem-v2      │
└────────────────────────────────────────────────────────────────────┘
```

---

## 7. Tooling Ecosystem

```
┌────────────────────────────────────────────────────────────────────┐
│  Account Abstraction  │  Smart wallets, Paymasters, Session keys  │
├────────────────────────────────────────────────────────────────────┤
│  Node Providers       │  Alchemy · QuickNode · Blockdaemon · dRPC │
├────────────────────────────────────────────────────────────────────┤
│  Data Indexers        │  The Graph · Envio · Goldsky · Thirdweb   │
├────────────────────────────────────────────────────────────────────┤
│  Compliance           │  Elliptic · TRM Labs                      │
├────────────────────────────────────────────────────────────────────┤
│  Privacy (opt-in)     │  ArcaneVM                                 │
├────────────────────────────────────────────────────────────────────┤
│  Post-quantum         │  SLH-DSA-SHA2-128s wallet signatures      │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8. Arc Lending App — Mapping lên Arc

```
┌────────────────────────────────────────────────────────────────────┐
│                    ARC LENDING ARCHITECTURE                        │
│                                                                    │
│   User Wallet (RainbowKit + wagmi)                                │
│         │                                                          │
│         ▼                                                          │
│   Frontend (Next.js App Router)                                   │
│         │                                                          │
│         ├── App Kit SDK (Bridge / Unified Balance)                │
│         │                                                          │
│         ▼                                                          │
│   Arc Chain (Chain ID: 5042002)                                   │
│         │                                                          │
│         ├── LendingPool.sol   ← core contract (chúng ta build)    │
│         │     ├── deposit(USDC / EURC / USYC)                     │
│         │     ├── borrow(amount, collateral)                      │
│         │     ├── repay(amount)                                    │
│         │     └── liquidate(borrower)                             │
│         │                                                          │
│         ├── PriceOracle.sol   ← wrap Chainlink / Pyth             │
│         │     └── staleness check: max 3600 seconds               │
│         │                                                          │
│         └── Native Tokens                                         │
│               ├── USDC  0x3600...0000  (gas + borrow asset)       │
│               ├── EURC  0x89B5...72a   (collateral)               │
│               └── USYC  0xe918...86C   (yield collateral)         │
│                                                                    │
│   Gas: ~$0.01/tx · Finality: <1s · Block: 0.48s                  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 9. Key Facts cho Development

| Thông số | Giá trị |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| USDC address | `0x3600000000000000000000000000000000000000` |
| USDC decimals | 6 (ERC-20) / 18 (native gas) |
| EURC address | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| USYC address | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| Gas target | ~$0.01/tx |
| Block time | ~0.48 giây |
| Finality | < 1 giây, deterministic |
| EVM | Prague hard fork (Reth) |
| Pragma | `^0.8.20` |
| Faucet | `https://faucet.circle.com` |
