# Arc Lending — Full Design Spec
**Date:** 2026-05-31
**Status:** Approved
**Chain:** Arc Testnet (Chain ID: 5042002)
**Language:** 100% English (code, comments, variables, commits)

---

## 1. Overview

Arc Lending is a decentralized lending and borrowing protocol running exclusively on Arc Testnet. Users supply USDC, EURC, or cirBTC as collateral and borrow USDC against it. Interest rates adjust dynamically based on pool utilization. Any wallet can liquidate undercollateralized positions.

**Not supported:** Ethereum mainnet, Sepolia, BSC, Polygon, or any chain other than Arc Testnet.

---

## 2. Tokens

| Token | Role | Decimals | Arc Testnet Address |
|---|---|---|---|
| USDC | Gas + supply + borrow asset | 6 | `0x3600000000000000000000000000000000000000` |
| EURC | Supply / collateral only | 6 | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC | Supply / collateral only | 8 (TBC via MCP) | TBC — deploy mock for testnet |

**Borrow asset:** USDC only.
**cirBTC testnet address** must be verified via Arc MCP before use.

---

## 3. Smart Contract Architecture

### 3.1 File Structure

```
contracts/
├── LendingPool.sol           — core entry point
├── PriceOracle.sol           — Chainlink wrapper with staleness guard
├── InterestRateStrategy.sol  — variable rate formula
├── libraries/
│   ├── ReserveLogic.sol      — interest accrual, index math
│   └── ValidationLogic.sol   — health factor, LTV checks
└── types/
    └── DataTypes.sol         — shared structs
```

### 3.2 DataTypes

```solidity
struct ReserveData {
    uint256 totalDeposited;
    uint256 totalBorrowed;
    uint128 liquidityIndex;      // scaled 1e27 (ray)
    uint128 borrowIndex;         // scaled 1e27 (ray)
    uint40  lastUpdateTimestamp;
    uint16  ltv;                 // basis points, e.g. 7000 = 70%
    uint16  liquidationThreshold;
    uint16  liquidationBonus;
    address tokenAddress;
    bool    active;
}

struct UserAccountData {
    uint256 totalCollateralUSD;
    uint256 totalDebtUSD;
    uint256 availableBorrowsUSD;
    uint256 healthFactor;        // scaled 1e18
}
```

### 3.3 LendingPool — Public Interface

```solidity
function deposit(address token, uint256 amount) external;
function withdraw(address token, uint256 amount) external;
function borrow(uint256 amount) external;
function repay(uint256 amount) external;
function liquidate(address borrower, address collateralToken, uint256 debtAmount) external;
function getAccountData(address user) external view returns (UserAccountData memory);
```

All state-changing functions: `nonReentrant` + `whenNotPaused`.

### 3.4 Interest Rate Model

```
utilizationRate  = totalBorrowed / totalDeposited

OPTIMAL_UTIL     = 80%   (8000 bps)
BASE_RATE        = 1%    (100 bps)
SLOPE_1          = 4%    (below optimal)
SLOPE_2          = 75%   (above optimal — steep to incentivize repayment)
RESERVE_FACTOR   = 10%   (protocol fee on interest)

if utilization <= OPTIMAL_UTIL:
    borrowRate = BASE_RATE + (utilization / OPTIMAL_UTIL) × SLOPE_1

if utilization > OPTIMAL_UTIL:
    borrowRate = BASE_RATE + SLOPE_1 + ((utilization - OPTIMAL_UTIL) / (1 - OPTIMAL_UTIL)) × SLOPE_2

supplyRate = borrowRate × utilizationRate × (1 - RESERVE_FACTOR)
```

All math uses ray (1e27) fixed-point arithmetic. No floating point.

### 3.5 LTV & Liquidation Parameters

| Token | LTV | Liquidation Threshold | Liquidation Bonus |
|---|---|---|---|
| cirBTC | 70% | 75% | 10% |
| EURC | 80% | 85% | 5% |
| USDC | 80% | 85% | 5% |

### 3.6 Health Factor

```
healthFactor = Σ(collateral_i_USD × liquidationThreshold_i) / totalDebtUSD

healthFactor >= 1.0  → safe
healthFactor <  1.0  → liquidatable
```

### 3.7 Liquidation Flow

1. Caller calls `liquidate(borrower, collateralToken, debtAmount)`
2. Contract verifies `healthFactor < 1e18`
3. Caller repays up to 50% of borrower's USDC debt
4. Borrower's `collateralToken` is transferred to caller at a discount (liquidation bonus)
5. `Liquidated(borrower, liquidator, collateralToken, debtRepaid, collateralSeized)` event emitted

### 3.8 Oracle — PriceOracle.sol

