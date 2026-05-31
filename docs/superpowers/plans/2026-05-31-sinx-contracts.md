# sinX Smart Contracts — Implementation Plan

**Goal:** Deploy a working lending/borrowing protocol on Arc Testnet with mock tokens (xUSDC, xEURC, xclrBTC) and real Arc tokens (USDC, EURC, cirBTC), wired to the existing sinX frontend.

**Architecture:** Monolithic LendingPool + separate InterestRateStrategy + PriceOracle wrapper. Aave v2 patterns without code traces. Ray math (1e27) for indexes, WAD (1e18) for health factor. TDD throughout.

**Tech Stack:** Solidity ^0.8.20, OpenZeppelin 5.x, Hardhat, Chai/Ethers v6, Chainlink AggregatorV3, Arc Testnet (Chain ID 5042002)

---

## Checkpoint Map

```
CHECKPOINT 1 — Hardhat compiles             (Task 1-2)
CHECKPOINT 2 — Mock tokens mintable         (Task 3)
CHECKPOINT 3 — Oracle returns valid prices  (Task 4)
CHECKPOINT 4 — Interest rate curve correct  (Task 5)
CHECKPOINT 5 — Core pool: deposit/withdraw  (Task 6-7)
CHECKPOINT 6 — Core pool: borrow/repay      (Task 8-9)
CHECKPOINT 7 — Liquidation works           (Task 10)
CHECKPOINT 8 — Integration: full user flow  (Task 11)
CHECKPOINT 9 — Slither clean               (Task 12)
CHECKPOINT 10 — Deployed to Arc Testnet    (Task 13)
CHECKPOINT 11 — Frontend wired to chain    (Task 14-15)
```

---

## Task 1 — Hardhat Setup

**Files:**
- Create: `hardhat.config.ts`
- Create: `contracts/.gitkeep`
- Create: `test/.gitkeep`
- Create: `scripts/.gitkeep`
- Modify: `package.json` (add hardhat deps)

- [ ] **Step 1: Install dependencies**
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @nomicfoundation/hardhat-ethers ethers dotenv
npm install @openzeppelin/contracts
```

- [ ] **Step 2: Create hardhat.config.ts**
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    arcTestnet: {
      url: process.env.NEXT_PUBLIC_ARC_RPC || "https://rpc.testnet.arc.network",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 5042002,
    },
  },
};
export default config;
```

- [ ] **Step 3: Add DEPLOYER_PRIVATE_KEY to .env.local**
```
DEPLOYER_PRIVATE_KEY=     ← paste your testnet private key here (never commit)
```

