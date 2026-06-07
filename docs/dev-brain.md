# Arc Lending — Developer Brain Graph

> Quick-lookup reference: Arc Network · USDC/Circle · CCTP V2 · Aave Risk Model · Security · Circle Agent Stack / x402
> Sources verified: docs.arc.io · circle.com · developers.circle.com/cctp · agents.circle.com · aave.com/docs · coinbase security guides
> Last updated: 2026-06-04

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
│  └──────────┬─────────────────────────────────┬────────────────────┘   │
│             │                                 │                         │
│  ┌──────────▼──────────┐  ┌───────────────────▼──────────────────────┐ │
│  │   USDC / CIRCLE     │  │          ARC NETWORK                     │ │
│  │  Reserve · Risk     │  │  Consensus · Execution · Precompiles     │ │
│  │  MiCA · Redemption  │  │  Chain ID 5042002 · Reth · USDC gas      │ │
│  └──────────┬──────────┘  └──────────────────────────────────────────┘ │
│             │                                                           │
│  ┌──────────▼──────────────────────────────────────────────────────┐   │
│  │              CCTP V2 — CROSS-CHAIN BRIDGE LAYER                 │   │
│  │  Burn→Attest→Mint · Domain 26 (Arc) · Fast ~8-20s / Std ~15min  │   │
│  │  TokenMessengerV2 · MessageTransmitterV2 · Hooks · Iris API     │   │
│  └──────────┬──────────────────────────────────────────────────────┘   │
│             │                                                           │
│  ┌──────────▼──────────────────────────────────────────────────────┐   │
│  │              CIRCLE AGENT STACK (x402)                          │   │
│  │  Agent Wallets · Nanopayments · Marketplace · x402 protocol     │   │
│  │  agents.circle.com · $0.001–$1 per API call · USDC only         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
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
| Using CCTP bridge | TokenMessengerV2 `0x8FE6...` · Arc = Domain 26 · Fast (8-20s) or Standard (15min) |
| CCTP Fast Transfer | Set maxFee > 0 · poll Iris /v2/messages · threshold < 2000 |
| CCTP with hook | `depositForBurnWithHook()` · implement IMessageHandlerV2 on destination |
| Calling delegated calls | Use CallFrom precompile to preserve msg.sender |

---

## 7. CCTP V2 — CROSS-CHAIN TRANSFER PROTOCOL

> Source: developers.circle.com/cctp · verified 2026-06-04
> Arc Testnet = Domain 26 · Supports Standard Transfer + Fast Transfer + Hooks + Forwarding

### 7a. What is CCTP

```
Permissionless onchain utility — native USDC transfers across blockchains.
Mechanism: BURN on source chain → MINT on destination chain (1:1, no wrapped tokens).

NO liquidity pools. NO bridge reserves. NO wrapped USDC.
Supply parity maintained across all networks.
```

### 7b. Burn-and-Mint Flow (3 Steps)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CCTP V2 TRANSFER FLOW                             │
│                                                                      │
│  Source Chain                Iris (offchain)     Destination Chain   │
│  ─────────────               ─────────────       ─────────────────   │
│                                                                      │
│  1. depositForBurn()    →    event emitted                           │
│     (burns USDC on src)                                              │
│                                                                      │
│                         →   Iris signs message  →                   │
│                              (attestation API)                       │
│                                                                      │
│                                                  2. receiveMessage() │
│                                                     (mints USDC on   │
│                                                      destination)    │
│                                                                      │
│  With Hook:  depositForBurnWithHook()                                │
│              → hook data executes on destination AFTER mint         │
│                (e.g. deposit into lending pool automatically)        │
└──────────────────────────────────────────────────────────────────────┘
```

### 7c. Transfer Types

| Type | Speed | Finality Threshold | Fee | When to use |
|---|---|---|---|---|
| **Fast Transfer** | ~8–20 seconds | < 2000 (soft finality) | Variable fee | UX-critical flows, bots |
| **Standard Transfer** | ~15–19 min (ETH/L2s) | ≥ 2000 (hard finality) | No fee | Large amounts, no rush |

```
Finality threshold values:
  1000 = Confirmed (Fast)  →  handleReceiveUnfinalizedMessage()
  2000 = Finalized (Std)   →  handleReceiveFinalizedMessage()

