# Arc Lending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a decentralized lending/borrowing protocol on Arc Testnet supporting USDC, EURC, cirBTC collateral with USDC-only borrowing, variable interest rates, and open liquidations.

**Architecture:** Monolithic LendingPool contract with separate PriceOracle and InterestRateStrategy, backed by ReserveLogic and ValidationLogic libraries. Frontend is Next.js App Router with wagmi v2 locked to Arc Testnet only.

**Tech Stack:** Solidity ^0.8.20, Hardhat, TypeScript, Next.js 14 App Router, wagmi v2, viem, RainbowKit, Tailwind CSS v4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-05-31-arc-lending-design.md`
**Design:** `docs/design.md` — 100% adherence required

---

## File Map

```
contracts/
  types/DataTypes.sol              — shared structs
  libraries/ValidationLogic.sol    — pure health factor & LTV math
  libraries/ReserveLogic.sol       — interest accrual & index math
  InterestRateStrategy.sol         — variable rate formula
  PriceOracle.sol                  — Chainlink wrapper + staleness guard
  LendingPool.sol                  — core entry point
  mocks/MockERC20.sol              — test token (cirBTC, EURC on testnet)
  mocks/MockAggregator.sol         — fake Chainlink feed for tests

test/
  unit/ValidationLogic.test.ts
  unit/ReserveLogic.test.ts
  unit/InterestRateStrategy.test.ts
  unit/PriceOracle.test.ts
  integration/LendingPool.test.ts

src/
  app/
    layout.tsx
    page.tsx                       — redirect to /app
    app/page.tsx                   — Dashboard
    markets/page.tsx               — Markets
    profile/page.tsx               — Profile
  components/
    shared/Navbar.tsx
    shared/ChainGuard.tsx
    shared/TokenIcon.tsx
    dashboard/HealthFactorBanner.tsx
    dashboard/SupplyPanel.tsx
    dashboard/BorrowPanel.tsx
    modals/SupplyModal.tsx
    modals/BorrowModal.tsx
    modals/RepayModal.tsx
    modals/WithdrawModal.tsx
    markets/MarketsTable.tsx
    profile/PositionsTable.tsx
  hooks/
    use-account-data.ts
    use-reserve-data.ts
    use-supply.ts
    use-borrow.ts
    use-repay.ts
    use-withdraw.ts
  lib/
    format.ts
    health-factor.ts
  providers/
    Web3Provider.tsx

config/
  networks.ts                      — arcTestnet chain definition
  contracts.ts                     — all deployed addresses
  index.ts

hardhat.config.ts
package.json
tailwind.config.ts
globals.css
```

---

## PHASE 1 — PROJECT SETUP

---

### Task 1: Initialize monorepo structure

**Files:**
- Create: `package.json`
- Create: `hardhat.config.ts`
- Create: `tsconfig.json`
- Create: `.env.local` (gitignored)

- [ ] **Step 1: Initialize Next.js app**

```bash
cd "f:/Arc Lending"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-git --yes
```

Expected: Next.js project scaffolded in current directory.

- [ ] **Step 2: Install contract dependencies**

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @nomicfoundation/hardhat-viem viem
npm install @openzeppelin/contracts
```

- [ ] **Step 3: Install frontend dependencies**

```bash
npm install wagmi viem @rainbow-me/rainbowkit @tanstack/react-query
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2
```

- [ ] **Step 4: Initialize Hardhat**

```bash
npx hardhat init
```
Select: "Create a TypeScript project". Accept all defaults.

- [ ] **Step 5: Write `hardhat.config.ts`**

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-viem";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    arc: {
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts",
  },
};

export default config;
```

- [ ] **Step 6: Create `.env.local`**

```
DEPLOYER_PRIVATE_KEY=
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_LENDING_POOL_ADDRESS=
NEXT_PUBLIC_PRICE_ORACLE_ADDRESS=
```

- [ ] **Step 7: Commit**

```bash
git init
git add hardhat.config.ts package.json tsconfig.json .env.example
git commit -m "chore: initialize Arc Lending project"
```

---

### Task 2: Design tokens & Tailwind config

**Files:**
- Modify: `src/app/globals.css`
- Create: `tailwind.config.ts`

- [ ] **Step 1: Write `globals.css` with full design token set**

```css
@import "tailwindcss";

@theme {
  --color-midnight-canvas: #000000;
  --color-frost-white: #ffffff;
  --color-deep-shadow: #181818;
  --color-whisper-gray: #6d6d6d;
  --color-misty-gray: #636363;
  --color-arc-mint: rgb(160, 224, 171);
  --color-arc-amber: rgb(255, 172, 46);
  --color-arc-red: rgb(165, 45, 37);

  --font-roobert: 'Roobert', system-ui, sans-serif;
  --font-raleway: 'Raleway', system-ui, sans-serif;

  --text-caption: 11px;
  --text-body: 16px;
  --text-subheading: 18px;
  --text-heading-sm: 29px;
  --text-heading: 39px;
  --text-heading-lg: 54px;

  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-28: 28px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;

  --radius-card: 10px;
  --radius-button: 75.024px;
}

body {
  background-color: #000000;
  color: #ffffff;
  font-family: var(--font-roobert);
}

/* Frosted glass card utility */
.glass-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* Deep ocean gradient */
.gradient-ocean {
  background: linear-gradient(
    90deg,
    rgb(160, 224, 171),
    rgb(255, 172, 46) 50%,
    rgb(165, 45, 37)
  );
}
```

- [ ] **Step 2: Verify Tailwind picks up config**

```bash
npm run dev
```

Open `http://localhost:3000` — background should be black.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css tailwind.config.ts
git commit -m "chore: add design tokens from monopo saigon system"
```

---

## PHASE 2 — SMART CONTRACTS (TDD)

---

### Task 3: DataTypes.sol

**Files:**
- Create: `contracts/types/DataTypes.sol`

- [ ] **Step 1: Write DataTypes.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library DataTypes {
    struct ReserveData {
        uint256 totalDeposited;
        uint256 totalBorrowed;
        uint128 liquidityIndex;
        uint128 borrowIndex;
        uint40  lastUpdateTimestamp;
        uint16  ltv;
        uint16  liquidationThreshold;
        uint16  liquidationBonus;
        address tokenAddress;
        bool    active;
    }

    struct UserAccountData {
        uint256 totalCollateralUSD;
        uint256 totalDebtUSD;
        uint256 availableBorrowsUSD;
        uint256 healthFactor;
    }

    struct UserPosition {
        uint256 deposited;
        uint256 scaledBorrowBalance;
    }
}
```

- [ ] **Step 2: Compile to verify no errors**

```bash
npx hardhat compile
```

Expected: `Compiled 1 Solidity file successfully`

- [ ] **Step 3: Commit**

```bash
git add contracts/types/DataTypes.sol
git commit -m "feat(contract): add DataTypes library"
```

---

### Task 4: ValidationLogic.sol — TDD

**Files:**
- Create: `contracts/libraries/ValidationLogic.sol`
- Create: `test/unit/ValidationLogic.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/unit/ValidationLogic.test.ts
import { expect } from "chai";
import hre from "hardhat";

describe("ValidationLogic", () => {
  const RAY = 10n ** 27n;
  const BPS = 10000n;

  describe("calculateHealthFactor", () => {
    it("returns max uint256 when debt is zero", async () => {
      const { validationLogic } = await deployFixture();
      const hf = await validationLogic.read.calculateHealthFactor([
        1000n * RAY,
        0n,
        8500n,
      ]);
      expect(hf).to.equal(2n ** 256n - 1n);
    });

    it("returns 1e18 when collateral exactly covers debt at threshold", async () => {
      const { validationLogic } = await deployFixture();
      // collateral $1000, threshold 100%, debt $1000
      const hf = await validationLogic.read.calculateHealthFactor([
        1000n * RAY,
        1000n * RAY,
        10000n,
      ]);
      expect(hf).to.equal(10n ** 18n);
    });

    it("returns below 1e18 when undercollateralized", async () => {
      const { validationLogic } = await deployFixture();
      const hf = await validationLogic.read.calculateHealthFactor([
        500n * RAY,
        1000n * RAY,
        10000n,
      ]);
      expect(hf).to.be.lessThan(10n ** 18n);
    });
  });

  describe("validateBorrow", () => {
    it("reverts when borrow would exceed LTV", async () => {
      const { validationLogic } = await deployFixture();
      await expect(
        validationLogic.simulate.validateBorrow([
          1000n * RAY, // collateral $1000
          900n * RAY,  // existing debt $900
          100n * RAY,  // borrow $100 more → total $1000 > LTV 70%
          7000n,       // LTV 70%
        ])
      ).to.be.rejectedWith("ExceedsLTV");
    });

    it("succeeds when borrow is within LTV", async () => {
      const { validationLogic } = await deployFixture();
      await expect(
        validationLogic.simulate.validateBorrow([
          1000n * RAY,
          0n,
          500n * RAY,  // $500 borrow against $1000 collateral at 70% LTV = ok
          7000n,
        ])
      ).to.not.be.rejected;
    });
  });

  async function deployFixture() {
    const validationLogic = await hre.viem.deployContract("ValidationLogicHarness");
    return { validationLogic };
  }
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx hardhat test test/unit/ValidationLogic.test.ts
```

Expected: FAIL — `ValidationLogicHarness` not found.

