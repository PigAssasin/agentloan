# Arc Lending — Developer Brain Graph

> Quick-lookup reference: Arc Network · USDC/Circle · Aave Risk Model · Security
> Sources verified: docs.arc.io · circle.com · aave.com/docs · coinbase security guides
> Last updated: 2026-06-02

---

## MASTER MAP

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ARC LENDING STACK                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    SECURITY LAYER                               │   │
│  │  Key storage · Phishing defense · Scam vectors · Opsec rules   │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                       │
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │                    APPLICATION LAYER                            │   │
│  │  Arc Lending contracts · LTV · Liquidation · Oracle staleness  │   │
│  └──────────┬──────────────────────────────────────────────────────┘   │
│             │                        │                                  │
│  ┌──────────▼──────────┐  ┌──────────▼──────────────────────────────┐  │
│  │   USDC / CIRCLE     │  │          ARC NETWORK                    │  │
│  │  Reserve · Risk     │  │  Consensus · Execution · Precompiles    │  │
│  │  MiCA · Redemption  │  │  Chain ID 5042002 · Reth · USDC gas     │  │
│  └─────────────────────┘  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. ARC NETWORK — QUICK FACTS

```
┌────────────────────────────────────────────────────────────────────┐
│  CHAIN ID        5042002                                           │
│  GAS TOKEN       USDC (~$0.01/tx, EWMA-smoothed)                  │
│  BLOCK TIME      ~0.48s                                            │
│  FINALITY        <350ms deterministic (no reorg possible)          │
│  EVM CLIENT      Reth (Rust Ethereum, Prague hard fork)            │
│  THROUGHPUT      3,000+ TPS (20 validators)                        │
│                  10,000+ TPS (4 validators)                        │
│  RPC             https://rpc.testnet.arc.network                   │
│  EXPLORER        https://testnet.arcscan.app                       │
│  FAUCET          https://faucet.circle.com                         │
└────────────────────────────────────────────────────────────────────┘
```

### 1a. Consensus Layer (Malachite BFT)

```
Mechanism: Tendermint-based BFT, Proof-of-Authority validator set
Validators: Permissioned — regulated institutions, SOC 2 certified,
            geographic distribution, uptime SLA required

4-step pipeline:
  [Propose] → [Pre-vote] → [Pre-commit] → [Commit]

Safety rule: ≥2/3 validators must agree → no conflicting blocks possible
Finality:    DETERMINISTIC — committed block CANNOT be reversed or reorganized
Dev impact:  1 confirmation = final. No need to wait 12+ blocks like Ethereum.

Fault tolerance: <1/3 faulty validators → guaranteed safety
Accountability:  Institutional (regulated entities) — malicious = legal + reputational cost
```

### 1b. Execution Layer (Reth)

```
Pipeline per tx:
  Mempool → EVM execution → Fee Manager → Module calls → State update → State root

Gas model: USDC-denominated EWMA fee curve
  → target $0.01/tx
  → paid in USDC, NOT ETH
  → no ETH balance needed

EVM compatibility: Full (standard Solidity tooling works unchanged)
Hard fork: Prague (latest)
```

### 1c. Precompiles (0x1800.. range)

| Address | Name | What it does |
|---|---|---|
| `0x1800..0000` | Native Coin Authority | USDC mint/burn/transfer at protocol level |
| `0x1800..0001` | Native Coin Control | Address blocklist (Circle compliance) |
| `0x1800..0002` | System Accounting | Fee Manager gas ring buffer |
| `0x1800..0003` | CallFrom | Preserves `msg.sender` across delegated calls |
| `0x1800..0004` | PQ Signature Verify | Post-quantum signatures (SLH-DSA-SHA2-128s) |

**CallFrom**: Memo contract `0x9702...` + Multicall3From `0xEb7c...` use this.

### 1d. Key Contracts (Testnet)

| Contract | Address |
|---|---|
| USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| TokenMessengerV2 (CCTP) | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |

---

## 2. USDC / CIRCLE — RISK & RESERVE MODEL