Values < 1000 floor to 1000. Values between 1000–2000 ceil to 2000.
```

### 7d. V1 vs V2 — Key Differences

| Feature | V1 | V2 |
|---|---|---|
| Attestation API | 2 separate calls | 1 call (message + attestation combined) |
| Transfer speed | Standard only | Fast + Standard (via `minFinalityThreshold`) |
| Hooks | Not supported | `depositForBurnWithHook()` |
| Caller restriction | `depositForBurnWithCaller()` | `destinationCaller` param in main fn |
| Fees | Free | Fast Transfer carries variable fee |
| `depositForBurn()` signature | 4 params | 7 params (+ destinationCaller, maxFee, minFinalityThreshold) |
| `replaceDepositForBurn()` | Supported | Removed |

### 7e. Contract Addresses

**Testnet (Arc Domain 26 + all standard testnets):**

| Contract | Address |
|---|---|
| TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| TokenMinterV2 | `0xb43db544E2c27092c107639Ad201b3dEfAbcF192` |
| MessageV2 | `0xbaC0179bB358A8936169a63408C8481D582390C4` |

**Mainnet (Ethereum, Base, Arbitrum, OP, Avalanche, and 20+ others):**

| Contract | Address |
|---|---|
| TokenMessengerV2 | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` |
| MessageTransmitterV2 | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` |
| TokenMinterV2 | `0xfd78EE919681417d192449715b2594ab58f5D002` |
| MessageV2 | `0xec546b6B005471ECf012e5aF77FBeC07e0FD8f78` |

> Note: EDGE (Domain 28) uses different mainnet addresses — check contract-addresses.md.

### 7f. Supported Chains — Key Domains

| Domain | Chain | Fast Transfer | Forwarding |
|---|---|---|---|
| 0 | Ethereum | ✅ | ✅ |
| 2 | OP Mainnet | ✅ | ✅ |
| 3 | Arbitrum | ✅ | ✅ |
| 5 | Solana | ✅ | ✅ |
| 6 | Base | ✅ | ✅ |
| **26** | **Arc Testnet** | **✅** | **✅** |
| 27 | Stellar | ✅ | ❌ |
| 28 | EDGE | ✅ | ✅ |

Full list: 25+ chains. Arc mainnet domain TBD — verify when deploying mainnet.

### 7g. Attestation Service (Iris)

```
Iris = Circle's offchain attestation service

Testnet API: https://iris-api-sandbox.circle.com
Mainnet API: https://iris-api.circle.com

Key endpoints:
  GET /v2/messages?txHash=<hash>    → fetch attestation (single call in V2)
  GET /v2/publicKeys                → validate attestation signatures
  POST /v2/reattest                 → recover expired Fast Transfers
  GET /v2/burn/USDC/fees            → current transfer fees
  GET /v2/fastBurn/USDC/allowance   → available Fast Transfer capacity

Rate limit: 35 req/s → HTTP 429 → 5-minute block if exceeded
```

### 7h. Message Format (BurnMessageV2)

```
Header: 148 bytes
  version (4)             → use 1 for CCTP
  sourceDomain (4)        → e.g. 26 for Arc Testnet
  destinationDomain (4)   → target chain
  nonce (32)              → unique, assigned offchain
  sender (32)             → source caller address (bytes32)
  recipient (32)          → destination handler
  destinationCaller (32)  → permitted executor (bytes32(0) = anyone)
  minFinalityThreshold (4)
  finalityThresholdExecuted (4)