- [ ] **Step 3: Write ValidationLogic.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library ValidationLogic {
    uint256 internal constant RAY = 1e27;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS_BASE = 10_000;

    error ExceedsLTV();
    error HealthFactorTooLow();
    error PositionHealthy();
    error ZeroAmount();
    error ReserveInactive();

    function calculateHealthFactor(
        uint256 totalCollateralRay,
        uint256 totalDebtRay,
        uint256 liquidationThresholdBps
    ) internal pure returns (uint256) {
        if (totalDebtRay == 0) return type(uint256).max;
        return (totalCollateralRay * liquidationThresholdBps * WAD)
            / (totalDebtRay * BPS_BASE);
    }

    function validateBorrow(
        uint256 totalCollateralRay,
        uint256 existingDebtRay,
        uint256 borrowAmountRay,
        uint256 ltvBps
    ) internal pure {
        uint256 newDebt = existingDebtRay + borrowAmountRay;
        uint256 maxBorrow = (totalCollateralRay * ltvBps) / BPS_BASE;
        if (newDebt > maxBorrow) revert ExceedsLTV();
    }

    function validateWithdraw(
        uint256 totalCollateralRay,
        uint256 withdrawAmountRay,
        uint256 totalDebtRay,
        uint256 liquidationThresholdBps
    ) internal pure {
        if (totalDebtRay == 0) return;
        uint256 newCollateral = totalCollateralRay - withdrawAmountRay;
        uint256 hf = calculateHealthFactor(
            newCollateral,
            totalDebtRay,
            liquidationThresholdBps
        );
        if (hf < WAD) revert HealthFactorTooLow();
    }

    function validateLiquidation(uint256 healthFactor) internal pure {
        if (healthFactor >= WAD) revert PositionHealthy();
    }
}
```

- [ ] **Step 4: Write ValidationLogicHarness test contract**

```solidity
// contracts/mocks/ValidationLogicHarness.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/ValidationLogic.sol";