```
┌────────────────────────────────────────────────────────────────────┐
│                    USDC RESERVE COMPOSITION                        │
│                                                                    │
│   ~80%  Short-duration US Treasury securities                      │
│         (SEC-regulated government money fund, daily transparency)  │
│                                                                    │
│   ~20%  Cash deposits at a GSIB bank                               │
│         (systemically important bank, stringent capital rules)     │
│                                                                    │
│   Segregated accounts — excluded from Circle's bankruptcy estate   │
│   Circle corporate backstop: >$800M cash reserves                  │
│   Attestation: monthly independent third-party verification        │
└────────────────────────────────────────────────────────────────────┘
```

### 2a. What Can Break the Peg

| Risk | Severity | Mechanism |
|---|---|---|
| Bank run / mass redemption | Medium | T-bills must be liquidated; minor slippage possible |
| GSIB bank failure | Low | Concentration in 1 bank; mitigated by GSIB status |
| T-bill market disruption | Low | Short-duration → fast liquidation |
| Circle insolvency | Low | Reserves segregated → not in bankruptcy estate |
| Address blocking | Operational | Circle can freeze specific addresses (compliance) |
| Regulatory action | Low-Medium | MiCA: temporary limits/suspension possible in stress |

### 2b. MiCA Compliance (EU) — Dev Constraints

```
Regulatory body:  Circle SAS under ACPR (France) / MiCA Regulation EU 2023/1114
Token class:      E-money token (EMT)
Backing:          1:1 USD-denominated assets in segregated accounts
Redemption:       Par value guaranteed for EEA holders (AML/KYC required)

CIRCLE CAN:
  ✗ Block addresses suspected of illegal activity
  ✗ Impose temporary liquidity fees during stress
  ✗ Set daily redemption limits (aggregate + per-wallet)
  ✗ Suspend redemptions as last resort

Implications for Arc Lending:
  → User's USDC balance could become inaccessible if Circle blocks their address
  → Protocol should not assume USDC is always transferable
  → Build graceful failure paths for failed USDC transfers
```

### 2c. USDC Technical Properties

```
Standard:       ERC-20 on EVM chains
Decimals:       6 (ERC-20 interface) / 18 (Arc native gas internal)
Upgradeability: UUPS proxy pattern (upgradeable contract)
Cross-chain:    CCTP v2 (Circle's official bridge)
Audits:         Open-source, regularly audited by third parties
Supported nets: 34 blockchains (native), CCTP-compatible

Arc-specific:
  → USDC is ALSO the gas token on Arc — 1 token serves both roles
  → Transfers use standard ERC-20 interface (6 decimals)
  → Gas deducted in USDC automatically by Fee Manager
```

---

## 3. LENDING RISK MODEL (Aave Pattern → Arc Lending)

```
┌────────────────────────────────────────────────────────────────────┐
│                    RISK CATEGORY MAP                               │
│                                                                    │
│  [Smart Contract Risk]                                             │
│    → Code is public + audited + bug bounty                        │
│    → All state changes must emit events                           │
│    → Use OpenZeppelin patterns (ReentrancyGuard, Ownable)         │
│                                                                    │
│  [Oracle Risk]                                                     │
│    → Single oracle failure → wrong liquidations → bad debt        │
│    → RULE: staleness check mandatory (max 3600s)                  │
│    → Use Chainlink (push) + Pyth (pull) redundancy                │
│    → Never use spot price for liquidation — use TWAP or           │
│      time-weighted feed                                           │
│                                                                    │
│  [Collateral Risk]                                                 │
│    → Asset price drops → under-collateralization                  │
│    → Mitigated via LTV < 100% and liquidation threshold buffer    │
│    → USYC: yield-bearing but can have delay in price update       │
│                                                                    │
│  [Liquidation Risk]                                                │
│    → Position not liquidated in time → protocol bad debt          │
│    → Keep liquidation bonus attractive for bots                   │
│    → Emit Liquidated(borrower, liquidator, amount) always         │
│                                                                    │
│  [Market / Liquidity Risk]                                         │
│    → Low liquidity → liquidation bots can't exit → bad debt      │
│    → USDC pool is most liquid on Arc                              │
└────────────────────────────────────────────────────────────────────┘
```