Body (variable):
  tokenAddress · mintRecipient · amount · maxFee · feeExecuted
  expirationBlock (set 24h forward)
  hookData (optional — opaque payload for destination hook)

IMPORTANT: EVM addresses use bytes32 encoding.
           Use Message.sol library for address conversions.
```

### 7i. Hooks — How They Work

```
depositForBurnWithHook(
  amount,
  destinationDomain,
  mintRecipient,
  burnToken,
  destinationCaller,
  maxFee,
  minFinalityThreshold,
  hookData          ← your custom bytes payload
)

On destination:
  → USDC minted to mintRecipient
  → hookData forwarded to recipient contract
  → Recipient executes custom logic (deposit, swap, etc.)

CCTP treats hookData as opaque — it does NOT execute the hook.
Your destination contract must implement IMessageHandlerV2 to use it.

Arc Lending use case: bridge USDC and auto-deposit as collateral in 1 tx.
```

### 7j. CCTP Rules for Arc Lending

```
RULE C1 — Arc Testnet is Domain 26
  All CCTP messages TO Arc must use destinationDomain = 26.
  Arc → Ethereum = sourceDomain 26, destinationDomain 0.

RULE C2 — Fast Transfer requires fee budget
  Include maxFee in depositForBurn() to enable Fast path.
  Set maxFee = 0 to force Standard Transfer (no fee, slower).
  Check GET /v2/burn/USDC/fees before each tx for current cost.

RULE C3 — Attestation is NOT instant
  Fast: ~8-20s · Standard: ~15-19min on Ethereum.
  UI must show pending state; do NOT assume instant finality.
  Poll GET /v2/messages until status = "complete".

RULE C4 — Hooks are opt-in, not mandatory
  Standard burn still works without hook.
  Use hooks ONLY when you need chained actions on destination.
  Always test hook handler with handleReceiveUnfinalizedMessage
  AND handleReceiveFinalizedMessage separately.

RULE C5 — Arc mainnet CCTP availability unconfirmed
  Arc Testnet (Domain 26) is confirmed on CCTP.
  Arc Mainnet domain TBD — verify at developers.circle.com/cctp
  before building production cross-chain flows.

RULE C6 — Stellar uses CctpForwarder (different)
  If bridging Solana/Stellar → Arc, use correct recipient handling.
  Stellar has precision/encoding differences requiring CctpForwarder.
```

---

## 8. CIRCLE AGENT STACK & x402 PROTOCOL

> Source: agents.circle.com · developers.circle.com/agent-stack
> Verified: 2026-06-04 — 99.8% of x402 volume is USDC (May 2026 stat)
> Arc Chain ID `eip155:5042002` CONFIRMED supported in Gateway middleware

### 8a. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CIRCLE AGENT STACK                                │
│                                                                      │
│  ① Circle CLI         Manages wallets, installs Skills, CLI access  │
│  ② Agent Wallets      2-of-2 MPC, user-custodied, spending policies │
│  ③ Agent Nanopayments Gasless sub-cent USDC via Gateway x402        │
│  ④ Agent Marketplace  Service catalog — agents pay USDC per request │
│  ⑤ Circle Skills      Open-source modules for Circle product access  │
│                                                                      │
│  Supported agent platforms: Claude · Codex · Cursor · Claws · Custom│
└──────────────────────────────────────────────────────────────────────┘

Entry point:  agents.circle.com
Marketplace:  agents.circle.com/services
Docs:         developers.circle.com/agent-stack
```

### 8b. x402 Protocol — HTTP Payment Flow

```
Standard HTTP 402 "Payment Required" repurposed for USDC micropayments.
Payment IS authentication — no API key, no subscription, no checkout.

FLOW:
  Agent  →  GET /api/endpoint
             ← 402 Payment Required  { price: "$0.01", asset: "USDC" }
  Agent  →  GET /api/endpoint  +  X-Payment: <signed USDC authorization>
             ← 200 OK  +  data

Seller side: middleware calls Gateway settle() → USDC lands in seller wallet.
Payment signature validity: MUST be valid ≥ 7 days from creation.
                            Gateway rejects signatures expiring sooner.

99.8% of all x402 volume = USDC (May 2026)
```