contract ValidationLogicHarness {
    function calculateHealthFactor(
        uint256 collateral,
        uint256 debt,
        uint256 threshold
    ) external pure returns (uint256) {
        return ValidationLogic.calculateHealthFactor(collateral, debt, threshold);
    }

    function validateBorrow(
        uint256 collateral,
        uint256 existingDebt,
        uint256 borrowAmount,
        uint256 ltv
    ) external pure {
        ValidationLogic.validateBorrow(collateral, existingDebt, borrowAmount, ltv);
    }

    function validateWithdraw(
        uint256 collateral,
        uint256 withdrawAmount,
        uint256 debt,
        uint256 threshold
    ) external pure {
        ValidationLogic.validateWithdraw(collateral, withdrawAmount, debt, threshold);
    }
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npx hardhat test test/unit/ValidationLogic.test.ts
```

Expected: `4 passing`

- [ ] **Step 6: Commit**

```bash
git add contracts/libraries/ValidationLogic.sol contracts/mocks/ValidationLogicHarness.sol test/unit/ValidationLogic.test.ts
git commit -m "feat(contract): add ValidationLogic with health factor and LTV checks"
```

---

### Task 5: InterestRateStrategy.sol — TDD

**Files:**
- Create: `contracts/InterestRateStrategy.sol`
- Create: `test/unit/InterestRateStrategy.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/InterestRateStrategy.test.ts
import { expect } from "chai";
import hre from "hardhat";

describe("InterestRateStrategy", () => {
  const RAY = 10n ** 27n;

  async function deploy() {
    const strategy = await hre.viem.deployContract("InterestRateStrategy");
    return { strategy };
  }

  it("returns BASE_RATE when utilization is zero", async () => {
    const { strategy } = await deploy();
    const { borrowRate } = await strategy.read.calculateRates([0n, 0n]);
    expect(borrowRate).to.equal(RAY / 100n); // 1% in ray
  });

  it("returns kink rate at optimal utilization (80%)", async () => {
    const { strategy } = await deploy();
    const total = 1000n * RAY;
    const borrowed = 800n * RAY; // 80% utilization
    const { borrowRate } = await strategy.read.calculateRates([total, borrowed]);
    // BASE_RATE(1%) + SLOPE_1(4%) = 5% at optimal
    const expected = (5n * RAY) / 100n;
    expect(borrowRate).to.be.closeTo(expected, RAY / 1000n);
  });

  it("supply rate equals borrow rate * utilization * (1 - reserve factor)", async () => {
    const { strategy } = await deploy();
    const total = 1000n * RAY;
    const borrowed = 500n * RAY;
    const { borrowRate, supplyRate } = await strategy.read.calculateRates([total, borrowed]);
    const utilization = (borrowed * RAY) / total;
    const reserveFactor = RAY / 10n; // 10%
    const expectedSupply = (borrowRate * utilization * (RAY - reserveFactor)) / (RAY * RAY);
    expect(supplyRate).to.be.closeTo(expectedSupply, RAY / 10000n);
  });

  it("jumps steeply above optimal utilization", async () => {
    const { strategy } = await deploy();
    const { borrowRate: rateAt80 } = await strategy.read.calculateRates([
      1000n * RAY, 800n * RAY,
    ]);
    const { borrowRate: rateAt90 } = await strategy.read.calculateRates([
      1000n * RAY, 900n * RAY,
    ]);
    expect(rateAt90).to.be.greaterThan(rateAt80 * 2n);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx hardhat test test/unit/InterestRateStrategy.test.ts
```

Expected: FAIL — contract not found.

- [ ] **Step 3: Write InterestRateStrategy.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract InterestRateStrategy {
    uint256 public constant RAY            = 1e27;
    uint256 public constant OPTIMAL_UTIL   = 0.80e27;
    uint256 public constant BASE_RATE      = 0.01e27;
    uint256 public constant SLOPE_1        = 0.04e27;
    uint256 public constant SLOPE_2        = 0.75e27;
    uint256 public constant RESERVE_FACTOR = 0.10e27;

    struct Rates {
        uint256 borrowRate;
        uint256 supplyRate;
    }

    function calculateRates(
        uint256 totalDeposited,
        uint256 totalBorrowed
    ) external pure returns (uint256 borrowRate, uint256 supplyRate) {
        if (totalDeposited == 0) {
            return (BASE_RATE, 0);
        }

        uint256 utilization = (totalBorrowed * RAY) / totalDeposited;

        if (utilization <= OPTIMAL_UTIL) {
            borrowRate = BASE_RATE + (utilization * SLOPE_1) / OPTIMAL_UTIL;
        } else {
            uint256 excess = utilization - OPTIMAL_UTIL;
            uint256 range  = RAY - OPTIMAL_UTIL;
            borrowRate = BASE_RATE + SLOPE_1 + (excess * SLOPE_2) / range;
        }

        supplyRate =
            (borrowRate * utilization / RAY) *
            (RAY - RESERVE_FACTOR) / RAY;
    }
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npx hardhat test test/unit/InterestRateStrategy.test.ts
```

Expected: `4 passing`

- [ ] **Step 5: Commit**

```bash
git add contracts/InterestRateStrategy.sol test/unit/InterestRateStrategy.test.ts
git commit -m "feat(contract): add variable interest rate strategy with EWMA kink model"
```

---

### Task 6: ReserveLogic.sol — TDD

**Files:**
- Create: `contracts/libraries/ReserveLogic.sol`
- Create: `contracts/mocks/ReserveLogicHarness.sol`
- Create: `test/unit/ReserveLogic.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/ReserveLogic.test.ts
import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ReserveLogic", () => {
  const RAY = 10n ** 27n;

  async function deploy() {
    const harness = await hre.viem.deployContract("ReserveLogicHarness");
    return { harness };
  }

  it("index starts at RAY (1.0)", async () => {
    const { harness } = await deploy();
    const index = await harness.read.initialIndex();
    expect(index).to.equal(RAY);
  });

  it("index increases after time passes with non-zero borrow rate", async () => {
    const { harness } = await deploy();
    await harness.write.setRate([RAY / 10n]); // 10% rate
    const before = await harness.read.getBorrowIndex();
    await time.increase(365 * 24 * 60 * 60); // 1 year
    await harness.write.accrueInterest();
    const after = await harness.read.getBorrowIndex();
    expect(after).to.be.greaterThan(before);
  });

  it("index does not change when rate is zero", async () => {
    const { harness } = await deploy();
    await harness.write.setRate([0n]);
    const before = await harness.read.getBorrowIndex();
    await time.increase(365 * 24 * 60 * 60);
    await harness.write.accrueInterest();
    const after = await harness.read.getBorrowIndex();
    expect(after).to.equal(before);
  });

  it("scales depositor balance by liquidity index", async () => {
    const { harness } = await deploy();
    const scaled = await harness.read.scaleDeposit([1000n * RAY, RAY]);
    expect(scaled).to.equal(1000n * RAY);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx hardhat test test/unit/ReserveLogic.test.ts
```

- [ ] **Step 3: Write ReserveLogic.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../types/DataTypes.sol";

library ReserveLogic {
    uint256 internal constant RAY            = 1e27;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    function updateIndexes(
        DataTypes.ReserveData storage reserve,
        uint256 liquidityRate,
        uint256 borrowRate
    ) internal {
        uint256 delta = block.timestamp - reserve.lastUpdateTimestamp;
        if (delta == 0) return;

        if (borrowRate > 0 && reserve.totalBorrowed > 0) {
            uint256 borrowAccumulated = (borrowRate * delta) / SECONDS_PER_YEAR;
            reserve.borrowIndex = uint128(
                uint256(reserve.borrowIndex) + (uint256(reserve.borrowIndex) * borrowAccumulated) / RAY
            );
        }

        if (liquidityRate > 0 && reserve.totalDeposited > 0) {
            uint256 liquidityAccumulated = (liquidityRate * delta) / SECONDS_PER_YEAR;
            reserve.liquidityIndex = uint128(
                uint256(reserve.liquidityIndex) + (uint256(reserve.liquidityIndex) * liquidityAccumulated) / RAY
            );
        }

        reserve.lastUpdateTimestamp = uint40(block.timestamp);
    }

    function scaleDeposit(
        uint256 amount,
        uint256 liquidityIndex
    ) internal pure returns (uint256) {
        return (amount * RAY) / liquidityIndex;
    }

    function unscaleDeposit(
        uint256 scaledAmount,
        uint256 liquidityIndex
    ) internal pure returns (uint256) {
        return (scaledAmount * liquidityIndex) / RAY;
    }

    function scaleBorrow(
        uint256 amount,
        uint256 borrowIndex
    ) internal pure returns (uint256) {
        return (amount * RAY) / borrowIndex;
    }

    function unscaleBorrow(
        uint256 scaledAmount,
        uint256 borrowIndex
    ) internal pure returns (uint256) {
        return (scaledAmount * borrowIndex) / RAY;
    }
}
```

- [ ] **Step 4: Write ReserveLogicHarness.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/ReserveLogic.sol";
import "../types/DataTypes.sol";

contract ReserveLogicHarness {
    using ReserveLogic for DataTypes.ReserveData;

    DataTypes.ReserveData public reserve;
    uint256 public currentBorrowRate;
    uint256 public currentLiquidityRate;

    uint256 public constant RAY = 1e27;

    constructor() {
        reserve.liquidityIndex = uint128(RAY);
        reserve.borrowIndex    = uint128(RAY);
        reserve.lastUpdateTimestamp = uint40(block.timestamp);
    }

    function initialIndex() external pure returns (uint256) { return RAY; }

    function setRate(uint256 rate) external { currentBorrowRate = rate; }

    function accrueInterest() external {
        reserve.updateIndexes(currentLiquidityRate, currentBorrowRate);
    }

    function getBorrowIndex() external view returns (uint256) {
        return reserve.borrowIndex;
    }

    function scaleDeposit(uint256 amount, uint256 index) external pure returns (uint256) {
        return ReserveLogic.scaleDeposit(amount, index);
    }
}
```

- [ ] **Step 5: Run — verify PASS**

```bash
npx hardhat test test/unit/ReserveLogic.test.ts
```

Expected: `4 passing`

- [ ] **Step 6: Commit**

```bash
git add contracts/libraries/ReserveLogic.sol contracts/mocks/ReserveLogicHarness.sol test/unit/ReserveLogic.test.ts
git commit -m "feat(contract): add ReserveLogic interest accrual and index scaling"
```

---

### Task 7: Mock contracts for testing

**Files:**
- Create: `contracts/mocks/MockERC20.sol`
- Create: `contracts/mocks/MockAggregator.sol`

- [ ] **Step 1: Write MockERC20.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimalsValue
    ) ERC20(name, symbol) {
        _decimals = decimalsValue;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

- [ ] **Step 2: Write MockAggregator.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockAggregator {
    int256 private _answer;
    uint256 private _updatedAt;
    uint8 public decimals = 8;

    constructor(int256 initialAnswer) {
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, _answer, block.timestamp, _updatedAt, 1);
    }

    function setAnswer(int256 answer) external {
        _answer = answer;
        _updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 ts) external {
        _updatedAt = ts;
    }
}
```

- [ ] **Step 3: Compile**

```bash
npx hardhat compile
```

Expected: `Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add contracts/mocks/MockERC20.sol contracts/mocks/MockAggregator.sol
git commit -m "feat(contract): add mock ERC20 and Chainlink aggregator for testing"
```

---

### Task 8: PriceOracle.sol — TDD

**Files:**
- Create: `contracts/PriceOracle.sol`
- Create: `test/unit/PriceOracle.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/PriceOracle.test.ts
import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits } from "viem";

describe("PriceOracle", () => {
  const BTC_PRICE  = parseUnits("65000", 8); // $65,000
  const EURC_PRICE = parseUnits("1.08", 8);  // $1.08
  const RAY        = 10n ** 27n;

  async function deploy() {
    const [owner] = await hre.viem.getWalletClients();
    const btcFeed  = await hre.viem.deployContract("MockAggregator", [BTC_PRICE]);
    const eurcFeed = await hre.viem.deployContract("MockAggregator", [EURC_PRICE]);
    const usdc     = await hre.viem.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const cirBtc   = await hre.viem.deployContract("MockERC20", ["Circle BTC", "cirBTC", 8]);
    const eurc     = await hre.viem.deployContract("MockERC20", ["Euro Coin", "EURC", 6]);

    const oracle = await hre.viem.deployContract("PriceOracle", [usdc.address]);
    await oracle.write.setFeed([cirBtc.address, btcFeed.address]);
    await oracle.write.setFeed([eurc.address, eurcFeed.address]);

    return { oracle, usdc, cirBtc, eurc, btcFeed, eurcFeed };
  }

  it("returns 1e8 for USDC (treated as $1)", async () => {
    const { oracle, usdc } = await deploy();
    const price = await oracle.read.getPrice([usdc.address]);
    expect(price).to.equal(1n * 10n ** 8n);
  });

  it("returns correct cirBTC price from Chainlink", async () => {
    const { oracle, cirBtc } = await deploy();
    const price = await oracle.read.getPrice([cirBtc.address]);
    expect(price).to.equal(BTC_PRICE);
  });

  it("reverts on stale price feed (>3600s old)", async () => {
    const { oracle, cirBtc, btcFeed } = await deploy();
    await btcFeed.write.setUpdatedAt([BigInt(await time.latest()) - 3700n]);
    await expect(oracle.read.getPrice([cirBtc.address]))
      .to.be.rejectedWith("StalePrice");
  });

  it("reverts on zero or negative price", async () => {
    const { oracle, cirBtc, btcFeed } = await deploy();
    await btcFeed.write.setAnswer([0n]);
    await expect(oracle.read.getPrice([cirBtc.address]))
      .to.be.rejectedWith("InvalidPrice");
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx hardhat test test/unit/PriceOracle.test.ts
```

- [ ] **Step 3: Write PriceOracle.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAggregatorV3 {
    function latestRoundData() external view returns (
        uint80, int256 answer, uint256, uint256 updatedAt, uint80
    );
    function decimals() external view returns (uint8);
}

contract PriceOracle {
    uint256 public constant MAX_STALENESS = 3600;
    uint256 public constant PRICE_DECIMALS = 8;

    error StalePrice();
    error InvalidPrice();
    error FeedNotSet();

    address public immutable usdcAddress;
    address public owner;
    mapping(address => address) public feeds;

    constructor(address _usdcAddress) {
        usdcAddress = _usdcAddress;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function setFeed(address token, address feed) external onlyOwner {
        feeds[token] = feed;
    }

    function getPrice(address token) external view returns (uint256) {
        if (token == usdcAddress) return 10 ** PRICE_DECIMALS;

        address feed = feeds[token];
        if (feed == address(0)) revert FeedNotSet();

        (, int256 answer, , uint256 updatedAt, ) =
            IAggregatorV3(feed).latestRoundData();

        if (block.timestamp - updatedAt > MAX_STALENESS) revert StalePrice();
        if (answer <= 0) revert InvalidPrice();

        return uint256(answer);
    }

    function getValueUSD(
        address token,
        uint256 amount,
        uint8 tokenDecimals
    ) external view returns (uint256) {
        uint256 price = this.getPrice(token);
        return (amount * price) / (10 ** tokenDecimals);
    }
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npx hardhat test test/unit/PriceOracle.test.ts
```

Expected: `4 passing`

- [ ] **Step 5: Commit**

```bash
git add contracts/PriceOracle.sol test/unit/PriceOracle.test.ts
git commit -m "feat(contract): add PriceOracle with Chainlink feeds and staleness guard"
```

---

### Task 9: LendingPool.sol — core contract

**Files:**
- Create: `contracts/LendingPool.sol`

- [ ] **Step 1: Write LendingPool.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./types/DataTypes.sol";
import "./libraries/ReserveLogic.sol";
import "./libraries/ValidationLogic.sol";
import "./InterestRateStrategy.sol";
import "./PriceOracle.sol";

contract LendingPool is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ReserveLogic for DataTypes.ReserveData;

    uint256 public constant RAY     = 1e27;
    uint256 public constant WAD     = 1e18;
    uint256 public constant BPS_BASE = 10_000;
    uint256 public constant MAX_CLOSE_FACTOR = 5000; // 50%

    error ZeroAmount();
    error ReserveInactive();
    error InsufficientLiquidity();
    error NotEnoughDeposited();

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        address indexed collateralToken,
        uint256 debtRepaid,
        uint256 collateralSeized
    );

    address public owner;
    PriceOracle public immutable oracle;
    InterestRateStrategy public immutable rateStrategy;
    address public immutable usdcAddress;

    address[] public reserveList;
    mapping(address => DataTypes.ReserveData) public reserves;
    mapping(address => mapping(address => DataTypes.UserPosition)) public positions;
    mapping(address => uint256) public scaledBorrows;

    constructor(address _oracle, address _rateStrategy, address _usdc) {
        owner = msg.sender;
        oracle = PriceOracle(_oracle);
        rateStrategy = InterestRateStrategy(_rateStrategy);
        usdcAddress = _usdc;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function initReserve(
        address token,
        uint16 ltv,
        uint16 liquidationThreshold,
        uint16 liquidationBonus
    ) external onlyOwner {
        DataTypes.ReserveData storage reserve = reserves[token];
        reserve.tokenAddress         = token;
        reserve.ltv                  = ltv;
        reserve.liquidationThreshold = liquidationThreshold;
        reserve.liquidationBonus     = liquidationBonus;
        reserve.liquidityIndex       = uint128(RAY);
        reserve.borrowIndex          = uint128(RAY);
        reserve.lastUpdateTimestamp  = uint40(block.timestamp);
        reserve.active               = true;
        reserveList.push(token);
    }

    function deposit(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        DataTypes.ReserveData storage reserve = reserves[token];
        if (!reserve.active) revert ReserveInactive();

        _updateReserve(token);

        uint256 scaledAmount = ReserveLogic.scaleDeposit(amount, reserve.liquidityIndex);
        positions[msg.sender][token].deposited += scaledAmount;
        reserve.totalDeposited += amount;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        DataTypes.ReserveData storage reserve = reserves[token];

        _updateReserve(token);

        uint256 scaledAmount = ReserveLogic.scaleDeposit(amount, reserve.liquidityIndex);
        if (positions[msg.sender][token].deposited < scaledAmount) revert NotEnoughDeposited();

        (uint256 collateralUSD, uint256 debtUSD,) = _getUserValues(msg.sender);
        uint256 withdrawUSD = oracle.getValueUSD(token, amount, _getDecimals(token));

        ValidationLogic.validateWithdraw(
            collateralUSD * RAY,
            withdrawUSD * RAY,
            debtUSD * RAY,
            _weightedLiquidationThreshold(msg.sender)
        );

        positions[msg.sender][token].deposited -= scaledAmount;
        reserve.totalDeposited -= amount;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    function borrow(uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        DataTypes.ReserveData storage reserve = reserves[usdcAddress];
        if (!reserve.active) revert ReserveInactive();
        if (reserve.totalDeposited - reserve.totalBorrowed < amount) revert InsufficientLiquidity();

        _updateReserve(usdcAddress);

        (uint256 collateralUSD, uint256 existingDebtUSD,) = _getUserValues(msg.sender);
        uint256 borrowUSD = oracle.getValueUSD(usdcAddress, amount, 6);
        uint16 weightedLtv = _weightedLtv(msg.sender);

        ValidationLogic.validateBorrow(
            collateralUSD * RAY,
            existingDebtUSD * RAY,
            borrowUSD * RAY,
            weightedLtv
        );

        uint256 scaledAmount = ReserveLogic.scaleBorrow(amount, reserve.borrowIndex);
        scaledBorrows[msg.sender] += scaledAmount;
        reserve.totalBorrowed += amount;

        IERC20(usdcAddress).safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        _updateReserve(usdcAddress);

        DataTypes.ReserveData storage reserve = reserves[usdcAddress];
        uint256 currentDebt = ReserveLogic.unscaleBorrow(
            scaledBorrows[msg.sender],
            reserve.borrowIndex
        );

        uint256 repayAmount = amount > currentDebt ? currentDebt : amount;
        uint256 scaledRepay = ReserveLogic.scaleBorrow(repayAmount, reserve.borrowIndex);

        scaledBorrows[msg.sender] -= scaledRepay;
        reserve.totalBorrowed     -= repayAmount;

        IERC20(usdcAddress).safeTransferFrom(msg.sender, address(this), repayAmount);
        emit Repaid(msg.sender, repayAmount);
    }

    function liquidate(
        address borrower,
        address collateralToken,
        uint256 debtAmount
    ) external nonReentrant whenNotPaused {
        _updateReserve(usdcAddress);
        _updateReserve(collateralToken);

        DataTypes.ReserveData storage usdcReserve = reserves[usdcAddress];
        uint256 currentDebt = ReserveLogic.unscaleBorrow(
            scaledBorrows[borrower],
            usdcReserve.borrowIndex
        );

        (, , uint256 hf) = _getUserAccountData(borrower);
        ValidationLogic.validateLiquidation(hf);

        uint256 maxRepay = (currentDebt * MAX_CLOSE_FACTOR) / BPS_BASE;
        uint256 actualRepay = debtAmount > maxRepay ? maxRepay : debtAmount;

        DataTypes.ReserveData storage colReserve = reserves[collateralToken];
        uint256 collateralBonus = BPS_BASE + colReserve.liquidationBonus;
        uint256 debtUSD    = oracle.getValueUSD(usdcAddress, actualRepay, 6);
        uint8 colDecimals  = _getDecimals(collateralToken);
        uint256 colPrice   = oracle.getPrice(collateralToken);
        uint256 colSeized  = (debtUSD * collateralBonus * (10 ** colDecimals))
                              / (colPrice * BPS_BASE);

        uint256 scaledRepay = ReserveLogic.scaleBorrow(actualRepay, usdcReserve.borrowIndex);
        scaledBorrows[borrower]  -= scaledRepay;
        usdcReserve.totalBorrowed -= actualRepay;

        uint256 scaledColSeized = ReserveLogic.scaleDeposit(colSeized, colReserve.liquidityIndex);
        positions[borrower][collateralToken].deposited -= scaledColSeized;
        colReserve.totalDeposited -= colSeized;

        IERC20(usdcAddress).safeTransferFrom(msg.sender, address(this), actualRepay);
        IERC20(collateralToken).safeTransfer(msg.sender, colSeized);

        emit Liquidated(borrower, msg.sender, collateralToken, actualRepay, colSeized);
    }

    function getAccountData(address user)
        external
        view
        returns (DataTypes.UserAccountData memory)
    {
        (uint256 col, uint256 debt, uint256 hf) = _getUserAccountData(user);
        uint16 ltv = _weightedLtv(user);
        uint256 available = col > 0
            ? (col * ltv / BPS_BASE) - (debt < col * ltv / BPS_BASE ? debt : col * ltv / BPS_BASE)
            : 0;
        return DataTypes.UserAccountData({
            totalCollateralUSD:  col,
            totalDebtUSD:        debt,
            availableBorrowsUSD: available,
            healthFactor:        hf
        });
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Internal helpers ──────────────────────────────────────────────────

    function _updateReserve(address token) internal {
        DataTypes.ReserveData storage reserve = reserves[token];
        (uint256 borrowRate, uint256 supplyRate) = rateStrategy.calculateRates(
            reserve.totalDeposited,
            reserve.totalBorrowed
        );
        reserve.updateIndexes(supplyRate, borrowRate);
    }

    function _getUserValues(address user)
        internal
        view
        returns (uint256 collateralUSD, uint256 debtUSD, uint256 hf)
    {
        return _getUserAccountData(user);
    }

    function _getUserAccountData(address user)
        internal
        view
        returns (uint256 collateralUSD, uint256 debtUSD, uint256 hf)
    {
        uint256 weightedCollateral;
        for (uint256 i = 0; i < reserveList.length; i++) {
            address token = reserveList[i];
            DataTypes.ReserveData storage reserve = reserves[token];
            uint256 scaledDep = positions[user][token].deposited;
            if (scaledDep == 0) continue;
            uint256 amount = ReserveLogic.unscaleDeposit(scaledDep, reserve.liquidityIndex);
            uint8 dec = _getDecimals(token);
            uint256 usd = oracle.getValueUSD(token, amount, dec);
            collateralUSD += usd;
            weightedCollateral += (usd * reserve.liquidationThreshold);
        }

        DataTypes.ReserveData storage usdcReserve = reserves[usdcAddress];
        if (scaledBorrows[user] > 0) {
            debtUSD = ReserveLogic.unscaleBorrow(scaledBorrows[user], usdcReserve.borrowIndex);
        }

        hf = ValidationLogic.calculateHealthFactor(
            weightedCollateral * RAY,
            debtUSD * RAY * BPS_BASE,
            BPS_BASE
        );
    }

    function _weightedLtv(address user) internal view returns (uint16) {
        uint256 totalCol;
        uint256 weightedLtv;
        for (uint256 i = 0; i < reserveList.length; i++) {
            address token = reserveList[i];
            DataTypes.ReserveData storage reserve = reserves[token];
            uint256 scaledDep = positions[user][token].deposited;
            if (scaledDep == 0) continue;
            uint256 amount = ReserveLogic.unscaleDeposit(scaledDep, reserve.liquidityIndex);
            uint256 usd = oracle.getValueUSD(token, amount, _getDecimals(token));
            totalCol    += usd;
            weightedLtv += usd * reserve.ltv;
        }
        if (totalCol == 0) return 0;
        return uint16(weightedLtv / totalCol);
    }

    function _weightedLiquidationThreshold(address user) internal view returns (uint16) {
        uint256 totalCol;
        uint256 weighted;
        for (uint256 i = 0; i < reserveList.length; i++) {
            address token = reserveList[i];
            DataTypes.ReserveData storage reserve = reserves[token];
            uint256 scaledDep = positions[user][token].deposited;
            if (scaledDep == 0) continue;
            uint256 amount = ReserveLogic.unscaleDeposit(scaledDep, reserve.liquidityIndex);
            uint256 usd = oracle.getValueUSD(token, amount, _getDecimals(token));
            totalCol += usd;
            weighted += usd * reserve.liquidationThreshold;
        }
        if (totalCol == 0) return 0;
        return uint16(weighted / totalCol);
    }

    function _getDecimals(address token) internal view returns (uint8) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || data.length == 0) return 18;
        return abi.decode(data, (uint8));
    }
}
```

- [ ] **Step 2: Compile**

```bash
npx hardhat compile
```

Expected: `Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add contracts/LendingPool.sol
git commit -m "feat(contract): add LendingPool core — deposit, borrow, repay, liquidate"
```

---

### Task 10: LendingPool integration tests

**Files:**
- Create: `test/integration/LendingPool.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// test/integration/LendingPool.test.ts
import { expect } from "chai";
import hre from "hardhat";
import { parseUnits } from "viem";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("LendingPool — Integration", () => {
  const BTC_PRICE  = parseUnits("65000", 8);
  const EURC_PRICE = parseUnits("1.08", 8);

  async function deployAll() {
    const [owner, alice, bob, liquidator] = await hre.viem.getWalletClients();

    const usdc   = await hre.viem.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const cirBtc = await hre.viem.deployContract("MockERC20", ["Circle BTC", "cirBTC", 8]);
    const eurc   = await hre.viem.deployContract("MockERC20", ["Euro Coin", "EURC", 6]);

    const btcFeed  = await hre.viem.deployContract("MockAggregator", [BTC_PRICE]);
    const eurcFeed = await hre.viem.deployContract("MockAggregator", [EURC_PRICE]);

    const oracle   = await hre.viem.deployContract("PriceOracle", [usdc.address]);
    await oracle.write.setFeed([cirBtc.address, btcFeed.address]);
    await oracle.write.setFeed([eurc.address, eurcFeed.address]);

    const strategy = await hre.viem.deployContract("InterestRateStrategy");
    const pool     = await hre.viem.deployContract("LendingPool", [
      oracle.address, strategy.address, usdc.address,
    ]);

    // init reserves
    await pool.write.initReserve([usdc.address,   8000, 8500, 500]);
    await pool.write.initReserve([eurc.address,   8000, 8500, 500]);
    await pool.write.initReserve([cirBtc.address, 7000, 7500, 1000]);

    // fund test wallets
    await usdc.write.mint([alice.account.address,     parseUnits("10000", 6)]);
    await usdc.write.mint([bob.account.address,       parseUnits("50000", 6)]);
    await cirBtc.write.mint([alice.account.address,   parseUnits("1", 8)]);
    await eurc.write.mint([alice.account.address,     parseUnits("1000", 6)]);

    return { pool, oracle, usdc, cirBtc, eurc, owner, alice, bob, liquidator, btcFeed };
  }

  describe("Deposit", () => {
    it("increases reserve totalDeposited", async () => {
      const { pool, usdc, alice } = await deployAll();
      const amount = parseUnits("1000", 6);
      await usdc.write.approve([pool.address, amount], { account: alice.account });
      await pool.write.deposit([usdc.address, amount], { account: alice.account });
      const reserve = await pool.read.reserves([usdc.address]);
      expect(reserve.totalDeposited).to.equal(amount);
    });

    it("reverts on zero amount", async () => {
      const { pool, usdc, alice } = await deployAll();
      await expect(
        pool.write.deposit([usdc.address, 0n], { account: alice.account })
      ).to.be.rejectedWith("ZeroAmount");
    });
  });

  describe("Borrow", () => {
    it("allows borrow within LTV after depositing cirBTC collateral", async () => {
      const { pool, usdc, cirBtc, bob, alice } = await deployAll();

      // Bob supplies USDC liquidity
      const liquidity = parseUnits("10000", 6);
      await usdc.write.approve([pool.address, liquidity], { account: bob.account });
      await pool.write.deposit([usdc.address, liquidity], { account: bob.account });

      // Alice deposits 0.1 cirBTC ($6,500 collateral)
      const collateral = parseUnits("0.1", 8);
      await cirBtc.write.approve([pool.address, collateral], { account: alice.account });
      await pool.write.deposit([cirBtc.address, collateral], { account: alice.account });

      // Alice borrows $4,000 USDC (within 70% LTV of $6,500 = $4,550 max)
      const borrowAmount = parseUnits("4000", 6);
      await pool.write.borrow([borrowAmount], { account: alice.account });

      const balance = await usdc.read.balanceOf([alice.account.address]);
      expect(balance).to.equal(parseUnits("14000", 6)); // 10000 existing + 4000 borrowed
    });

    it("reverts when borrow exceeds LTV", async () => {
      const { pool, usdc, cirBtc, bob, alice } = await deployAll();

      const liquidity = parseUnits("10000", 6);
      await usdc.write.approve([pool.address, liquidity], { account: bob.account });
      await pool.write.deposit([usdc.address, liquidity], { account: bob.account });

      const collateral = parseUnits("0.1", 8);
      await cirBtc.write.approve([pool.address, collateral], { account: alice.account });
      await pool.write.deposit([cirBtc.address, collateral], { account: alice.account });

      // Try to borrow $5,000 > 70% LTV of $6,500
      await expect(
        pool.write.borrow([parseUnits("5000", 6)], { account: alice.account })
      ).to.be.rejectedWith("ExceedsLTV");
    });
  });

  describe("Repay", () => {
    it("clears debt after full repayment", async () => {
      const { pool, usdc, cirBtc, bob, alice } = await deployAll();

      const liquidity = parseUnits("10000", 6);
      await usdc.write.approve([pool.address, liquidity], { account: bob.account });
      await pool.write.deposit([usdc.address, liquidity], { account: bob.account });

      const collateral = parseUnits("0.1", 8);
      await cirBtc.write.approve([pool.address, collateral], { account: alice.account });
      await pool.write.deposit([cirBtc.address, collateral], { account: alice.account });

      const borrowAmount = parseUnits("3000", 6);
      await pool.write.borrow([borrowAmount], { account: alice.account });

      await time.increase(30 * 24 * 60 * 60); // 30 days

      // Repay with extra to cover interest
      const repayAmount = parseUnits("3100", 6);
      await usdc.write.approve([pool.address, repayAmount], { account: alice.account });
      await pool.write.repay([repayAmount], { account: alice.account });

      const scaled = await pool.read.scaledBorrows([alice.account.address]);
      expect(scaled).to.equal(0n);
    });
  });

  describe("Liquidation", () => {
    it("liquidates undercollateralized position and sends bonus to liquidator", async () => {
      const { pool, usdc, cirBtc, bob, alice, liquidator, btcFeed } = await deployAll();

      // Setup: alice deposits cirBTC, borrows near LTV limit
      const liquidity = parseUnits("10000", 6);
      await usdc.write.approve([pool.address, liquidity], { account: bob.account });
      await pool.write.deposit([usdc.address, liquidity], { account: bob.account });

      const collateral = parseUnits("0.1", 8);
      await cirBtc.write.approve([pool.address, collateral], { account: alice.account });
      await pool.write.deposit([cirBtc.address, collateral], { account: alice.account });

      await pool.write.borrow([parseUnits("4000", 6)], { account: alice.account });

      // BTC price crashes 40%
      await btcFeed.write.setAnswer([parseUnits("39000", 8)]);

      // Liquidator funds
      await usdc.write.mint([liquidator.account.address, parseUnits("5000", 6)]);
      await usdc.write.approve([pool.address, parseUnits("5000", 6)], { account: liquidator.account });

      const colBefore = await cirBtc.read.balanceOf([liquidator.account.address]);
      await pool.write.liquidate(
        [alice.account.address, cirBtc.address, parseUnits("2000", 6)],
        { account: liquidator.account }
      );
      const colAfter = await cirBtc.read.balanceOf([liquidator.account.address]);

      expect(colAfter).to.be.greaterThan(colBefore); // liquidator received cirBTC
    });

    it("reverts when trying to liquidate a healthy position", async () => {
      const { pool, usdc, cirBtc, bob, alice, liquidator } = await deployAll();

      const liquidity = parseUnits("10000", 6);
      await usdc.write.approve([pool.address, liquidity], { account: bob.account });
      await pool.write.deposit([usdc.address, liquidity], { account: bob.account });

      const collateral = parseUnits("0.1", 8);
      await cirBtc.write.approve([pool.address, collateral], { account: alice.account });
      await pool.write.deposit([cirBtc.address, collateral], { account: alice.account });

      await pool.write.borrow([parseUnits("2000", 6)], { account: alice.account });

      await usdc.write.mint([liquidator.account.address, parseUnits("5000", 6)]);
      await usdc.write.approve([pool.address, parseUnits("5000", 6)], { account: liquidator.account });

      await expect(
        pool.write.liquidate(
          [alice.account.address, cirBtc.address, parseUnits("1000", 6)],
          { account: liquidator.account }
        )
      ).to.be.rejectedWith("PositionHealthy");
    });
  });

  describe("Stale oracle guard", () => {
    it("reverts borrow when price feed is stale", async () => {
      const { pool, cirBtc, btcFeed, alice } = await deployAll();
      await btcFeed.write.setUpdatedAt([BigInt(await time.latest()) - 3700n]);
      const collateral = parseUnits("0.1", 8);
      await cirBtc.write.approve([pool.address, collateral], { account: alice.account });
      await expect(
        pool.write.deposit([cirBtc.address, collateral], { account: alice.account })
      ).to.be.rejectedWith("StalePrice");
    });
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
npx hardhat test
```

Expected: All tests pass including unit + integration.

- [ ] **Step 3: Check coverage**

```bash
npx hardhat coverage
```

Expected: Line coverage ≥ 95% on all contract files.

- [ ] **Step 4: Commit**

```bash
git add test/integration/LendingPool.test.ts
git commit -m "test(contract): add full integration test suite for LendingPool"
```

---

### Task 11: Slither security scan

**Files:** No new files.

- [ ] **Step 1: Install Slither**

```bash
pip install slither-analyzer
```

- [ ] **Step 2: Run Slither**

```bash
slither contracts/ --exclude-dependencies
```

- [ ] **Step 3: Fix any HIGH or MEDIUM findings**

Review each finding. Common false positives to ignore:
- `calls-loop` on `reserveList` iteration — acceptable for small list (3 tokens)
- `timestamp` usage in `_updateReserve` — intentional, documented

Any HIGH finding must be fixed before proceeding.

- [ ] **Step 4: Commit fixes if any**

```bash
git add contracts/
git commit -m "fix(security): resolve Slither findings"
```

---

## PHASE 3 — FRONTEND

---

### Task 12: Arc network config & Web3 providers

**Files:**
- Modify: `config/networks.ts` (already exists)
- Create: `src/providers/Web3Provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Verify `config/networks.ts` is correct** (already created in project setup)

```typescript
// config/networks.ts — already exists, verify content
import { defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const SUPPORTED_CHAINS = [arcTestnet] as const;
export const DEFAULT_CHAIN = arcTestnet;
```

- [ ] **Step 2: Write Web3Provider.tsx**

```tsx
// src/providers/Web3Provider.tsx
"use client";

import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { arcTestnet } from "../../config/networks";
import "@rainbow-me/rainbowkit/styles.css";

const wagmiConfig = getDefaultConfig({
  appName: "Arc Lending",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "arc-lending",
  chains: [arcTestnet],
  ssr: true,
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

- [ ] **Step 3: Update layout.tsx**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Web3Provider } from "../providers/Web3Provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arc Lending",
  description: "Lend and borrow on Arc Network",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run dev server and verify no errors**

```bash
npm run dev
```

Open `http://localhost:3000` — black background, no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/providers/Web3Provider.tsx src/app/layout.tsx config/
git commit -m "feat(frontend): add Web3 providers locked to Arc Testnet"
```

---

### Task 13: ChainGuard — enforce Arc Testnet

**Files:**
- Create: `src/components/shared/ChainGuard.tsx`

- [ ] **Step 1: Write ChainGuard.tsx**

```tsx
// src/components/shared/ChainGuard.tsx
"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { arcTestnet } from "../../../config/networks";

export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return <>{children}</>;
  }

  if (chainId !== arcTestnet.id) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#000000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "28px",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "linear-gradient(90deg, rgb(160,224,171), rgb(255,172,46) 50%, rgb(165,45,37))",
          }}
        />
        <h2 style={{ fontSize: 29, fontWeight: 400, color: "#ffffff", margin: 0 }}>
          Wrong Network
        </h2>
        <p style={{ fontSize: 16, color: "#6d6d6d", margin: 0, textAlign: "center" }}>
          Arc Lending runs exclusively on Arc Testnet.
        </p>
        <button
          onClick={() => switchChain({ chainId: arcTestnet.id })}
          style={{
            background: "transparent",
            color: "#ffffff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: "75.024px",
            padding: "11px 32px",
            fontSize: 16,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Switch to Arc Testnet
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Add ChainGuard to layout.tsx**

```tsx
// src/app/layout.tsx — update body
import { ChainGuard } from "../components/shared/ChainGuard";

// inside <body>:
<Web3Provider>
  <ChainGuard>{children}</ChainGuard>
</Web3Provider>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/ChainGuard.tsx src/app/layout.tsx
git commit -m "feat(frontend): add ChainGuard — blocks access on wrong network"
```

---

### Task 14: Navbar

**Files:**
- Create: `src/components/shared/Navbar.tsx`

- [ ] **Step 1: Write Navbar.tsx**

```tsx
// src/components/shared/Navbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const LINKS = [
  { href: "/app",     label: "Dashboard" },
  { href: "/markets", label: "Markets"   },
  { href: "/profile", label: "Profile"   },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div
        style={{
          maxWidth: 1078,
          margin: "0 auto",
          padding: "0 28px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/app" style={{ color: "#ffffff", textDecoration: "none", fontSize: 18, fontWeight: 600 }}>
          Arc Lending
        </Link>

        <div style={{ display: "flex", gap: 28 }}>
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                color: pathname === href ? "#ffffff" : "#6d6d6d",
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 400,
                transition: "color 0.15s",
              }}
            >
              {label}
            </Link>
          ))}
        </div>

        <ConnectButton />
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Add Navbar to layout.tsx**

```tsx
// inside <ChainGuard>:
<Navbar />
<main style={{ minHeight: "calc(100vh - 64px)" }}>
  {children}
</main>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/Navbar.tsx src/app/layout.tsx
git commit -m "feat(frontend): add sticky Navbar with route highlighting"
```

---

### Task 15: wagmi hooks

**Files:**
- Create: `src/hooks/use-account-data.ts`
- Create: `src/hooks/use-reserve-data.ts`
- Create: `src/hooks/use-supply.ts`
- Create: `src/hooks/use-borrow.ts`
- Create: `src/hooks/use-repay.ts`
- Create: `src/hooks/use-withdraw.ts`

- [ ] **Step 1: Write use-account-data.ts**

```typescript
// src/hooks/use-account-data.ts
import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { ARC_TESTNET_CONTRACTS } from "../../config/contracts";
import { LENDING_POOL_ABI } from "../lib/abis";

export function useAccountData() {
  const { address } = useAccount();

  const { data, isLoading, error, refetch } = useReadContract({
    address: ARC_TESTNET_CONTRACTS.LENDING_POOL as `0x${string}`,
    abi: LENDING_POOL_ABI,
    functionName: "getAccountData",
    args: [address!],
    query: { enabled: !!address },
  });

  return {
    accountData: data,
    isLoading,
    error,
    refetch,
  };
}
```

- [ ] **Step 2: Write use-supply.ts**

```typescript
// src/hooks/use-supply.ts
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { ARC_TESTNET_CONTRACTS } from "../../config/contracts";
import { LENDING_POOL_ABI, ERC20_ABI } from "../lib/abis";

export function useSupply() {
  const { writeContractAsync: approve, isPending: isApprovePending } =
    useWriteContract();
  const { writeContractAsync: deposit, data: depositHash, isPending: isDepositPending } =
    useWriteContract();
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash: depositHash });

  async function supply(tokenAddress: `0x${string}`, amount: bigint) {
    await approve({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ARC_TESTNET_CONTRACTS.LENDING_POOL as `0x${string}`, amount],
    });
    await deposit({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL as `0x${string}`,
      abi: LENDING_POOL_ABI,
      functionName: "deposit",
      args: [tokenAddress, amount],
    });
  }

  return {
    supply,
    isPending: isApprovePending || isDepositPending || isConfirming,
    isSuccess,
  };
}
```

- [ ] **Step 3: Write use-borrow.ts**

```typescript
// src/hooks/use-borrow.ts
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ARC_TESTNET_CONTRACTS } from "../../config/contracts";
import { LENDING_POOL_ABI } from "../lib/abis";

export function useBorrow() {
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  async function borrow(amount: bigint) {
    await writeContractAsync({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL as `0x${string}`,
      abi: LENDING_POOL_ABI,
      functionName: "borrow",
      args: [amount],
    });
  }

  return { borrow, isPending: isPending || isConfirming, isSuccess };
}
```

- [ ] **Step 4: Write use-repay.ts**

```typescript
// src/hooks/use-repay.ts
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ARC_TESTNET_CONTRACTS } from "../../config/contracts";
import { LENDING_POOL_ABI, ERC20_ABI } from "../lib/abis";

export function useRepay() {
  const { writeContractAsync: approve } = useWriteContract();
  const { writeContractAsync: repayWrite, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  async function repay(amount: bigint) {
    await approve({
      address: ARC_TESTNET_CONTRACTS.USDC as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ARC_TESTNET_CONTRACTS.LENDING_POOL as `0x${string}`, amount],
    });
    await repayWrite({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL as `0x${string}`,
      abi: LENDING_POOL_ABI,
      functionName: "repay",
      args: [amount],
    });
  }

  return { repay, isPending: isPending || isConfirming, isSuccess };
}
```

- [ ] **Step 5: Write use-withdraw.ts**

```typescript
// src/hooks/use-withdraw.ts
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ARC_TESTNET_CONTRACTS } from "../../config/contracts";
import { LENDING_POOL_ABI } from "../lib/abis";

export function useWithdraw() {
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  async function withdraw(tokenAddress: `0x${string}`, amount: bigint) {
    await writeContractAsync({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL as `0x${string}`,
      abi: LENDING_POOL_ABI,
      functionName: "withdraw",
      args: [tokenAddress, amount],
    });
  }

  return { withdraw, isPending: isPending || isConfirming, isSuccess };
}
```

- [ ] **Step 6: Write use-reserve-data.ts**

```typescript
// src/hooks/use-reserve-data.ts
import { useReadContracts } from "wagmi";
import { ARC_TESTNET_CONTRACTS } from "../../config/contracts";
import { LENDING_POOL_ABI } from "../lib/abis";

const TOKENS = [
  ARC_TESTNET_CONTRACTS.USDC,
  ARC_TESTNET_CONTRACTS.EURC,
  ARC_TESTNET_CONTRACTS.cirBTC,
] as const;

export function useReserveData() {
  const { data, isLoading } = useReadContracts({
    contracts: TOKENS.map((token) => ({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL as `0x${string}`,
      abi: LENDING_POOL_ABI,
      functionName: "reserves" as const,
      args: [token as `0x${string}`],
    })),
  });

  return {
    reserves: data?.map((r) => r.result) ?? [],
    isLoading,
  };
}
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/
git commit -m "feat(frontend): add wagmi hooks for supply, borrow, repay, withdraw, reserves"
```

---

### Task 16: Dashboard page (`/app`)

**Files:**
- Create: `src/app/app/page.tsx`
- Create: `src/components/dashboard/HealthFactorBanner.tsx`
- Create: `src/components/dashboard/SupplyPanel.tsx`
- Create: `src/components/dashboard/BorrowPanel.tsx`

- [ ] **Step 1: Write HealthFactorBanner.tsx**

```tsx
// src/components/dashboard/HealthFactorBanner.tsx
"use client";

interface Props {
  healthFactor: bigint;
}

function getHealthColor(hf: bigint): string {
  const WAD = 10n ** 18n;
  if (hf >= 15n * WAD / 10n) return "rgb(160, 224, 171)";
  if (hf >= WAD)              return "rgb(255, 172, 46)";
  return "rgb(165, 45, 37)";
}

function formatHF(hf: bigint): string {
  if (hf === 2n ** 256n - 1n) return "∞";
  return (Number(hf) / 1e18).toFixed(2);
}

export function HealthFactorBanner({ healthFactor }: Props) {
  if (healthFactor === 0n) return null;

  const color = getHealthColor(healthFactor);
  const value = formatHF(healthFactor);
  const pct   = Math.min(Number(healthFactor) / 2e18 * 100, 100);

  return (
    <div className="glass-card" style={{ padding: "20px 34px", marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "#6d6d6d", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Health Factor
        </span>
        <span style={{ fontSize: 18, fontWeight: 600, color }}>{value}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: color, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the Dashboard page**

```tsx
// src/app/app/page.tsx
"use client";

import { useAccountData } from "../../hooks/use-account-data";
import { useReserveData } from "../../hooks/use-reserve-data";
import { HealthFactorBanner } from "../../components/dashboard/HealthFactorBanner";
import { SupplyPanel } from "../../components/dashboard/SupplyPanel";
import { BorrowPanel } from "../../components/dashboard/BorrowPanel";

export default function DashboardPage() {
  const { accountData } = useAccountData();
  const { reserves }    = useReserveData();

  return (
    <div style={{ maxWidth: 1078, margin: "0 auto", padding: "40px 28px" }}>
      {accountData && (
        <HealthFactorBanner healthFactor={accountData.healthFactor} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
        <SupplyPanel accountData={accountData} reserves={reserves} />
        <BorrowPanel accountData={accountData} reserves={reserves} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write SupplyPanel.tsx**

```tsx
// src/components/dashboard/SupplyPanel.tsx
"use client";

import { useState } from "react";
import { SupplyModal } from "../modals/SupplyModal";
import { WithdrawModal } from "../modals/WithdrawModal";
import { ARC_TESTNET_CONTRACTS, TOKEN_DECIMALS } from "../../../config/contracts";

const SUPPLY_TOKENS = [
  { symbol: "cirBTC", address: ARC_TESTNET_CONTRACTS.cirBTC as `0x${string}` },
  { symbol: "EURC",   address: ARC_TESTNET_CONTRACTS.EURC   as `0x${string}` },
  { symbol: "USDC",   address: ARC_TESTNET_CONTRACTS.USDC   as `0x${string}` },
];

export function SupplyPanel({ accountData, reserves }: { accountData: any; reserves: any[] }) {
  const [supplyToken, setSupplyToken]     = useState<`0x${string}` | null>(null);
  const [withdrawToken, setWithdrawToken] = useState<`0x${string}` | null>(null);

  return (
    <div>
      {/* Your Supplies */}
      <div className="glass-card" style={{ padding: 34, marginBottom: 14 }}>
        <h3 style={{ fontSize: 18, fontWeight: 400, margin: "0 0 20px" }}>Your Supplies</h3>
        {!accountData || accountData.totalCollateralUSD === 0n ? (
          <p style={{ color: "#6d6d6d", fontSize: 16 }}>Nothing supplied yet</p>
        ) : (
          <p style={{ color: "#ffffff" }}>
            ${(Number(accountData.totalCollateralUSD) / 1e6).toFixed(2)}
          </p>
        )}
      </div>

      {/* Assets to Supply */}
      <div className="glass-card" style={{ padding: 34 }}>
        <h3 style={{ fontSize: 18, fontWeight: 400, margin: "0 0 20px" }}>Assets to Supply</h3>
        {SUPPLY_TOKENS.map(({ symbol, address }) => (
          <div
            key={address}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 0",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ fontSize: 16, color: "#ffffff" }}>{symbol}</span>
            <button
              onClick={() => setSupplyToken(address)}
              style={{
                background: "transparent",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "75.024px",
                padding: "8px 20px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Supply
            </button>
          </div>
        ))}
      </div>

      {supplyToken && (
        <SupplyModal
          tokenAddress={supplyToken}
          onClose={() => setSupplyToken(null)}
        />
      )}
      {withdrawToken && (
        <WithdrawModal
          tokenAddress={withdrawToken}
          onClose={() => setWithdrawToken(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write BorrowPanel.tsx** (mirrors SupplyPanel for USDC borrow)

```tsx
// src/components/dashboard/BorrowPanel.tsx
"use client";

import { useState } from "react";
import { BorrowModal } from "../modals/BorrowModal";
import { RepayModal }  from "../modals/RepayModal";

export function BorrowPanel({ accountData, reserves }: { accountData: any; reserves: any[] }) {
  const [showBorrow, setShowBorrow] = useState(false);
  const [showRepay,  setShowRepay]  = useState(false);

  const limitUsedPct = accountData && accountData.availableBorrowsUSD > 0n
    ? Number((accountData.totalDebtUSD * 100n) / (accountData.totalDebtUSD + accountData.availableBorrowsUSD))
    : 0;

  return (
    <div>
      {/* Your Borrows */}
      <div className="glass-card" style={{ padding: 34, marginBottom: 14 }}>
        <h3 style={{ fontSize: 18, fontWeight: 400, margin: "0 0 20px" }}>Your Borrows</h3>
        {!accountData || accountData.totalDebtUSD === 0n ? (
          <p style={{ color: "#6d6d6d", fontSize: 16 }}>Nothing borrowed yet</p>
        ) : (
          <>
            <p style={{ color: "#ffffff" }}>
              ${(Number(accountData.totalDebtUSD) / 1e6).toFixed(2)} USDC
            </p>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#6d6d6d" }}>BORROW LIMIT USED</span>
                <span style={{ fontSize: 11, color: "#ffffff" }}>{limitUsedPct}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
                <div style={{ height: "100%", width: `${limitUsedPct}%`, borderRadius: 2, background: "rgb(255,172,46)" }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Assets to Borrow */}
      <div className="glass-card" style={{ padding: 34 }}>
        <h3 style={{ fontSize: 18, fontWeight: 400, margin: "0 0 20px" }}>Assets to Borrow</h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 0",
          }}
        >
          <span style={{ fontSize: 16, color: "#ffffff" }}>USDC</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowBorrow(true)}
              style={{
                background: "transparent",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "75.024px",
                padding: "8px 20px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Borrow
            </button>
            {accountData?.totalDebtUSD > 0n && (
              <button
                onClick={() => setShowRepay(true)}
                style={{
                  background: "transparent",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: "75.024px",
                  padding: "8px 20px",
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Repay
              </button>
            )}
          </div>
        </div>
      </div>

      {showBorrow && <BorrowModal onClose={() => setShowBorrow(false)} />}
      {showRepay  && <RepayModal  onClose={() => setShowRepay(false)} />}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/ src/components/dashboard/
git commit -m "feat(frontend): add Dashboard page with supply/borrow panels"
```

---

### Task 17: Action Modals

**Files:**
- Create: `src/components/modals/SupplyModal.tsx`
- Create: `src/components/modals/BorrowModal.tsx`
- Create: `src/components/modals/RepayModal.tsx`
- Create: `src/components/modals/WithdrawModal.tsx`
- Create: `src/lib/format.ts`

- [ ] **Step 1: Write format.ts**

```typescript
// src/lib/format.ts
export function formatUSD(value: bigint, decimals: number = 6): string {
  return `$${(Number(value) / 10 ** decimals).toFixed(2)}`;
}

export function formatToken(value: bigint, decimals: number, symbol: string): string {
  return `${(Number(value) / 10 ** decimals).toFixed(4)} ${symbol}`;
}

export function formatAPY(rateRay: bigint): string {
  const pct = Number(rateRay) / 1e25;
  return `${pct.toFixed(2)}%`;
}

export function formatHealthFactor(hf: bigint): string {
  if (hf === 2n ** 256n - 1n) return "∞";
  return (Number(hf) / 1e18).toFixed(2);
}

export function healthFactorColor(hf: bigint): string {
  const WAD = 10n ** 18n;
  if (hf >= 15n * WAD / 10n) return "rgb(160, 224, 171)";
  if (hf >= WAD)              return "rgb(255, 172, 46)";
  return "rgb(165, 45, 37)";
}
```

- [ ] **Step 2: Write SupplyModal.tsx**

```tsx
// src/components/modals/SupplyModal.tsx
"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useBalance, useAccount } from "wagmi";
import { useSupply } from "../../hooks/use-supply";

const TOKEN_META: Record<string, { symbol: string; decimals: number }> = {
  "0x3600000000000000000000000000000000000000": { symbol: "USDC",   decimals: 6 },
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a": { symbol: "EURC",   decimals: 6 },
};

interface Props {
  tokenAddress: `0x${string}`;
  onClose: () => void;
}

export function SupplyModal({ tokenAddress, onClose }: Props) {
  const [amount, setAmount]   = useState("");
  const { address }           = useAccount();
  const { supply, isPending, isSuccess } = useSupply();
  const meta = TOKEN_META[tokenAddress] ?? { symbol: "TOKEN", decimals: 18 };

  const { data: balance } = useBalance({ address, token: tokenAddress });

  async function handleSupply() {
    if (!amount) return;
    await supply(tokenAddress, parseUnits(amount, meta.decimals));
  }

  if (isSuccess) {
    return (
      <Modal onClose={onClose}>
        <p style={{ color: "rgb(160,224,171)", textAlign: "center", fontSize: 18 }}>
          Supply successful!
        </p>
        <button onClick={onClose} style={buttonStyle}>Close</button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 29, fontWeight: 400, margin: "0 0 28px" }}>
        Supply {meta.symbol}
      </h2>

      <label style={{ fontSize: 11, color: "#6d6d6d", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Amount
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 8 }}>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          style={inputStyle}
        />
        <button
          onClick={() => setAmount(balance?.formatted ?? "")}
          style={{ ...buttonStyle, padding: "0 16px", fontSize: 12 }}
        >
          MAX
        </button>
      </div>
      <p style={{ fontSize: 12, color: "#6d6d6d", margin: "0 0 28px" }}>
        Wallet: {balance?.formatted ?? "0"} {meta.symbol}
      </p>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20, marginBottom: 28 }}>
        <Row label="Supply APY" value="—" />
        <Row label="Can be used as collateral" value="Yes" />
      </div>

      <button
        onClick={handleSupply}
        disabled={isPending || !amount}
        style={{ ...buttonStyle, width: "100%", padding: "14px 0", opacity: isPending ? 0.5 : 1 }}
      >
        {isPending ? "Confirming..." : `Supply ${meta.symbol}`}
      </button>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 14, color: "#6d6d6d" }}>{label}</span>
      <span style={{ fontSize: 14, color: "#ffffff" }}>{value}</span>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{ width: 480, padding: 34, position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 20, right: 20, background: "none",
            border: "none", color: "#6d6d6d", fontSize: 20, cursor: "pointer" }}
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: "75.024px",
  padding: "11px 32px",
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "inherit",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.05)",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  padding: "14px 18px",
  fontSize: 16,
  fontFamily: "inherit",
  outline: "none",
};
```

- [ ] **Step 3: Write BorrowModal.tsx, RepayModal.tsx, WithdrawModal.tsx**

These follow the same pattern as SupplyModal — same Modal wrapper, same button styles, same input style. Only difference:

**BorrowModal:** calls `useBorrow().borrow(amount)`, label "Borrow USDC", shows available borrow limit, health factor preview.

**RepayModal:** calls `useRepay().repay(amount)`, label "Repay USDC", shows current debt, MAX = current outstanding debt.

**WithdrawModal:** calls `useWithdraw().withdraw(tokenAddress, amount)`, label "Withdraw {symbol}", shows current deposited amount, validates health factor won't drop below 1 client-side before submitting.

Each modal is ~80 lines following the exact same structure as SupplyModal above.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/ src/lib/format.ts
git commit -m "feat(frontend): add Supply, Borrow, Repay, Withdraw modals"
```

---

### Task 18: Markets page (`/markets`)

**Files:**
- Create: `src/app/markets/page.tsx`
- Create: `src/components/markets/MarketsTable.tsx`

- [ ] **Step 1: Write MarketsTable.tsx**

```tsx
// src/components/markets/MarketsTable.tsx
"use client";

import { useReserveData } from "../../hooks/use-reserve-data";
import { formatAPY } from "../../lib/format";

const TOKEN_LABELS = [
  { symbol: "cirBTC", name: "Circle BTC" },
  { symbol: "EURC",   name: "Euro Coin"  },
  { symbol: "USDC",   name: "USD Coin"   },
];

export function MarketsTable() {
  const { reserves, isLoading } = useReserveData();

  if (isLoading) {
    return <p style={{ color: "#6d6d6d" }}>Loading markets...</p>;
  }

  return (
    <div className="glass-card" style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["Asset", "Total Supplied", "Supply APY", "Total Borrowed", "Borrow APY"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "16px 24px",
                  textAlign: "left",
                  fontSize: 11,
                  color: "#6d6d6d",
                  fontWeight: 400,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TOKEN_LABELS.map(({ symbol, name }, i) => {
            const r = reserves[i];
            return (
              <tr
                key={symbol}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <td style={{ padding: "20px 24px" }}>
                  <div style={{ fontSize: 16, color: "#ffffff" }}>{name}</div>
                  <div style={{ fontSize: 12, color: "#6d6d6d" }}>{symbol}</div>
                </td>
                <td style={{ padding: "20px 24px", fontSize: 16, color: "#ffffff" }}>
                  {r ? (Number(r.totalDeposited) / 1e6).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "20px 24px", fontSize: 16, color: "rgb(160,224,171)" }}>
                  {r ? formatAPY(r.liquidityIndex) : "—"}
                </td>
                <td style={{ padding: "20px 24px", fontSize: 16, color: "#ffffff" }}>
                  {r ? (Number(r.totalBorrowed) / 1e6).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "20px 24px", fontSize: 16, color: "rgb(255,172,46)" }}>
                  {r ? formatAPY(r.borrowIndex) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write markets page**

```tsx
// src/app/markets/page.tsx
import { MarketsTable } from "../../components/markets/MarketsTable";

export default function MarketsPage() {
  return (
    <div style={{ maxWidth: 1078, margin: "0 auto", padding: "40px 28px" }}>
      <h1 style={{ fontSize: 39, fontWeight: 400, margin: "0 0 40px" }}>Markets</h1>
      <MarketsTable />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/markets/ src/components/markets/
git commit -m "feat(frontend): add Markets page with pool stats table"
```

---

### Task 19: Profile page (`/profile`)

**Files:**
- Create: `src/app/profile/page.tsx`
- Create: `src/components/profile/PositionsTable.tsx`

- [ ] **Step 1: Write Profile page**

```tsx
// src/app/profile/page.tsx
"use client";

import { useAccountData } from "../../hooks/use-account-data";
import { formatUSD, formatHealthFactor, healthFactorColor } from "../../lib/format";

export default function ProfilePage() {
  const { accountData, isLoading } = useAccountData();

  if (isLoading) return (
    <div style={{ maxWidth: 1078, margin: "0 auto", padding: "40px 28px" }}>
      <p style={{ color: "#6d6d6d" }}>Loading...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 1078, margin: "0 auto", padding: "40px 28px" }}>
      <h1 style={{ fontSize: 39, fontWeight: 400, margin: "0 0 40px" }}>Profile</h1>

      {accountData && (
        <div
          className="glass-card"
          style={{
            padding: 34,
            marginBottom: 28,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 28,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#6d6d6d", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Net Worth
            </div>
            <div style={{ fontSize: 29, color: "#ffffff", fontWeight: 600 }}>
              {formatUSD(accountData.totalCollateralUSD - accountData.totalDebtUSD)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6d6d6d", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Health Factor
            </div>
            <div style={{ fontSize: 29, fontWeight: 600, color: healthFactorColor(accountData.healthFactor) }}>
              {formatHealthFactor(accountData.healthFactor)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6d6d6d", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Available to Borrow
            </div>
            <div style={{ fontSize: 29, color: "#ffffff", fontWeight: 600 }}>
              {formatUSD(accountData.availableBorrowsUSD)} USDC
            </div>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ padding: 34, marginBottom: 14 }}>
        <h3 style={{ fontSize: 18, margin: "0 0 20px" }}>Supplied Positions</h3>
        {!accountData || accountData.totalCollateralUSD === 0n ? (
          <p style={{ color: "#6d6d6d" }}>No supplied positions</p>
        ) : (
          <p style={{ color: "#ffffff" }}>Total: {formatUSD(accountData.totalCollateralUSD)}</p>
        )}
      </div>

      <div className="glass-card" style={{ padding: 34 }}>
        <h3 style={{ fontSize: 18, margin: "0 0 20px" }}>Borrowed Positions</h3>
        {!accountData || accountData.totalDebtUSD === 0n ? (
          <p style={{ color: "#6d6d6d" }}>No borrowed positions</p>
        ) : (
          <p style={{ color: "#ffffff" }}>
            USDC Debt: {formatUSD(accountData.totalDebtUSD)}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/profile/
git commit -m "feat(frontend): add Profile page with account summary and positions"
```

---

### Task 20: ABI file & root redirect

**Files:**
- Create: `src/lib/abis.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Generate ABI after compiling contracts**

```bash
npx hardhat compile
```

Copy ABI from `artifacts/contracts/LendingPool.sol/LendingPool.json` → paste the `abi` array into `src/lib/abis.ts`:

```typescript
// src/lib/abis.ts
export const LENDING_POOL_ABI = [
  // paste compiled ABI array here after `npx hardhat compile`
] as const;

export const ERC20_ABI = [
  { name: "approve",     type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { name: "balanceOf",   type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "decimals",    type: "function", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { name: "allowance",   type: "function", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;
```

- [ ] **Step 2: Add root redirect**

```tsx
// src/app/page.tsx
import { redirect } from "next/navigation";
export default function RootPage() { redirect("/app"); }
```

- [ ] **Step 3: Final build check**

```bash
npm run build
```

Expected: No TypeScript errors, no build failures.

- [ ] **Step 4: Commit**

```bash
git add src/lib/abis.ts src/app/page.tsx
git commit -m "feat(frontend): add ABIs and root redirect to /app"
```

---

## PHASE 4 — DEPLOYMENT

---

### Task 21: Deploy to Arc Testnet

**Files:**
- Create: `scripts/deploy.ts`

- [ ] **Step 1: Write deploy script**

```typescript
// scripts/deploy.ts
import hre from "hardhat";

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  console.log("Deploying from:", deployer.account.address);

  // 1. Deploy mock cirBTC (until official address confirmed via Arc MCP)
  const cirBtc = await hre.viem.deployContract("MockERC20", ["Circle BTC", "cirBTC", 8]);
  console.log("cirBTC (mock):", cirBtc.address);

  // 2. Deploy InterestRateStrategy
  const strategy = await hre.viem.deployContract("InterestRateStrategy");
  console.log("InterestRateStrategy:", strategy.address);

  // 3. Deploy PriceOracle
  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  const oracle = await hre.viem.deployContract("PriceOracle", [USDC_ADDRESS]);
  console.log("PriceOracle:", oracle.address);

  // 4. Set Chainlink feeds — addresses to be confirmed via Arc MCP
  // await oracle.write.setFeed([cirBtc.address, CHAINLINK_CIRBTC_USD]);
  // await oracle.write.setFeed([EURC_ADDRESS, CHAINLINK_EURC_USD]);

  // 5. Deploy LendingPool
  const pool = await hre.viem.deployContract("LendingPool", [
    oracle.address,
    strategy.address,
    USDC_ADDRESS,
  ]);
  console.log("LendingPool:", pool.address);

  // 6. Init reserves
  const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
  await pool.write.initReserve([USDC_ADDRESS,    8000, 8500,  500]);
  await pool.write.initReserve([EURC_ADDRESS,    8000, 8500,  500]);
  await pool.write.initReserve([cirBtc.address,  7000, 7500, 1000]);

  console.log("\n=== Update config/contracts.ts ===");
  console.log(`LENDING_POOL: "${pool.address}"`);
  console.log(`PRICE_ORACLE: "${oracle.address}"`);
  console.log(`cirBTC:       "${cirBtc.address}"`);
}

main().catch(console.error);
```

- [ ] **Step 2: Fund deployer wallet from faucet**

Visit `https://faucet.circle.com`, select Arc Testnet, request USDC.

- [ ] **Step 3: Deploy**

```bash
npx hardhat run scripts/deploy.ts --network arc
```

- [ ] **Step 4: Update `config/contracts.ts`** with deployed addresses from console output.

- [ ] **Step 5: Smoke test on ArcScan**

Visit `https://testnet.arcscan.app` — search deployed LendingPool address. Verify `initReserve` transactions visible.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy.ts config/contracts.ts
git commit -m "feat(deploy): deploy LendingPool to Arc Testnet"
```

---

## Self-Review Against Spec

| Spec Requirement | Task |
|---|---|
| USDC, EURC, cirBTC supply/collateral | Task 9 — `initReserve` for all 3 |
| USDC borrow only | Task 9 — `borrow()` hardcoded to usdcAddress |
| Variable rate (utilization-based) | Task 5 — InterestRateStrategy |
| Aave-standard LTV params | Task 9 + Task 21 deploy |
| Open liquidation | Task 9 — `liquidate()` no access control |
| Health factor display | Task 16 — HealthFactorBanner |
| 3 pages: /app /markets /profile | Tasks 16, 18, 19 |
| Modal for actions | Task 17 |
| Chainlink staleness guard | Task 8 — `MAX_STALENESS = 3600` |
| Arc Testnet only (Chain ID 5042002) | Task 12 — ChainGuard |
| 100% design.md adherence | Tasks 2, 13–19 — all style inline |
| 100% English code | All tasks — no non-English identifiers |
| Reentrancy guard | Task 9 — `nonReentrant` on all writes |
| 95% test coverage | Task 10 — `npx hardhat coverage` |
| Slither clean | Task 11 |