- Wraps Chainlink AggregatorV3 feeds for cirBTC/USD and EURC/USD
- USDC treated as $1.00 (no feed needed)
- Staleness guard: `require(block.timestamp - updatedAt <= 3600, StalePrice())`
- Sanity guard: `require(answer > 0, InvalidPrice())`
- Feed addresses verified via Arc MCP before deployment

### 3.9 Security Measures

| Attack Vector | Defense |
|---|---|
| Reentrancy | `ReentrancyGuard` on all state-changing functions |
| Flash loan price manipulation | Chainlink price feed (not spot DEX price) |
| Borrow over LTV | `ValidationLogic` reverts before state change |
| Liquidating healthy position | Health factor check, revert if `>= 1e18` |
| Stale price feed | Staleness check, revert if `> 3600s` |
| Integer overflow | Solidity `^0.8.20` built-in safe math |
| Precision loss | Ray (1e27) fixed-point throughout |
| Emergency exploit | `Pausable` — admin can freeze all actions |

Custom errors used throughout (no revert strings) for gas efficiency.

---

## 4. Frontend Architecture

### 4.1 Stack

```
Next.js 14 App Router + TypeScript
wagmi v2 + viem + RainbowKit
Tailwind CSS v4 + shadcn/ui
@circle-fin/app-kit + @circle-fin/adapter-viem-v2
```

### 4.2 Pages & Routes

| Route | Page | Description |
|---|---|---|
| `/` | Redirect → `/app` | |
| `/app` | Dashboard | 2-column supply/borrow layout |
| `/markets` | Markets | Pool stats table |
| `/profile` | Profile | Full user positions |

### 4.3 Dashboard (`/app`)

Two-column layout (50/50), max-width 1078px:

**Left column:**
- "Your Supplies" card — user's active supply positions with APY earned
- "Assets to Supply" table — cirBTC, EURC, USDC rows with APY + [Supply] button

**Right column:**
- "Your Borrows" card — active borrow positions with APY owed
- Borrow limit progress bar
- "Assets to Borrow" table — USDC row with APY + [Borrow] button

**Top:** Health Factor banner — visible only when user has open positions. Color: mint ≥1.5 / amber 1.0–1.5 / red <1.0.

### 4.4 Markets (`/markets`)

Stats bar: Total Market Size, Total Borrowed, Total Suppliers.

Table columns: Asset · Total Supplied · Supply APY · Total Borrowed · Borrow APY · [Details].

Details links to an expanded view of that asset's pool parameters (LTV, liquidation threshold, utilization curve).

### 4.5 Profile (`/profile`)

- Account summary: Net Worth (USD), Health Factor badge, Borrow Limit Used %
- Supplied Positions table: token · amount · USD value · APY · [Withdraw]
- Borrowed Positions table: USDC amount · USD value · APY · [Repay]

### 4.6 Supply/Borrow Modal

Triggered by [Supply], [Borrow], [Repay], [Withdraw] buttons.

Contents:
- Token + action title
- Amount input with [MAX] button
- Wallet balance display
- Transaction overview: APY, collateral status, health factor impact (before → after)
- Primary action button (pill, ghost style)
- Real-time health factor recalculation as user types

### 4.7 Wallet & Chain Guard

- RainbowKit with `chains={[arcTestnet]}` — single chain only
- If connected to wrong chain: full-screen overlay "Switch to Arc Testnet" — no app access
- If wallet not connected: connect prompt, no read-only mode

### 4.8 wagmi Hooks

```
useReadContract   → getAccountData, getReserveData, getHealthFactor
useWriteContract  → deposit, borrow, repay, liquidate, withdraw
useWatchContractEvent → listen for Deposit, Borrow, Repay, Liquidated events
```

All writes handle `isPending`, `isError`, `error` states. Revert reasons decoded via `viem.decodeErrorResult`.

---

## 5. Design System (monopo saigon — 100% adherence)

Full spec in `docs/design.md`. Key rules:

- Background: `#000000` only
- Text: `#ffffff` primary, `#6d6d6d` secondary
- Gradient: `linear-gradient(90deg, rgb(160,224,171), rgb(255,172,46) 50%, rgb(165,45,37))`
- Buttons: `border-radius: 75.024px` — always pill
- Cards: `backdrop-filter: blur(20px)` + `rgba(255,255,255,0.04)` bg
- Depth via gradient/blur — zero `box-shadow`
- Font: Roobert (primary), Raleway (alt heading)
- Max-width: 1078px, card-padding: 34px, element-gap: 14px
- Semantic: mint = healthy/positive, amber = warning/pending, red = danger/liquidation

---

## 6. Testing Strategy

### 6.1 Build Order (tests written before implementation)