### 8c. Seller Setup — Monetize Any API

```
Pricing models available:
  • Per-API-call    → gateway.require("$0.01")
  • Per-token       → custom middleware
  • Per-second      → custom middleware
```

```ts
// npm install @circle-fin/x402-batching @x402/core @x402/evm viem express

import { createGatewayMiddleware } from '@circle-fin/x402-batching';

const gateway = createGatewayMiddleware({
  sellerAddress: "0xYOUR_WALLET_ADDRESS",
  facilitatorUrl: "https://gateway-api-testnet.circle.com",

  // ⚠️ Arc-specific: restrict to Arc chain only
  networks: ["eip155:5042002"],   // Arc Testnet Chain ID — CONFIRMED SUPPORTED
});

// Price individual routes
app.get("/oracle-data",  gateway.require("$0.001"), handleOracleData);
app.get("/analysis",     gateway.require("$0.05"),  handleAnalysis);
app.get("/liquidation",  gateway.require("$0.01"),  handleLiquidation);
```

```
IMPORTANT: Use settle() directly — do NOT call verify() then settle().
           Gateway's settle() is optimized for low latency + guarantees settlement.
```

### 8d. Agent Wallet Setup & Properties

```
Quickstart (via agent):
  curl -sL https://agents.circle.com/skills/setup.md
  → Installs Circle CLI + creates wallet + funds it automatically
```

| Property | Detail |
|---|---|
| Key management | 2-of-2 MPC — key shares NEVER exposed to the agent |
| Custody | User-controlled (not Circle-custodied) |
| Spending limits | Daily/monthly USDC transfer caps (time-bound) |
| Recipient controls | Allowlists + contract blocklists configurable |
| x402 limits | Per-wallet nanopayment caps |
| Supported assets | USDC, EURC, ERC20 tokens, ETH, MATIC |
| Gas | Gasless — Circle sponsors gas (capped, subject to change) |
| Compliance | Sanctions screening BEFORE every on-chain tx |
| Cross-chain | Multichain operations supported |

### 8e. Marketplace — Service Catalog

| Use case | Provider | Estimated cost |
|---|---|---|
| AI research (ArXiv aggregation) | 3P | ~$0.022 |
| Crypto analysis (BTC shorts / Hyperliquid) | 3P | ~$0.041 |
| Social analytics (X engagement) | 3P | ~$0.051 |
| Meeting prep (company/person profiles) | 3P | ~$0.102 |
| Domain availability search | 3P | ~$0.301 |
| Voice briefing via phone (Twilio/Bland.ai) | 3P | ~$5.553 |

Categories: `1P` = Circle first-party · `3P` = third-party
Full live table: agents.circle.com/services (JS-rendered, dynamic)

### 8f. Arc Lending Integration Points

```
Arc Lending  ←→  Circle Agent Stack: 4 integration points

① Liquidation bots as autonomous agents
   Bot has Agent Wallet (USDC on Arc) → calls price oracle via x402
   Pays $0.001/call, no API keys to manage, no subscription
   Arc is USDC-native → no bridge needed, 1 wallet for gas + payment

② Arc Lending endpoints → x402 Marketplace
   Register /health-factor, /oracle-price, /liquidation-queue as paid endpoints
   Other agents pay USDC to consume Arc Lending data
   networks: ["eip155:5042002"] restricts buyers to Arc chain

③ Coordinator Agent integration
   Coordinator already calls AI (Gemini) for liquidation decisions
   → Can use Agent Wallet for any paid data services it needs
   → Self-funded via USDC balance, no separate API key management

④ User-facing: "Agent Wallet" as Arc Lending wallet type
   Power users could deposit from Agent Wallet directly
   Spending policies = natural risk controls (daily limits)
```