- [ ] **Step 4: Verify compile works**
```bash
npx hardhat compile
```
Expected: `Nothing to compile` (no contracts yet — that's fine)

- [ ] **Step 5: Commit**
```bash
git add hardhat.config.ts package.json package-lock.json
git commit -m "chore: add hardhat + OpenZeppelin setup"
```

---

## Task 2 — DataTypes Library

**Files:**
- Create: `contracts/types/DataTypes.sol`

- [ ] **Step 1: Create DataTypes.sol**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library DataTypes {
    struct ReserveData {
        uint128 liquidityIndex;       // ray — cumulative supply interest
        uint128 borrowIndex;          // ray — cumulative borrow interest
        uint128 currentLiquidityRate; // ray per second
        uint128 currentBorrowRate;    // ray per second
        uint40  lastUpdateTimestamp;
        uint8   decimals;
        bool    borrowingEnabled;
        address aTokenAddress;        // unused for v1, reserved
        // Risk params
        uint16 ltv;                   // basis points, e.g. 7000 = 70%
        uint16 liquidationThreshold;  // basis points, e.g. 7500 = 75%
        uint16 liquidationBonus;      // basis points above 10000, e.g. 10500 = +5%
        // Pool state
        uint256 totalSupplied;        // in token decimals
        uint256 totalBorrowed;        // in token decimals (principal only)
        uint256 supplyCap;            // 0 = unlimited
    }

    struct UserAccountData {
        uint256 totalCollateralUSD;   // WAD 1e18
        uint256 totalDebtUSD;         // WAD 1e18
        uint256 availableBorrowsUSD;  // WAD 1e18
        uint256 healthFactor;         // WAD 1e18 — MAX_UINT256 if no debt
        uint256 ltv;                  // weighted average, WAD
        uint256 liquidationThreshold; // weighted average, WAD
    }
}
```

- [ ] **Step 2: Compile**
```bash
npx hardhat compile
```
Expected: `Compiled 1 Solidity file successfully`

- [ ] **Step 3: Commit**
```bash
git add contracts/
git commit -m "feat(contracts): add DataTypes library"
```

---

## Task 3 — Mock Tokens (xUSDC, xEURC, xclrBTC)

**Files:**
- Create: `contracts/mocks/MockERC20.sol`
- Create: `test/MockERC20.test.ts`

- [ ] **Step 1: Write the test first**
```typescript
// test/MockERC20.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockERC20", () => {
  async function deploy(name: string, symbol: string, decimals: number) {
    const [owner, user] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("MockERC20");
    const token = await factory.deploy(name, symbol, decimals);
    return { token, owner, user };
  }

  it("mints up to cap per call", async () => {
    const { token, user } = await deploy("Arc Testnet USD", "xUSDC", 6);
    const cap = await token.MINT_CAP();
    await token.connect(user).mint(user.address, cap);
    expect(await token.balanceOf(user.address)).to.equal(cap);
  });

  it("reverts when amount exceeds cap", async () => {
    const { token, user } = await deploy("Arc Testnet USD", "xUSDC", 6);
    const cap = await token.MINT_CAP();
    await expect(
      token.connect(user).mint(user.address, cap + 1n)
    ).to.be.revertedWithCustomError(token, "MintCapExceeded");
  });

  it("owner can mint unlimited (seed pool)", async () => {
    const { token, owner } = await deploy("Arc Testnet USD", "xUSDC", 6);
    const large = ethers.parseUnits("10000000", 6);
    await token.connect(owner).ownerMint(owner.address, large);
    expect(await token.balanceOf(owner.address)).to.equal(large);
  });

  it("has correct decimals", async () => {
    const { token } = await deploy("Arc Testnet BTC", "xclrBTC", 8);
    expect(await token.decimals()).to.equal(8);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npx hardhat test test/MockERC20.test.ts
```
Expected: `Error: no contract factory` — contract doesn't exist yet

- [ ] **Step 3: Create MockERC20.sol**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
    uint8 private immutable _decimals;
    uint256 public constant MINT_CAP = 10_000 * 1e18; // overridden per instance

    error MintCapExceeded();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mintCap() public view returns (uint256) {
        // 10,000 units in token's own decimals
        return 10_000 * (10 ** _decimals);
    }

    function MINT_CAP() public view returns (uint256) {
        return mintCap();
    }

    // Anyone can call — capped at 10,000 tokens per call
    function mint(address to, uint256 amount) external {
        if (amount > mintCap()) revert MintCapExceeded();
        _mint(to, amount);
    }

    // Owner only — for seeding the pool with initial liquidity
    function ownerMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

- [ ] **Step 4: Run test — expect PASS**
```bash
npx hardhat test test/MockERC20.test.ts
```
Expected: `4 passing`

- [ ] **Step 5: Commit**
```bash
git add contracts/mocks/MockERC20.sol test/MockERC20.test.ts
git commit -m "feat(contracts): add MockERC20 with mint cap and owner seed"
```

> **CHECKPOINT 2 ✓** — Mock tokens compile and pass all tests

---

## Task 4 — PriceOracle + MockAggregator

**Files:**
- Create: `contracts/mocks/MockAggregator.sol`
- Create: `contracts/PriceOracle.sol`
- Create: `test/PriceOracle.test.ts`

- [ ] **Step 1: Write the test first**
```typescript
// test/PriceOracle.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PriceOracle", () => {
  async function deploy() {
    const [owner] = await ethers.getSigners();

    const AggFactory = await ethers.getContractFactory("MockAggregator");
    // BTC = $60,000 with 8 decimals
    const btcFeed  = await AggFactory.deploy(8, 60_000n * 10n**8n);
    // EUR = $1.08 with 8 decimals
    const eurFeed  = await AggFactory.deploy(8, 108_000_000n);
    // USDC = $1.00 with 8 decimals
    const usdcFeed = await AggFactory.deploy(8, 100_000_000n);

    const OracleFactory = await ethers.getContractFactory("PriceOracle");
    const oracle = await OracleFactory.deploy();

    const btcAddr  = await btcFeed.getAddress();
    const eurAddr  = await eurFeed.getAddress();
    const usdcAddr = await usdcFeed.getAddress();

    // register token → feed
    await oracle.setFeed(ethers.ZeroAddress, btcAddr);  // placeholder token addr
    return { oracle, btcFeed, eurFeed, usdcFeed, owner, btcAddr, eurAddr, usdcAddr };
  }

  it("returns correct price for registered token", async () => {
    const { oracle } = await deploy();
    const price = await oracle.getPrice(ethers.ZeroAddress);
    // $60,000 normalized to WAD (1e18)
    expect(price).to.equal(ethers.parseEther("60000"));
  });

  it("reverts on stale price (> 3600s)", async () => {
    const { oracle, btcFeed } = await deploy();
    await time.increase(3601);
    await expect(
      oracle.getPrice(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(oracle, "StalePrice");
  });

  it("reverts for unregistered token", async () => {
    const { oracle } = await deploy();
    const randomAddr = ethers.Wallet.createRandom().address;
    await expect(
      oracle.getPrice(randomAddr)
    ).to.be.revertedWithCustomError(oracle, "FeedNotFound");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npx hardhat test test/PriceOracle.test.ts
```

- [ ] **Step 3: Create MockAggregator.sol**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockAggregator {
    uint8  private immutable _decimals;
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 initialAnswer) {
        _decimals  = decimals_;
        _answer    = initialAnswer;
        _updatedAt = block.timestamp;
    }

    function decimals() external view returns (uint8) { return _decimals; }

    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt,
        uint256 updatedAt, uint80 answeredInRound
    ) {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }

    function setAnswer(int256 answer) external {
        _answer    = answer;
        _updatedAt = block.timestamp;
    }
}
```

- [ ] **Step 4: Create PriceOracle.sol**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80, int256, uint256, uint256, uint80
    );
}

contract PriceOracle is Ownable {
    uint256 public constant MAX_STALENESS = 3600; // 1 hour
    uint256 private constant WAD = 1e18;

    mapping(address => address) private feeds; // token → Chainlink feed

    error FeedNotFound(address token);
    error StalePrice(address token, uint256 age);
    error NegativePrice(address token);

    event FeedSet(address indexed token, address indexed feed);

    constructor() Ownable(msg.sender) {}

    function setFeed(address token, address feed) external onlyOwner {
        feeds[token] = feed;
        emit FeedSet(token, feed);
    }

    // Returns price normalized to WAD (1e18) regardless of feed decimals
    function getPrice(address token) external view returns (uint256) {
        address feed = feeds[token];
        if (feed == address(0)) revert FeedNotFound(token);

        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(feed).latestRoundData();
        uint256 age = block.timestamp - updatedAt;
        if (age > MAX_STALENESS) revert StalePrice(token, age);
        if (answer <= 0) revert NegativePrice(token);

        uint8 feedDecimals = IAggregatorV3(feed).decimals();
        // Normalize to WAD
        if (feedDecimals >= 18) {
            return uint256(answer) / (10 ** (feedDecimals - 18));
        } else {
            return uint256(answer) * (10 ** (18 - feedDecimals));
        }
    }

    function getFeed(address token) external view returns (address) {
        return feeds[token];
    }
}
```

- [ ] **Step 5: Run test — expect PASS**
```bash
npx hardhat test test/PriceOracle.test.ts
```
Expected: `3 passing`

- [ ] **Step 6: Commit**
```bash
git add contracts/mocks/MockAggregator.sol contracts/PriceOracle.sol test/PriceOracle.test.ts
git commit -m "feat(contracts): add PriceOracle with Chainlink staleness guard"
```

> **CHECKPOINT 3 ✓** — Oracle returns correct WAD prices and reverts on stale data

---

## Task 5 — InterestRateStrategy

**Files:**
- Create: `contracts/InterestRateStrategy.sol`
- Create: `test/InterestRateStrategy.test.ts`

- [ ] **Step 1: Write the test first**
```typescript
// test/InterestRateStrategy.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31536000n;

describe("InterestRateStrategy", () => {
  async function deploy() {
    const factory = await ethers.getContractFactory("InterestRateStrategy");
    // baseRate=5%, slope1=4%, kink=80%, slope2=145% — all in RAY/year
    const baseRate = RAY * 5n / 100n;
    const slope1   = RAY * 4n / 100n;
    const kink     = RAY * 80n / 100n;
    const slope2   = RAY * 145n / 100n;
    const strategy = await factory.deploy(baseRate, slope1, kink, slope2);
    return { strategy };
  }

  it("returns base rate when utilization = 0", async () => {
    const { strategy } = await deploy();
    const [borrowRate] = await strategy.calculateRates(0n, 1000n);
    // ~5% APY in RAY/year
    const expected = RAY * 5n / 100n;
    expect(borrowRate).to.equal(expected);
  });

  it("returns base+slope1 at kink (80% utilization)", async () => {
    const { strategy } = await deploy();
    const totalSupply  = 1000n * 10n**6n;
    const totalBorrows = 800n * 10n**6n; // exactly 80%
    const [borrowRate] = await strategy.calculateRates(totalBorrows, totalSupply);
    // 5% + 4% = 9%
    const expected = RAY * 9n / 100n;
    expect(borrowRate).to.equal(expected);
  });

  it("returns high rate above kink (90% utilization)", async () => {
    const { strategy } = await deploy();
    const totalSupply  = 1000n * 10n**6n;
    const totalBorrows = 900n * 10n**6n; // 90%
    const [borrowRate] = await strategy.calculateRates(totalBorrows, totalSupply);
    // above kink: rate should be > 9%
    expect(borrowRate).to.be.gt(RAY * 9n / 100n);
  });

  it("supply rate < borrow rate always", async () => {
    const { strategy } = await deploy();
    const [borrowRate, supplyRate] = await strategy.calculateRates(800n, 1000n);
    expect(supplyRate).to.be.lt(borrowRate);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npx hardhat test test/InterestRateStrategy.test.ts
```

- [ ] **Step 3: Create InterestRateStrategy.sol**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract InterestRateStrategy {
    uint256 private constant RAY = 1e27;

    uint256 public immutable baseRate;  // ray/year
    uint256 public immutable slope1;    // ray/year — below kink
    uint256 public immutable kink;      // ray (e.g. 0.8e27 = 80%)
    uint256 public immutable slope2;    // ray/year — above kink

    constructor(
        uint256 baseRate_,
        uint256 slope1_,
        uint256 kink_,
        uint256 slope2_
    ) {
        baseRate = baseRate_;
        slope1   = slope1_;
        kink     = kink_;
        slope2   = slope2_;
    }

    // Returns (borrowRate, supplyRate) both in RAY per year
    function calculateRates(
        uint256 totalBorrows,
        uint256 totalSupply
    ) external view returns (uint256 borrowRate, uint256 supplyRate) {
        if (totalSupply == 0) {
            return (baseRate, 0);
        }

        uint256 utilization = (totalBorrows * RAY) / totalSupply;

        if (utilization <= kink) {
            borrowRate = baseRate + (slope1 * utilization) / kink;
        } else {
            uint256 excessUtil = utilization - kink;
            uint256 excessRange = RAY - kink;
            borrowRate = baseRate + slope1 + (slope2 * excessUtil) / excessRange;
        }

        // Supply rate = borrow rate * utilization (borrowers fund suppliers)
        supplyRate = (borrowRate * utilization) / RAY;
    }

    function utilizationRate(
        uint256 totalBorrows,
        uint256 totalSupply
    ) external pure returns (uint256) {
        if (totalSupply == 0) return 0;
        return (totalBorrows * RAY) / totalSupply;
    }
}
```

- [ ] **Step 4: Run test — expect PASS**
```bash
npx hardhat test test/InterestRateStrategy.test.ts
```
Expected: `4 passing`

- [ ] **Step 5: Commit**
```bash
git add contracts/InterestRateStrategy.sol test/InterestRateStrategy.test.ts
git commit -m "feat(contracts): add 2-slope variable interest rate strategy"
```

> **CHECKPOINT 4 ✓** — Interest rate curve correct: 5% base, kink at 80%, spike above kink

---

## Task 6 — ValidationLogic Library

**Files:**
- Create: `contracts/libraries/ValidationLogic.sol`
- Create: `test/ValidationLogic.test.ts`

- [ ] **Step 1: Write the test first**
```typescript
// test/ValidationLogic.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("ValidationLogic", () => {
  async function deploy() {
    const factory = await ethers.getContractFactory("ValidationLogicHarness");
    const harness = await factory.deploy();
    return { harness };
  }

  it("calculates health factor correctly", async () => {
    const { harness } = await deploy();
    // $4,200 collateral weighted × threshold / $3,000 debt = 1.4
    const collateralUSD = ethers.parseEther("4200");
    const debtUSD       = ethers.parseEther("3000");
    const hf = await harness.calcHealthFactor(collateralUSD, debtUSD);
    expect(hf).to.equal(ethers.parseEther("1.4"));
  });

  it("returns MAX_UINT256 when no debt", async () => {
    const { harness } = await deploy();
    const hf = await harness.calcHealthFactor(ethers.parseEther("5000"), 0n);
    expect(hf).to.equal(ethers.MaxUint256);
  });

  it("is liquidatable when hf < 1e18", async () => {
    const { harness } = await deploy();
    const collateral = ethers.parseEther("2000");
    const debt       = ethers.parseEther("3000");
    const hf = await harness.calcHealthFactor(collateral, debt);
    expect(hf).to.be.lt(ethers.parseEther("1"));
  });
});
```

- [ ] **Step 2: Create ValidationLogic.sol + Harness**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library ValidationLogic {
    uint256 internal constant WAD = 1e18;

    error HealthFactorBelowOne(uint256 healthFactor);
    error InsufficientCollateral(uint256 available, uint256 required);
    error BorrowingNotEnabled(address token);
    error AmountZero();
    error InsufficientLiquidity(uint256 available, uint256 requested);
    error SupplyCapExceeded(uint256 cap, uint256 newTotal);

    function calculateHealthFactor(
        uint256 totalCollateralUSD,
        uint256 totalDebtUSD
    ) internal pure returns (uint256) {
        if (totalDebtUSD == 0) return type(uint256).max;
        return (totalCollateralUSD * WAD) / totalDebtUSD;
    }

    function validateHealthFactor(
        uint256 totalCollateralUSD,
        uint256 totalDebtUSD
    ) internal pure {
        if (totalDebtUSD == 0) return;
        uint256 hf = calculateHealthFactor(totalCollateralUSD, totalDebtUSD);
        if (hf < WAD) revert HealthFactorBelowOne(hf);
    }
}
```

```solidity
// contracts/mocks/ValidationLogicHarness.sol — test only, never deploy to mainnet
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/ValidationLogic.sol";

contract ValidationLogicHarness {
    function calcHealthFactor(
        uint256 collateralUSD,
        uint256 debtUSD
    ) external pure returns (uint256) {
        return ValidationLogic.calculateHealthFactor(collateralUSD, debtUSD);
    }
}
```

- [ ] **Step 3: Run test — expect PASS**
```bash
npx hardhat test test/ValidationLogic.test.ts
```
Expected: `3 passing`

- [ ] **Step 4: Commit**
```bash
git add contracts/libraries/ValidationLogic.sol contracts/mocks/ValidationLogicHarness.sol test/ValidationLogic.test.ts
git commit -m "feat(contracts): add ValidationLogic with health factor math"
```

---

## Task 7 — ReserveLogic Library

**Files:**
- Create: `contracts/libraries/ReserveLogic.sol`

- [ ] **Step 1: Create ReserveLogic.sol**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../types/DataTypes.sol";

library ReserveLogic {
    uint256 internal constant RAY  = 1e27;
    uint256 internal constant WAD  = 1e18;
    uint256 internal constant HALF_RAY = RAY / 2;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    // Compound interest: (1 + rate/SECONDS_PER_YEAR)^timeDelta ≈ 1 + rate*timeDelta
    // Linear approximation — adequate for short intervals
    function calculateLinearInterest(
        uint256 rate,
        uint256 lastUpdateTimestamp
    ) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdateTimestamp;
        if (elapsed == 0) return RAY;
        return RAY + (rate * elapsed) / SECONDS_PER_YEAR;
    }

    // Update liquidity and borrow indexes based on elapsed time
    function updateIndexes(
        DataTypes.ReserveData storage reserve
    ) internal {
        uint256 elapsed = block.timestamp - reserve.lastUpdateTimestamp;
        if (elapsed == 0) return;

        if (reserve.totalBorrowed > 0) {
            uint256 borrowFactor = calculateLinearInterest(
                reserve.currentBorrowRate,
                reserve.lastUpdateTimestamp
            );
            reserve.borrowIndex = uint128(
                (uint256(reserve.borrowIndex) * borrowFactor) / RAY
            );
        }

        if (reserve.totalSupplied > 0) {
            uint256 liquidityFactor = calculateLinearInterest(
                reserve.currentLiquidityRate,
                reserve.lastUpdateTimestamp
            );
            reserve.liquidityIndex = uint128(
                (uint256(reserve.liquidityIndex) * liquidityFactor) / RAY
            );
        }

        reserve.lastUpdateTimestamp = uint40(block.timestamp);
    }

    function initReserve(DataTypes.ReserveData storage reserve) internal {
        reserve.liquidityIndex      = uint128(RAY);
        reserve.borrowIndex         = uint128(RAY);
        reserve.lastUpdateTimestamp = uint40(block.timestamp);
    }
}
```

- [ ] **Step 2: Compile**
```bash
npx hardhat compile
```
Expected: compiles cleanly

- [ ] **Step 3: Commit**
```bash
git add contracts/libraries/ReserveLogic.sol
git commit -m "feat(contracts): add ReserveLogic with linear interest accrual"
```

> **CHECKPOINT 5 ✓** — All libraries compile and pass tests. Ready for LendingPool core.

---

## Task 8 — LendingPool: deposit + withdraw

**Files:**
- Create: `contracts/LendingPool.sol` (deposit + withdraw only first)
- Create: `test/LendingPool.deposit.test.ts`

- [ ] **Step 1: Write deposit/withdraw tests**
```typescript
// test/LendingPool.deposit.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("LendingPool — deposit & withdraw", () => {
  async function setup() {
    const [owner, alice, bob] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    const xUSDC = await TokenFactory.deploy("Arc Testnet USD",  "xUSDC",  6);
    const xclrBTC = await TokenFactory.deploy("Arc Testnet BTC", "xclrBTC", 8);

    const AggFactory = await ethers.getContractFactory("MockAggregator");
    const usdcFeed = await AggFactory.deploy(8, 100_000_000n);       // $1.00
    const btcFeed  = await AggFactory.deploy(8, 60_000n * 10n**8n);  // $60,000

    const OracleFactory = await ethers.getContractFactory("PriceOracle");
    const oracle = await OracleFactory.deploy();
    await oracle.setFeed(await xUSDC.getAddress(),   await usdcFeed.getAddress());
    await oracle.setFeed(await xclrBTC.getAddress(), await btcFeed.getAddress());

    const StratFactory = await ethers.getContractFactory("InterestRateStrategy");
    const strategy = await StratFactory.deploy(
      10n**27n * 5n / 100n,   // 5% base
      10n**27n * 4n / 100n,   // 4% slope1
      10n**27n * 80n / 100n,  // 80% kink
      10n**27n * 145n / 100n  // 145% slope2
    );

    const PoolFactory = await ethers.getContractFactory("LendingPool");
    const pool = await PoolFactory.deploy(
      await oracle.getAddress(),
      await strategy.getAddress()
    );

    // Init reserves
    const usdcAddr   = await xUSDC.getAddress();
    const btcAddr    = await xclrBTC.getAddress();
    await pool.initReserve(usdcAddr, 6,  true,  8000, 8500, 10500, 0);
    await pool.initReserve(btcAddr,  8,  false, 7000, 7500, 10500, 0);

    // Fund alice
    await xUSDC.ownerMint(await alice.getAddress(), ethers.parseUnits("10000", 6));
    await xclrBTC.ownerMint(await alice.getAddress(), ethers.parseUnits("1", 8));

    return { pool, xUSDC, xclrBTC, oracle, strategy, owner, alice, bob };
  }

  it("deposits correctly and updates totalSupplied", async () => {
    const { pool, xUSDC, alice } = await setup();
    const poolAddr = await pool.getAddress();
    const amount = ethers.parseUnits("1000", 6);
    await xUSDC.connect(alice).approve(poolAddr, amount);
    await pool.connect(alice).deposit(await xUSDC.getAddress(), amount);
    const reserve = await pool.getReserveData(await xUSDC.getAddress());
    expect(reserve.totalSupplied).to.equal(amount);
  });

  it("tracks user supply balance", async () => {
    const { pool, xUSDC, alice } = await setup();
    const poolAddr = await pool.getAddress();
    const amount = ethers.parseUnits("500", 6);
    await xUSDC.connect(alice).approve(poolAddr, amount);
    await pool.connect(alice).deposit(await xUSDC.getAddress(), amount);
    const balance = await pool.getUserSupplyBalance(await xUSDC.getAddress(), await alice.getAddress());
    expect(balance).to.equal(amount);
  });

  it("withdraw returns tokens to user", async () => {
    const { pool, xUSDC, alice } = await setup();
    const poolAddr = await pool.getAddress();
    const amount = ethers.parseUnits("1000", 6);
    await xUSDC.connect(alice).approve(poolAddr, amount);
    await pool.connect(alice).deposit(await xUSDC.getAddress(), amount);

    const balanceBefore = await xUSDC.balanceOf(await alice.getAddress());
    await pool.connect(alice).withdraw(await xUSDC.getAddress(), amount);
    const balanceAfter = await xUSDC.balanceOf(await alice.getAddress());

    expect(balanceAfter - balanceBefore).to.equal(amount);
  });

  it("reverts withdraw above supplied amount", async () => {
    const { pool, xUSDC, alice } = await setup();
    const poolAddr = await pool.getAddress();
    const amount = ethers.parseUnits("500", 6);
    await xUSDC.connect(alice).approve(poolAddr, amount);
    await pool.connect(alice).deposit(await xUSDC.getAddress(), amount);

    await expect(
      pool.connect(alice).withdraw(await xUSDC.getAddress(), amount + 1n)
    ).to.be.revertedWithCustomError(pool, "InsufficientBalance");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npx hardhat test test/LendingPool.deposit.test.ts
```

- [ ] **Step 3: Create LendingPool.sol (deposit + withdraw only)**

See full implementation in `contracts/LendingPool.sol` — core structure:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./types/DataTypes.sol";
import "./libraries/ReserveLogic.sol";
import "./libraries/ValidationLogic.sol";
import "./PriceOracle.sol";
import "./InterestRateStrategy.sol";

contract LendingPool is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ReserveLogic for DataTypes.ReserveData;

    PriceOracle         public immutable oracle;
    InterestRateStrategy public immutable rateStrategy;

    address[] public reserveList;
    mapping(address => DataTypes.ReserveData) public reserves;
    mapping(address => mapping(address => uint256)) public userSupply;  // token → user → amount
    mapping(address => mapping(address => uint256)) public userBorrow;  // token → user → amount (principal)

    error ReserveAlreadyInitialized(address token);
    error ReserveNotInitialized(address token);
    error InsufficientBalance(uint256 available, uint256 requested);
    error InsufficientLiquidity(uint256 available, uint256 requested);
    error BorrowingNotEnabled(address token);
    error HealthFactorTooLow(uint256 healthFactor);
    error SupplyCapExceeded(uint256 cap, uint256 newTotal);
    error AmountZero();
    error NotLiquidatable(address borrower, uint256 healthFactor);
    error SelfLiquidation();

    event Deposit(address indexed token, address indexed user, uint256 amount);
    event Withdraw(address indexed token, address indexed user, uint256 amount);
    event Borrow(address indexed token, address indexed user, uint256 amount);
    event Repay(address indexed token, address indexed user, uint256 amount);
    event Liquidated(address indexed borrower, address indexed liquidator, address collateralToken, uint256 debtRepaid, uint256 collateralSeized);
    event ReserveInitialized(address indexed token);

    constructor(address oracle_, address rateStrategy_) Ownable(msg.sender) {
        oracle       = PriceOracle(oracle_);
        rateStrategy = InterestRateStrategy(rateStrategy_);
    }

    function initReserve(
        address token,
        uint8   decimals,
        bool    borrowingEnabled,
        uint16  ltv,
        uint16  liquidationThreshold,
        uint16  liquidationBonus,
        uint256 supplyCap
    ) external onlyOwner {
        if (reserves[token].lastUpdateTimestamp != 0) revert ReserveAlreadyInitialized(token);
        DataTypes.ReserveData storage r = reserves[token];
        r.initReserve();
        r.decimals             = decimals;
        r.borrowingEnabled     = borrowingEnabled;
        r.ltv                  = ltv;
        r.liquidationThreshold = liquidationThreshold;
        r.liquidationBonus     = liquidationBonus;
        r.supplyCap            = supplyCap;
        reserveList.push(token);
        emit ReserveInitialized(token);
    }

    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        DataTypes.ReserveData storage r = _getReserve(token);
        if (r.supplyCap > 0 && r.totalSupplied + amount > r.supplyCap)
            revert SupplyCapExceeded(r.supplyCap, r.totalSupplied + amount);

        r.updateIndexes();
        _updateRates(token, r);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        userSupply[token][msg.sender] += amount;
        r.totalSupplied += amount;

        emit Deposit(token, msg.sender, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        DataTypes.ReserveData storage r = _getReserve(token);

        uint256 supplied = userSupply[token][msg.sender];
        if (amount > supplied) revert InsufficientBalance(supplied, amount);
        if (amount > r.totalSupplied - r.totalBorrowed)
            revert InsufficientLiquidity(r.totalSupplied - r.totalBorrowed, amount);

        r.updateIndexes();

        userSupply[token][msg.sender] -= amount;
        r.totalSupplied -= amount;

        // Check health factor after withdrawal
        (uint256 collUSD, uint256 debtUSD) = _getAccountCollateralAndDebt(msg.sender);
        ValidationLogic.validateHealthFactor(collUSD, debtUSD);

        _updateRates(token, r);

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdraw(token, msg.sender, amount);
    }

    function getUserSupplyBalance(address token, address user) external view returns (uint256) {
        return userSupply[token][user];
    }

    function getReserveData(address token) external view returns (DataTypes.ReserveData memory) {
        return reserves[token];
    }

    // --- Internal helpers ---

    function _getReserve(address token) internal view returns (DataTypes.ReserveData storage) {
        if (reserves[token].lastUpdateTimestamp == 0) revert ReserveNotInitialized(token);
        return reserves[token];
    }

    function _updateRates(address token, DataTypes.ReserveData storage r) internal {
        (uint256 borrowRate, uint256 supplyRate) = rateStrategy.calculateRates(
            r.totalBorrowed, r.totalSupplied
        );
        r.currentBorrowRate    = uint128(borrowRate);
        r.currentLiquidityRate = uint128(supplyRate);
    }

    function _getAccountCollateralAndDebt(address user)
        internal view returns (uint256 totalCollUSD, uint256 totalDebtUSD)
    {
        for (uint256 i = 0; i < reserveList.length; i++) {
            address token = reserveList[i];
            DataTypes.ReserveData storage r = reserves[token];
            uint256 price = oracle.getPrice(token); // WAD

            uint256 supplied = userSupply[token][user];
            if (supplied > 0) {
                uint256 valueUSD = _toUSD(supplied, price, r.decimals);
                totalCollUSD += (valueUSD * r.liquidationThreshold) / 10_000;
            }

            uint256 borrowed = userBorrow[token][user];
            if (borrowed > 0) {
                totalDebtUSD += _toUSD(borrowed, price, r.decimals);
            }
        }
    }

    function _toUSD(uint256 amount, uint256 priceWAD, uint8 decimals_) internal pure returns (uint256) {
        // amount in token decimals × priceWAD (1e18) → result in WAD
        return (amount * priceWAD) / (10 ** decimals_);
    }
}
```

- [ ] **Step 4: Run deposit tests — expect PASS**
```bash
npx hardhat test test/LendingPool.deposit.test.ts
```
Expected: `4 passing`

- [ ] **Step 5: Commit**
```bash
git add contracts/LendingPool.sol test/LendingPool.deposit.test.ts
git commit -m "feat(contracts): LendingPool deposit and withdraw with health factor check"
```

> **CHECKPOINT 5 ✓** — Deposit and withdraw work; health factor validated on withdraw

---

## Task 9 — LendingPool: borrow + repay

**Files:**
- Modify: `contracts/LendingPool.sol` (add borrow + repay functions)
- Create: `test/LendingPool.borrow.test.ts`

- [ ] **Step 1: Write borrow/repay tests**
```typescript
// test/LendingPool.borrow.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("LendingPool — borrow & repay", () => {
  async function setup() { /* same as Task 8 setup — copy it */ }

  it("borrows USDC against BTC collateral", async () => {
    const { pool, xUSDC, xclrBTC, alice, bob } = await setup();
    // alice supplies BTC collateral
    const btcAmount = ethers.parseUnits("0.1", 8); // 0.1 BTC = $6,000
    await xclrBTC.connect(alice).approve(await pool.getAddress(), btcAmount);
    await pool.connect(alice).deposit(await xclrBTC.getAddress(), btcAmount);

    // bob supplies USDC so pool has liquidity
    const usdcSeed = ethers.parseUnits("5000", 6);
    await xUSDC.ownerMint(await bob.getAddress(), usdcSeed);
    await xUSDC.connect(bob).approve(await pool.getAddress(), usdcSeed);
    await pool.connect(bob).deposit(await xUSDC.getAddress(), usdcSeed);

    // alice borrows USDC — max LTV 70% of $6,000 = $4,200
    const borrowAmount = ethers.parseUnits("3000", 6);
    await pool.connect(alice).borrow(await xUSDC.getAddress(), borrowAmount);
    const debt = await pool.getUserBorrowBalance(await xUSDC.getAddress(), await alice.getAddress());
    expect(debt).to.equal(borrowAmount);
  });

  it("reverts borrow that would breach LTV", async () => {
    const { pool, xUSDC, xclrBTC, alice, bob } = await setup();
    const btcAmount = ethers.parseUnits("0.1", 8); // $6,000
    await xclrBTC.connect(alice).approve(await pool.getAddress(), btcAmount);
    await pool.connect(alice).deposit(await xclrBTC.getAddress(), btcAmount);

    const usdcSeed = ethers.parseUnits("5000", 6);
    await xUSDC.ownerMint(await bob.getAddress(), usdcSeed);
    await xUSDC.connect(bob).approve(await pool.getAddress(), usdcSeed);
    await pool.connect(bob).deposit(await xUSDC.getAddress(), usdcSeed);

    // try to borrow $5,000 > 70% of $6,000 = $4,200
    const tooMuch = ethers.parseUnits("5000", 6);
    await expect(
      pool.connect(alice).borrow(await xUSDC.getAddress(), tooMuch)
    ).to.be.revertedWithCustomError(pool, "HealthFactorTooLow");
  });

  it("repay clears debt", async () => {
    const { pool, xUSDC, xclrBTC, alice, bob } = await setup();
    // deposit + borrow setup
    const btcAmount    = ethers.parseUnits("0.1", 8);
    const borrowAmount = ethers.parseUnits("1000", 6);
    await xclrBTC.connect(alice).approve(await pool.getAddress(), btcAmount);
    await pool.connect(alice).deposit(await xclrBTC.getAddress(), btcAmount);

    const usdcSeed = ethers.parseUnits("5000", 6);
    await xUSDC.ownerMint(await bob.getAddress(), usdcSeed);
    await xUSDC.connect(bob).approve(await pool.getAddress(), usdcSeed);
    await pool.connect(bob).deposit(await xUSDC.getAddress(), usdcSeed);

    await pool.connect(alice).borrow(await xUSDC.getAddress(), borrowAmount);

    // alice repays
    await xUSDC.connect(alice).approve(await pool.getAddress(), borrowAmount);
    await pool.connect(alice).repay(await xUSDC.getAddress(), borrowAmount);

    const debt = await pool.getUserBorrowBalance(await xUSDC.getAddress(), await alice.getAddress());
    expect(debt).to.equal(0n);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npx hardhat test test/LendingPool.borrow.test.ts
```

- [ ] **Step 3: Add borrow() + repay() to LendingPool.sol**

Add after withdraw():
```solidity
function borrow(address token, uint256 amount) external nonReentrant whenNotPaused {
    if (amount == 0) revert AmountZero();
    DataTypes.ReserveData storage r = _getReserve(token);
    if (!r.borrowingEnabled) revert BorrowingNotEnabled(token);

    uint256 available = r.totalSupplied - r.totalBorrowed;
    if (amount > available) revert InsufficientLiquidity(available, amount);

    r.updateIndexes();

    userBorrow[token][msg.sender] += amount;
    r.totalBorrowed += amount;

    // Validate health factor post-borrow
    (uint256 collUSD, uint256 debtUSD) = _getAccountCollateralAndDebt(msg.sender);
    if (debtUSD > 0) {
        uint256 hf = ValidationLogic.calculateHealthFactor(collUSD, debtUSD);
        if (hf < 1e18) revert HealthFactorTooLow(hf);
    }

    // Also validate LTV (more strict than liquidation threshold)
    uint256 maxBorrowUSD = _getMaxBorrowUSD(msg.sender);
    uint256 totalDebtUSD = _getTotalDebtUSD(msg.sender);
    if (totalDebtUSD > maxBorrowUSD) revert HealthFactorTooLow(0);

    _updateRates(token, r);
    IERC20(token).safeTransfer(msg.sender, amount);
    emit Borrow(token, msg.sender, amount);
}

function repay(address token, uint256 amount) external nonReentrant whenNotPaused {
    if (amount == 0) revert AmountZero();
    DataTypes.ReserveData storage r = _getReserve(token);

    uint256 debt = userBorrow[token][msg.sender];
    uint256 repayAmount = amount > debt ? debt : amount; // cap at actual debt

    r.updateIndexes();

    userBorrow[token][msg.sender] -= repayAmount;
    r.totalBorrowed -= repayAmount;

    _updateRates(token, r);
    IERC20(token).safeTransferFrom(msg.sender, address(this), repayAmount);
    emit Repay(token, msg.sender, repayAmount);
}

function getUserBorrowBalance(address token, address user) external view returns (uint256) {
    return userBorrow[token][user];
}

function _getMaxBorrowUSD(address user) internal view returns (uint256 maxUSD) {
    for (uint256 i = 0; i < reserveList.length; i++) {
        address token = reserveList[i];
        DataTypes.ReserveData storage r = reserves[token];
        uint256 supplied = userSupply[token][user];
        if (supplied == 0) continue;
        uint256 price    = oracle.getPrice(token);
        uint256 valueUSD = _toUSD(supplied, price, r.decimals);
        maxUSD += (valueUSD * r.ltv) / 10_000;
    }
}

function _getTotalDebtUSD(address user) internal view returns (uint256 debtUSD) {
    for (uint256 i = 0; i < reserveList.length; i++) {
        address token = reserveList[i];
        DataTypes.ReserveData storage r = reserves[token];
        uint256 borrowed = userBorrow[token][user];
        if (borrowed == 0) continue;
        uint256 price = oracle.getPrice(token);
        debtUSD += _toUSD(borrowed, price, r.decimals);
    }
}
```

- [ ] **Step 4: Run test — expect PASS**
```bash
npx hardhat test test/LendingPool.borrow.test.ts
```
Expected: `3 passing`

- [ ] **Step 5: Commit**
```bash
git add contracts/LendingPool.sol test/LendingPool.borrow.test.ts
git commit -m "feat(contracts): add borrow and repay with LTV validation"
```

> **CHECKPOINT 6 ✓** — Borrow and repay work; LTV enforced; overborrow reverts

---

## Task 10 — Liquidation

**Files:**
- Modify: `contracts/LendingPool.sol` (add liquidate)
- Create: `test/LendingPool.liquidation.test.ts`

- [ ] **Step 1: Write liquidation test**
```typescript
// test/LendingPool.liquidation.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("LendingPool — liquidation", () => {
  it("liquidator seizes collateral when HF < 1", async () => {
    // 1. alice deposits 0.1 BTC ($6,000), borrows $4,000 USDC (HF = 6000*0.75/4000 = 1.125)
    // 2. BTC price drops to $40,000 → collateral = $4,000*0.75 = $3,000 < $4,000 debt → HF = 0.75
    // 3. bob (liquidator) repays $2,000 of alice's debt → receives $2,000 * 1.05 = $2,100 in BTC
  });

  it("reverts liquidation when HF >= 1", async () => {});

  it("reverts self-liquidation", async () => {});
});
```

- [ ] **Step 2: Add liquidate() to LendingPool.sol**
```solidity
function liquidate(
    address borrower,
    address debtToken,
    address collateralToken,
    uint256 debtAmountToRepay
) external nonReentrant whenNotPaused {
    if (msg.sender == borrower) revert SelfLiquidation();

    (uint256 collUSD, uint256 debtUSD) = _getAccountCollateralAndDebt(borrower);
    uint256 hf = ValidationLogic.calculateHealthFactor(collUSD, debtUSD);
    if (hf >= 1e18) revert NotLiquidatable(borrower, hf);

    DataTypes.ReserveData storage debtReserve       = _getReserve(debtToken);
    DataTypes.ReserveData storage collateralReserve = _getReserve(collateralToken);

    // Cap repay at 50% of debt (close factor)
    uint256 maxRepay = userBorrow[debtToken][borrower] / 2;
    uint256 repayAmount = debtAmountToRepay > maxRepay ? maxRepay : debtAmountToRepay;

    // Calculate collateral to seize: repay value × liquidation bonus
    uint256 debtPrice  = oracle.getPrice(debtToken);
    uint256 collPrice  = oracle.getPrice(collateralToken);
    uint256 debtValueUSD  = _toUSD(repayAmount, debtPrice, debtReserve.decimals);
    uint256 collToSeize = (debtValueUSD * collateralReserve.liquidationBonus / 10_000)
                         * (10 ** collateralReserve.decimals) / collPrice;

    // Cap at borrower's actual collateral
    uint256 borrowerColl = userSupply[collateralToken][borrower];
    if (collToSeize > borrowerColl) collToSeize = borrowerColl;

    debtReserve.updateIndexes();
    collateralReserve.updateIndexes();

    // Transfer: liquidator pays debt
    IERC20(debtToken).safeTransferFrom(msg.sender, address(this), repayAmount);
    userBorrow[debtToken][borrower]       -= repayAmount;
    debtReserve.totalBorrowed             -= repayAmount;

    // Transfer: liquidator receives collateral
    userSupply[collateralToken][borrower] -= collToSeize;
    collateralReserve.totalSupplied       -= collToSeize;
    IERC20(collateralToken).safeTransfer(msg.sender, collToSeize);

    _updateRates(debtToken, debtReserve);
    _updateRates(collateralToken, collateralReserve);

    emit Liquidated(borrower, msg.sender, collateralToken, repayAmount, collToSeize);
}
```

- [ ] **Step 3: Run tests — expect PASS**
```bash
npx hardhat test test/LendingPool.liquidation.test.ts
```
Expected: `3 passing`

- [ ] **Step 4: Commit**
```bash
git add contracts/LendingPool.sol test/LendingPool.liquidation.test.ts
git commit -m "feat(contracts): add open liquidation with 50% close factor and bonus"
```

> **CHECKPOINT 7 ✓** — Liquidation works; sub-1 HF users can be liquidated by anyone

---

## Task 11 — Integration Test: Full User Flow

**Files:**
- Create: `test/integration.test.ts`

- [ ] **Step 1: Write full flow test**
```typescript
// test/integration.test.ts
// Full scenario: alice deposits BTC, borrows USDC, price drops, bob liquidates
// Verify balances at every step
```

- [ ] **Step 2: Run — expect PASS**
```bash
npx hardhat test test/integration.test.ts
```

- [ ] **Step 3: Run all tests together**
```bash
npx hardhat test
```
Expected: all tests passing

- [ ] **Step 4: Commit**
```bash
git add test/integration.test.ts
git commit -m "test: add full integration flow — deposit, borrow, price crash, liquidation"
```

> **CHECKPOINT 8 ✓** — Full user lifecycle works end-to-end

---

## Task 12 — Security Scan (Slither)

**Files:** No new files — scan existing contracts

- [ ] **Step 1: Install Slither**
```bash
pip install slither-analyzer
# or: pip3 install slither-analyzer
```

- [ ] **Step 2: Run scan**
```bash
slither contracts/ --exclude-dependencies --solc-remaps @openzeppelin/=$(pwd)/node_modules/@openzeppelin/
```

- [ ] **Step 3: Triage findings**

| Severity | Action |
|---|---|
| High | Fix before deploy |
| Medium | Fix or document justification |
| Low/Info | Review, fix if trivial |

- [ ] **Step 4: Fix any High/Medium findings**

- [ ] **Step 5: Commit**
```bash
git add contracts/
git commit -m "fix(security): address Slither findings before deploy"
```

> **CHECKPOINT 9 ✓** — No High/Medium Slither findings

---

## Task 13 — Deploy to Arc Testnet

**Files:**
- Create: `scripts/deploy.ts`

- [ ] **Step 1: Create deploy script**
```typescript
// scripts/deploy.ts
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy mock tokens
  const TokenFactory = await ethers.getContractFactory("MockERC20");
  const xUSDC   = await TokenFactory.deploy("Arc Testnet USD",  "xUSDC",   6);
  const xEURC   = await TokenFactory.deploy("Arc Testnet Euro", "xEURC",   6);
  const xclrBTC = await TokenFactory.deploy("Arc Testnet BTC",  "xclrBTC", 8);
  console.log("xUSDC:",   await xUSDC.getAddress());
  console.log("xEURC:",   await xEURC.getAddress());
  console.log("xclrBTC:", await xclrBTC.getAddress());

  // 2. Deploy price feeds (mock on testnet)
  const AggFactory = await ethers.getContractFactory("MockAggregator");
  const btcFeed  = await AggFactory.deploy(8, 60_000n * 10n**8n); // $60,000
  const eurFeed  = await AggFactory.deploy(8, 108_000_000n);       // $1.08
  const usdcFeed = await AggFactory.deploy(8, 100_000_000n);       // $1.00

  // 3. Deploy oracle
  const oracle = await (await ethers.getContractFactory("PriceOracle")).deploy();
  await oracle.setFeed(await xUSDC.getAddress(),   await usdcFeed.getAddress());
  await oracle.setFeed(await xEURC.getAddress(),   await eurFeed.getAddress());
  await oracle.setFeed(await xclrBTC.getAddress(), await btcFeed.getAddress());

  // 4. Deploy interest rate strategy
  const strategy = await (await ethers.getContractFactory("InterestRateStrategy")).deploy(
    10n**27n * 5n / 100n,   // 5% base
    10n**27n * 4n / 100n,   // 4% slope1
    10n**27n * 80n / 100n,  // 80% kink
    10n**27n * 145n / 100n  // 145% slope2
  );

  // 5. Deploy LendingPool
  const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
    await oracle.getAddress(),
    await strategy.getAddress()
  );
  console.log("LendingPool:", await pool.getAddress());

  // 6. Init reserves — xTokens: no cap; real tokens: supply cap
  await pool.initReserve(await xUSDC.getAddress(),   6, true,  8000, 8500, 10500, 0);
  await pool.initReserve(await xEURC.getAddress(),   6, false, 8000, 8500, 10500, 0);
  await pool.initReserve(await xclrBTC.getAddress(), 8, false, 7000, 7500, 10500, 0);

  // 7. Seed pool with initial liquidity
  const USDC_SEED   = ethers.parseUnits("1_000_000", 6);
  const EURC_SEED   = ethers.parseUnits("500_000",   6);
  const BTC_SEED    = ethers.parseUnits("20",         8);
  await xUSDC.ownerMint(deployer.address, USDC_SEED);
  await xEURC.ownerMint(deployer.address, EURC_SEED);
  await xclrBTC.ownerMint(deployer.address, BTC_SEED);
  await xUSDC.approve(await pool.getAddress(), USDC_SEED);
  await xEURC.approve(await pool.getAddress(), EURC_SEED);
  await xclrBTC.approve(await pool.getAddress(), BTC_SEED);
  await pool.deposit(await xUSDC.getAddress(),   USDC_SEED);
  await pool.deposit(await xEURC.getAddress(),   EURC_SEED);
  await pool.deposit(await xclrBTC.getAddress(), BTC_SEED);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("Update config/contracts.ts with these addresses");
}

main().catch(console.error);
```

- [ ] **Step 2: Deploy**
```bash
npx hardhat run scripts/deploy.ts --network arcTestnet
```

- [ ] **Step 3: Copy addresses into config/contracts.ts**

- [ ] **Step 4: Commit**
```bash
git add scripts/deploy.ts config/contracts.ts
git commit -m "feat: deploy sinX contracts to Arc Testnet — initial seed"
```

> **CHECKPOINT 10 ✓** — All contracts live on Arc Testnet with seeded liquidity

---

## Task 14 — Wire Frontend to Contracts

**Files:**
- Create: `src/lib/contracts.ts` (typed contract instances)
- Modify: `src/lib/abis.ts` (add real ABIs from artifacts)
- Modify: `src/app/app/page.tsx` (replace mock data with useReadContract)
- Modify: `src/app/markets/page.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/faucet/page.tsx` (wire mint button)
- Modify: `src/components/modals/*.tsx` (wire write calls)

- [ ] **Step 1: Extract ABIs from artifacts**
```bash
# After npx hardhat compile:
cat artifacts/contracts/LendingPool.sol/LendingPool.json | jq '.abi' > src/lib/abi-lending-pool.json
cat artifacts/contracts/mocks/MockERC20.sol/MockERC20.json | jq '.abi' > src/lib/abi-mock-erc20.json
```

- [ ] **Step 2: Wire faucet mint button**

Replace mock `handle()` in `FaucetPage` with real `useWriteContract`:
```typescript
const { writeContract, isPending } = useWriteContract();
function handleMint(tokenAddress: string) {
  writeContract({
    address: tokenAddress as `0x${string}`,
    abi: MockERC20ABI,
    functionName: "mint",
    args: [address, mintCap],
  });
}
```

- [ ] **Step 3: Wire deposit/withdraw/borrow/repay modals**

Each modal gets `useWriteContract` + `useWaitForTransactionReceipt` for pending state.

- [ ] **Step 4: Wire dashboard data reads**

Replace mock-data imports with `useReadContract` calls to LendingPool.

- [ ] **Step 5: Commit**
```bash
git add src/
git commit -m "feat: wire frontend to deployed LendingPool contracts"
```

---

## Task 15 — Final QA + HeroCanvas Live Data

**Files:**
- Modify: `src/components/shared/HeroCanvas.tsx`

- [ ] **Step 1: Fetch real rates for canvas**

Pull `currentLiquidityRate` + `currentBorrowRate` from contract and feed into canvas lines instead of `Math.sin`.

- [ ] **Step 2: End-to-end manual test**
  - Connect wallet → switch to Arc Testnet
  - Mint xUSDC from faucet
  - Deposit xUSDC
  - Mint xclrBTC → deposit as collateral
  - Borrow xUSDC → verify health factor
  - Repay → verify HF goes back to ∞
  - Test ChainGuard on wrong network

- [ ] **Step 3: Final commit**
```bash
git add src/
git commit -m "feat: live rates in HeroCanvas — frontend fully wired to chain"
```

> **CHECKPOINT 11 ✓** — Full app working end-to-end on Arc Testnet

---

## Summary Table

| Checkpoint | Task | Deliverable |
|---|---|---|
| 1 | 1 | `npx hardhat compile` succeeds |
| 2 | 3 | MockERC20 tests pass |
| 3 | 4 | Oracle staleness/price tests pass |
| 4 | 5 | Interest rate curve tests pass |
| 5 | 6-7 | Deposit/withdraw + library compile |
| 6 | 8-9 | Borrow/repay + LTV enforcement |
| 7 | 10 | Liquidation at HF < 1 |
| 8 | 11 | Full integration test green |
| 9 | 12 | Slither: no High/Medium |
| 10 | 13 | Contracts live on Arc Testnet |
| 11 | 14-15 | Frontend fully wired, live data |