```
1. DataTypes.sol             — structs only, no test needed
2. ValidationLogic.sol       — unit test pure math
3. ReserveLogic.sol          — unit test interest accrual
4. InterestRateStrategy.sol  — unit test rate formula
5. PriceOracle.sol           — unit test with mock Chainlink aggregator
6. LendingPool.sol           — integration test full flows
7. Fork tests                — Chainlink feeds on live Arc Testnet RPC
── all tests green ──
8. Frontend
```

### 6.2 Required Test Coverage

**ValidationLogic**
- Health factor calculation at various collateral/debt ratios
- LTV enforcement — revert on exceed
- Liquidation threshold check

**ReserveLogic**
- Interest accrual over time
- Index update correctness
- No precision loss on small amounts

**InterestRateStrategy**
- utilization = 0 → rate = BASE_RATE
- utilization = OPTIMAL (80%) → rate at kink
- utilization = 100% → rate = max
- Supply rate = borrow rate × utilization × (1 - reserve factor)

**PriceOracle**
- Returns correct Chainlink price
- Reverts on `answer <= 0`
- Reverts if `updatedAt` older than 3600s

**LendingPool — Happy paths**
- deposit → balance increases, index updates
- borrow → debt recorded, health factor correct
- repay full → debt cleared
- withdraw → reverts if health factor would drop below 1

**LendingPool — Attack vectors**
- Reentrancy on deposit → blocked
- Reentrancy on borrow → blocked
- Borrow exceeding LTV → revert
- Liquidate healthy position → revert
- Liquidate unhealthy → borrower loses collateral, liquidator gains bonus
- Stale oracle price → revert all actions
- Zero amount deposit/borrow → revert
- Deposit unsupported token → revert

### 6.3 Coverage Target

Minimum **95% line coverage** via `solidity-coverage`.
Slither static analysis: zero HIGH or MEDIUM unresolved findings before deploy.

---

## 7. File & Folder Structure

```
f:/Arc Lending/
├── contracts/
│   ├── LendingPool.sol
│   ├── PriceOracle.sol
│   ├── InterestRateStrategy.sol
│   ├── libraries/
│   │   ├── ReserveLogic.sol
│   │   └── ValidationLogic.sol
│   └── types/
│       └── DataTypes.sol
├── test/
│   ├── unit/
│   │   ├── ValidationLogic.test.ts
│   │   ├── ReserveLogic.test.ts
│   │   ├── InterestRateStrategy.test.ts
│   │   └── PriceOracle.test.ts
│   ├── integration/
│   │   └── LendingPool.test.ts
│   └── fork/
│       └── LendingPool.fork.test.ts
├── src/
│   ├── app/
│   │   ├── app/page.tsx          — Dashboard
│   │   ├── markets/page.tsx      — Markets
│   │   ├── profile/page.tsx      — Profile
│   │   └── layout.tsx
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── SupplyPanel.tsx
│   │   │   ├── BorrowPanel.tsx
│   │   │   └── HealthFactorBanner.tsx
│   │   ├── modals/
│   │   │   ├── SupplyModal.tsx
│   │   │   ├── BorrowModal.tsx
│   │   │   ├── RepayModal.tsx
│   │   │   └── WithdrawModal.tsx
│   │   ├── markets/
│   │   │   └── MarketsTable.tsx
│   │   └── shared/
│   │       ├── Navbar.tsx
│   │       ├── ChainGuard.tsx
│   │       └── TokenIcon.tsx
│   ├── hooks/
│   │   ├── use-account-data.ts
│   │   ├── use-reserve-data.ts
│   │   ├── use-supply.ts
│   │   ├── use-borrow.ts
│   │   ├── use-repay.ts
│   │   └── use-withdraw.ts
│   └── lib/
│       ├── format.ts             — format USD, APY, health factor
│       └── health-factor.ts      — client-side HF preview calc
├── config/
│   ├── networks.ts
│   ├── contracts.ts
│   └── index.ts
├── docs/
│   ├── design.md
│   ├── arc-network-graph.md
│   └── superpowers/specs/
│       └── 2026-05-31-arc-lending-design.md
├── hardhat.config.ts
├── package.json
└── CLAUDE.md
```

---

## 8. Deployment Checklist

- [ ] All unit tests green (≥95% coverage)
- [ ] All integration tests green
- [ ] Slither: zero HIGH/MEDIUM findings
- [ ] PriceOracle feed addresses verified via Arc MCP
- [ ] cirBTC testnet address confirmed via Arc MCP
- [ ] `.env.local` configured (RPC URL, deployer private key)
- [ ] Deploy PriceOracle → log address
- [ ] Deploy InterestRateStrategy → log address
- [ ] Deploy LendingPool(priceOracle, interestRateStrategy) → log address
- [ ] Call `initReserve` for USDC, EURC, cirBTC
- [ ] Update `config/contracts.ts` with deployed addresses
- [ ] Smoke test on Arc Testnet via ArcScan