### 3a. Risk Parameters Reference

| Parameter | Conservative | Aggressive | Notes |
|---|---|---|---|
| LTV (Loan-to-Value) | 60–70% | 80–85% | Never 100% |
| Liquidation Threshold | 75–80% | 85–90% | Always > LTV |
| Liquidation Bonus | 5–10% | 3–5% | Higher = more bot incentive |
| Oracle Staleness | 3600s max | 3600s max | Hard rule — no exceptions |
| Interest Rate Model | Utilization curve | — | Spike at >80% utilization |

### 3b. Liquidation Flow

```
Health Factor = (collateral_value × liquidation_threshold) / borrowed_value

HF < 1.0 → LIQUIDATABLE

Liquidation path:
  Bot detects HF < 1 → calls liquidate(borrower) →
  Contract: verify HF < 1 (on-chain, not client) →
  Transfer collateral to liquidator (at discount) →
  Repay borrow portion →
  Emit Liquidated(borrower, liquidator, debtRepaid, collateralSeized)

RULE: Collateral ratio check MUST happen on-chain, never trust frontend.
```

---

## 4. SECURITY — DEVELOPER RULES

### 4a. Secret & Key Management

```
RULE                          WHY
──────────────────────────────────────────────────────────────────
Never put private key in code  One GitHub leak = total loss
Use .env.local (gitignored)    Local secrets stay local
Use Vercel env vars in prod    Encrypted at rest, injected at runtime
Rotate API keys regularly      Leaked key from old build can still work
Never log keys or mnemonics    Logs are often shipped to external services
Circle API key: server-side    NEVER expose in browser/client bundle
USDC contract: UUPS upgradeable → watch for Circle upgrade events
```

### 4b. Smart Contract Attack Surface

```
┌─────────────────────────────────────────────────────────────────┐
│  ATTACK              DEFENSE                                    │
├─────────────────────────────────────────────────────────────────┤
│  Reentrancy          ReentrancyGuard on all state-changing fns  │
│  Price manipulation  TWAP oracle + staleness check              │
│  Flash loan attack   Health factor check AFTER balance change   │
│  Griefing            Min deposit / dust limits                  │
│  Front-running       No mempool manipulation possible on Arc    │
│                      (PoA = known validators)                   │
│  Overflow/underflow  Solidity ^0.8.20 has built-in protection   │
│  Access control      Ownable + role-based (OpenZeppelin)        │
│  Upgradeable proxy   Timelock on upgrades, emit Upgraded()      │
└─────────────────────────────────────────────────────────────────┘
```

### 4c. Scam & Phishing Vectors (User Protection)

```
Common scam types:
  ① Fake dApp URL       → users connect wallet to phishing site
  ② Approval phishing   → users approve unlimited token spend
  ③ Fake support DMs    → "your funds at risk, click here"
  ④ Pig-butchering      → slow trust-building before rug
  ⑤ Fake token airdrop  → malicious contract interaction
  ⑥ Wallet drainer tx   → disguised as mint/claim

Developer checklist to protect users:
  □ Show domain clearly in UI (no URL shorteners)
  □ Warn before any token approval — show exact amount + spender
  □ Never ask for seed phrase (add visible disclaimer)
  □ Limit token approvals: use exact amount, not uint256.max
  □ Display human-readable tx preview before signing
  □ Official support channel visible and clearly marked
  □ No "connect wallet via DM" flow
```

### 4d. Wallet & Auth Opsec

```
For users:
  • Hardware wallet for large positions (Ledger/Trezor)
  • 2FA on all exchange accounts (authenticator app, not SMS)
  • Seed phrase: offline, physical, never photographed
  • Separate hot wallet (small funds) from cold wallet (savings)
  • Verify contract address on explorer before approving

For devs:
  • Deployer key: hardware wallet or HSM, never plain .env
  • Multi-sig for protocol admin functions (Gnosis Safe)
  • Separate dev/staging/prod keys — never share
```