### 8g. Rules for Arc Lending

```
RULE A — Arc eip155:5042002 IS supported
  Gateway middleware networks param accepts "eip155:5042002".
  Previous note that Arc was "unconfirmed" is WRONG — it is confirmed.
  Use this to restrict your x402 seller to Arc-only payments.

RULE B — Agent Wallet ≠ Regular EOA
  Spending policies enforced at wallet layer — contract calls cannot bypass.
  Sanctions screening fires BEFORE every tx → unexpected reverts possible.
  Build retry logic for sanction-screen failures.

RULE C — x402 is stateless per-call
  No session. No token refresh. Each request needs its own payment proof.
  Circuit breaker: if Agent Wallet runs out of USDC → all x402 calls fail.
  Monitor balance and alert when < threshold.

RULE D — Payment signatures expire
  validBefore must be ≥ 7 days in the future when signing.
  Gateway rejects signatures with shorter validity.
  Don't cache/reuse signatures — generate fresh per request.

RULE E — Gasless ≠ Free
  Gas fee = Circle-sponsored (free for agent).
  Service fee = USDC from Agent Wallet (not free).
  Agent needs funded USDC balance to operate.

RULE F — settle() not verify()+settle()
  In production: call gateway settle() directly.
  Never chain verify() → settle() — higher latency, same result.
```

---

## 9. QUICK DECISION TABLE (updated)

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
| Using CCTP bridge | TokenMessengerV2 `0x8FE6...` · Arc = Domain 26 · Fast (8-20s) or Standard (15min) |
| CCTP Fast Transfer | Set maxFee > 0 · poll Iris /v2/messages · threshold < 2000 |
| CCTP with hook | `depositForBurnWithHook()` · implement IMessageHandlerV2 on destination |
| Calling delegated calls | Use CallFrom precompile to preserve msg.sender |
| Building a liquidation bot | Agent Wallet + x402 oracle calls · Arc USDC = gas + payment in 1 token |
| Monetizing an Arc endpoint | `@circle-fin/x402-batching` · `networks: ["eip155:5042002"]` · settle() directly |
| Agent needs USDC on Arc | Arc is USDC-native — no bridge, gasless via Circle sponsorship |
| x402 payment signature | Must be valid ≥ 7 days · never reuse cached signatures |
| Setting up Agent Wallet | `curl -sL https://agents.circle.com/skills/setup.md` |

---

## 10. SOURCES

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
| CCTP overview | https://developers.circle.com/cctp |
| CCTP technical guide | https://developers.circle.com/cctp/references/technical-guide.md |
| CCTP contract addresses | https://developers.circle.com/cctp/references/contract-addresses.md |
| CCTP supported chains | https://developers.circle.com/cctp/concepts/supported-chains-and-domains.md |
| CCTP V1→V2 migration | https://developers.circle.com/cctp/migration-from-v1-to-v2.md |
| Iris attestation (testnet) | https://iris-api-sandbox.circle.com |
| Iris attestation (mainnet) | https://iris-api.circle.com |
| Aave risk documentation | https://aave.com/docs/resources/risks |
| Crypto security (Coinbase) | https://www.coinbase.com/learn/crypto-basics/how-to-secure-crypto |
| Phishing avoidance | https://help.coinbase.com/en/wallet/security/avoiding-crypto-scams |
| Circle Agent home | https://agents.circle.com |
| Circle Agent Marketplace | https://agents.circle.com/services |
| Circle Agent Stack docs | https://developers.circle.com/agent-stack |
| Agent Wallets | https://developers.circle.com/agent-stack/agent-wallets |
| x402 seller quickstart | https://developers.circle.com/gateway/nanopayments/quickstarts/seller |
| x402 npm package | https://www.npmjs.com/package/@circle-fin/x402-batching |
| Gateway API (testnet) | https://gateway-api-testnet.circle.com |