---

## 5. CROSS-DOMAIN RULES FOR ARC LENDING

```
These rules come from connecting all 4 domains above:

RULE 1 — USDC transferability is not guaranteed
  Source: Circle MiCA whitepaper (address blocking + redemption limits)
  Apply:  All transfer calls must handle failure gracefully.
          Use try/catch or check return value.
          Emit TransferFailed event for monitoring.

RULE 2 — Oracle staleness is non-negotiable
  Source: Aave risk model + web3 rules
  Apply:  PriceOracle.sol must reject prices older than 3600s.
          Liquidation reverts if oracle is stale.
          Never use oracle price from frontend for UI without rechecking.

RULE 3 — Collateral check must be on-chain
  Source: Aave risk model + web3 rules
  Apply:  Do NOT validate LTV ratio in React/TypeScript.
          LendingPool.sol re-validates before every borrow/liquidate.

RULE 4 — Arc finality = 1 confirmation
  Source: Arc consensus layer (<350ms deterministic)
  Apply:  No need to wait multiple blocks.
          wagmi: use 1 confirmation for UX speed.
          DO NOT show "pending" for >2s after inclusion.

RULE 5 — USDC decimals are dual (6 external, 18 internal)
  Source: Arc execution layer + arc-network-graph.md
  Apply:  All ERC-20 calls use 6 decimals.
          Gas estimation uses 18 decimal internal value.
          Never mix the two in calculations.

RULE 6 — Address blocking can freeze collateral
  Source: Circle Native Coin Control precompile (0x1800..0001)
  Apply:  If user's address is blocked by Circle:
          → Their USDC balance cannot be transferred
          → Liquidation for that user may fail
          → Protocol needs circuit breaker for stuck positions

RULE 7 — Post-quantum signatures exist on Arc
  Source: Arc execution layer (PQ Signature Verify precompile)
  Apply:  If building account abstraction, support SLH-DSA-SHA2-128s.
          Standard ECDSA still works — this is optional/additive.
```

---

## 6. QUICK DECISION TABLE

| You're doing... | Check |
|---|---|
| Deploying a contract | `pragma solidity ^0.8.20` · Prague EVM · gas in USDC |
| Reading price on-chain | Staleness ≤ 3600s? If not → revert |
| Calling USDC transfer | Wrap in try/catch · handle blocking failure |
| Building liquidation | Health factor check on-chain · emit Liquidated event |
| Setting LTV | LTV < Liquidation Threshold · keep buffer ≥5% |
| Approving tokens in UI | Show exact amount · warn user · no uint256.max |
| Storing secrets | .env.local (dev) · Vercel env (prod) · never in code |
| Waiting for tx confirmation | 1 block = final on Arc · don't over-wait |
| Using CCTP bridge | TokenMessengerV2 at `0x8FE6...` · USDC only |
| Calling delegated calls | Use CallFrom precompile to preserve msg.sender |

---

## 7. SOURCES

| Domain | URL |
|---|---|
| Arc overview | https://docs.arc.io/ |
| Arc consensus layer | https://docs.arc.io/arc/concepts/consensus-layer |
| Arc execution layer | https://docs.arc.io/arc/concepts/execution-layer |
| Arc network graph (local) | docs/arc-network-graph.md |
| USDC overview | https://www.circle.com/usdc |
| USDC MiCA whitepaper | https://www.circle.com/legal/mica-usdc-whitepaper |
| USDC reserve structure | https://www.circle.com/blog/how-the-usdc-reserve-is-structured-and-managed |
| Circle API key security | https://developers.circle.com/circle-mint/api-keys |
| Aave risk documentation | https://aave.com/docs/resources/risks |
| Crypto security (Coinbase) | https://www.coinbase.com/learn/crypto-basics/how-to-secure-crypto |
| Phishing avoidance | https://help.coinbase.com/en/wallet/security/avoiding-crypto-scams |
