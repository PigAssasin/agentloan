import { expect } from "chai";
import { ethers } from "hardhat";

const RAY = 10n ** 27n;

async function setup() {
  const [owner, alice, bob, liquidator] = await ethers.getSigners();

  // Deploy mock tokens
  const TokenFactory = await ethers.getContractFactory("MockERC20");
  const xUSDC   = await TokenFactory.deploy("Arc Testnet USD",  "xUSDC",   6);
  const xclrBTC = await TokenFactory.deploy("Arc Testnet BTC",  "xclrBTC", 8);

  // Deploy price feeds
  const AggFactory = await ethers.getContractFactory("MockAggregator");
  const usdcFeed = await AggFactory.deploy(8, 100_000_000n);       // $1.00
  const btcFeed  = await AggFactory.deploy(8, 60_000n * 10n**8n);  // $60,000

  // Deploy oracle
  const oracle = await (await ethers.getContractFactory("PriceOracle")).deploy();
  await oracle.setFeed(await xUSDC.getAddress(),   await usdcFeed.getAddress());
  await oracle.setFeed(await xclrBTC.getAddress(), await btcFeed.getAddress());

  // Deploy interest rate strategy
  const strategy = await (await ethers.getContractFactory("InterestRateStrategy")).deploy(
    RAY * 5n / 100n,   // 5% base
    RAY * 4n / 100n,   // 4% slope1
    RAY * 80n / 100n,  // 80% kink
    RAY * 145n / 100n  // 145% slope2
  );

  // Deploy LendingPool
  const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
    await oracle.getAddress(),
    await strategy.getAddress()
  );

  const usdcAddr = await xUSDC.getAddress();
  const btcAddr  = await xclrBTC.getAddress();
  const poolAddr = await pool.getAddress();

  // Init reserves: xUSDC borrowable, xclrBTC collateral only
  await pool.initReserve(usdcAddr, 6, true,  8000, 8500, 10500, 0);
  await pool.initReserve(btcAddr,  8, false, 7000, 7500, 10500, 0);

  // Fund accounts
  await xUSDC.ownerMint(alice.address, ethers.parseUnits("10000", 6));
  await xUSDC.ownerMint(bob.address,   ethers.parseUnits("10000", 6));
  await xclrBTC.ownerMint(alice.address, ethers.parseUnits("1", 8));

  return {
    pool, xUSDC, xclrBTC, oracle, strategy, btcFeed, usdcFeed,
    owner, alice, bob, liquidator,
    usdcAddr, btcAddr, poolAddr
  };
}

// ── Deposit ────────────────────────────────────────────────────────────────

describe("LendingPool — deposit", () => {
  it("updates totalScaledSupply correctly (at t=0, scaled == real)", async () => {
    const { pool, xUSDC, alice, poolAddr, usdcAddr } = await setup();
    const amount = ethers.parseUnits("1000", 6);
    await xUSDC.connect(alice).approve(poolAddr, amount);
    await pool.connect(alice).deposit(usdcAddr, amount);
    const r = await pool.getReserveData(usdcAddr);
    // At t=0 indexes = RAY, so totalScaledSupply == amount
    expect(r.totalScaledSupply).to.equal(amount);
  });

  it("tracks user supply balance (real balance == deposit at t=0)", async () => {
    const { pool, xUSDC, alice, poolAddr, usdcAddr } = await setup();
    const amount = ethers.parseUnits("500", 6);
    await xUSDC.connect(alice).approve(poolAddr, amount);
    await pool.connect(alice).deposit(usdcAddr, amount);
    // getUserSupplyBalance returns real balance = scaled * index / RAY
    // At t=0 index = RAY, so real == amount
    expect(await pool.getUserSupplyBalance(usdcAddr, alice.address)).to.equal(amount);
  });

  it("reverts on zero amount", async () => {
    const { pool, alice, usdcAddr } = await setup();
    await expect(pool.connect(alice).deposit(usdcAddr, 0n))
      .to.be.revertedWithCustomError(pool, "AmountZero");
  });

  it("reverts when supply cap exceeded", async () => {
    const { pool, oracle, strategy, xUSDC, owner, alice } = await setup();
    // New pool with cap of 500 USDC
    const cappedPool = await (await ethers.getContractFactory("LendingPool")).deploy(
      await oracle.getAddress(), await strategy.getAddress()
    );
    const usdcAddr = await xUSDC.getAddress();
    await cappedPool.initReserve(usdcAddr, 6, true, 8000, 8500, 10500, ethers.parseUnits("500", 6));
    const amount = ethers.parseUnits("600", 6);
    await xUSDC.connect(alice).approve(await cappedPool.getAddress(), amount);
    await expect(cappedPool.connect(alice).deposit(usdcAddr, amount))
      .to.be.revertedWithCustomError(cappedPool, "SupplyCapExceeded");
  });
});

// ── Withdraw ───────────────────────────────────────────────────────────────

describe("LendingPool — withdraw", () => {
  it("returns tokens to user", async () => {
    const { pool, xUSDC, alice, poolAddr, usdcAddr } = await setup();
    const amount = ethers.parseUnits("1000", 6);
    await xUSDC.connect(alice).approve(poolAddr, amount);
    await pool.connect(alice).deposit(usdcAddr, amount);

    const before = await xUSDC.balanceOf(alice.address);
    await pool.connect(alice).withdraw(usdcAddr, amount);
    const after = await xUSDC.balanceOf(alice.address);
    expect(after - before).to.equal(amount);
  });

  it("reverts when withdrawing more than supplied", async () => {
    const { pool, xUSDC, alice, poolAddr, usdcAddr } = await setup();
    const amount = ethers.parseUnits("500", 6);
    await xUSDC.connect(alice).approve(poolAddr, amount);
    await pool.connect(alice).deposit(usdcAddr, amount);
    // Real balance = amount at t=0; trying amount+1 should fail
    await expect(pool.connect(alice).withdraw(usdcAddr, amount + 1n))
      .to.be.revertedWithCustomError(pool, "InsufficientBalance");
  });

  it("reverts on zero amount", async () => {
    const { pool, alice, usdcAddr } = await setup();
    await expect(pool.connect(alice).withdraw(usdcAddr, 0n))
      .to.be.revertedWithCustomError(pool, "AmountZero");
  });
});

// ── Borrow ─────────────────────────────────────────────────────────────────

describe("LendingPool — borrow", () => {
  async function setupWithLiquidity() {
    const s = await setup();
    // bob seeds pool with USDC
    const seed = ethers.parseUnits("5000", 6);
    await s.xUSDC.connect(s.bob).approve(s.poolAddr, seed);
    await s.pool.connect(s.bob).deposit(s.usdcAddr, seed);
    // alice deposits BTC collateral
    const btc = ethers.parseUnits("0.1", 8); // 0.1 BTC = $6,000
    await s.xclrBTC.connect(s.alice).approve(s.poolAddr, btc);
    await s.pool.connect(s.alice).deposit(s.btcAddr, btc);
    return s;
  }

  it("borrows USDC against BTC collateral", async () => {
    const { pool, alice, usdcAddr } = await setupWithLiquidity();
    // 0.1 BTC × $60k × 70% LTV = $4,200 max
    const borrowAmount = ethers.parseUnits("3000", 6);
    await pool.connect(alice).borrow(usdcAddr, borrowAmount);
    // At t=0 index = RAY, so real borrow == borrow amount
    expect(await pool.getUserBorrowBalance(usdcAddr, alice.address)).to.equal(borrowAmount);
  });

  it("reverts when overborrowing beyond LTV", async () => {
    const { pool, alice, usdcAddr } = await setupWithLiquidity();
    // Try $5,000 > $4,200 max
    const tooMuch = ethers.parseUnits("5000", 6);
    await expect(pool.connect(alice).borrow(usdcAddr, tooMuch))
      .to.be.revertedWithCustomError(pool, "HealthFactorTooLow");
  });

  it("reverts borrowing non-borrowable token", async () => {
    const { pool, alice, btcAddr } = await setupWithLiquidity();
    await expect(pool.connect(alice).borrow(btcAddr, 1n))
      .to.be.revertedWithCustomError(pool, "BorrowingNotEnabled");
  });

  it("reverts when pool has insufficient liquidity", async () => {
    const { pool, alice, usdcAddr } = await setupWithLiquidity();
    const tooMuch = ethers.parseUnits("6000", 6); // more than pool
    await expect(pool.connect(alice).borrow(usdcAddr, tooMuch))
      .to.be.revertedWithCustomError(pool, "InsufficientLiquidity");
  });
});

// ── Repay ──────────────────────────────────────────────────────────────────

describe("LendingPool — repay", () => {
  async function setupWithDebt() {
    const s = await setup();
    const seed = ethers.parseUnits("5000", 6);
    await s.xUSDC.connect(s.bob).approve(s.poolAddr, seed);
    await s.pool.connect(s.bob).deposit(s.usdcAddr, seed);
    const btc = ethers.parseUnits("0.1", 8);
    await s.xclrBTC.connect(s.alice).approve(s.poolAddr, btc);
    await s.pool.connect(s.alice).deposit(s.btcAddr, btc);
    const borrowAmount = ethers.parseUnits("1000", 6);
    await s.pool.connect(s.alice).borrow(s.usdcAddr, borrowAmount);
    return { ...s, borrowAmount };
  }

  it("clears debt after full repay", async () => {
    const { pool, xUSDC, alice, usdcAddr, poolAddr, borrowAmount } = await setupWithDebt();
    // Overpay by 2x so repay() caps to realDebt (inclusive of any accrued interest)
    const overpay = borrowAmount * 2n;
    await xUSDC.ownerMint(alice.address, overpay);
    await xUSDC.connect(alice).approve(poolAddr, overpay);
    await pool.connect(alice).repay(usdcAddr, overpay);
    expect(await pool.getUserBorrowBalance(usdcAddr, alice.address)).to.equal(0n);
  });

  it("caps repay at actual debt (overpay)", async () => {
    const { pool, xUSDC, alice, usdcAddr, poolAddr, borrowAmount } = await setupWithDebt();
    const overpay = borrowAmount * 2n;
    await xUSDC.connect(alice).approve(poolAddr, overpay);
    await pool.connect(alice).repay(usdcAddr, overpay);
    // Debt should be zero (capped at real debt)
    expect(await pool.getUserBorrowBalance(usdcAddr, alice.address)).to.equal(0n);
  });
});

// ── Liquidation ─────────────────────────────────────────────────────────────

describe("LendingPool — liquidation", () => {
  async function setupLiquidatable() {
    const s = await setup();
    const seed = ethers.parseUnits("5000", 6);
    await s.xUSDC.connect(s.bob).approve(s.poolAddr, seed);
    await s.pool.connect(s.bob).deposit(s.usdcAddr, seed);

    // alice deposits 0.1 BTC ($6,000), borrows $4,000 USDC (HF = 6000×0.75/4000 = 1.125)
    const btc = ethers.parseUnits("0.1", 8);
    await s.xclrBTC.connect(s.alice).approve(s.poolAddr, btc);
    await s.pool.connect(s.alice).deposit(s.btcAddr, btc);
    await s.pool.connect(s.alice).borrow(s.usdcAddr, ethers.parseUnits("4000", 6));

    // BTC price drops to $40,000 → collateral = $4,000×0.75 = $3,000 < $4,000 debt → HF = 0.75
    await s.btcFeed.setAnswer(40_000n * 10n ** 8n);

    // Fund liquidator with USDC
    await s.xUSDC.ownerMint(s.liquidator.address, ethers.parseUnits("5000", 6));

    return s;
  }

  it("liquidator seizes collateral when HF < 1", async () => {
    const { pool, xUSDC, xclrBTC, liquidator, alice, usdcAddr, btcAddr, poolAddr } = await setupLiquidatable();

    const collBefore = await xclrBTC.balanceOf(liquidator.address);
    await xUSDC.connect(liquidator).approve(poolAddr, ethers.parseUnits("2000", 6));
    await pool.connect(liquidator).liquidate(
      alice.address, usdcAddr, btcAddr, ethers.parseUnits("2000", 6)
    );
    const collAfter = await xclrBTC.balanceOf(liquidator.address);

    // Liquidator received some BTC
    expect(collAfter).to.be.gt(collBefore);
    // Alice's debt reduced (real borrow balance is now less than original 4000 USDC)
    expect(await pool.getUserBorrowBalance(usdcAddr, alice.address))
      .to.be.lt(ethers.parseUnits("4000", 6));
  });

  it("reverts liquidation when HF >= 1 (healthy position)", async () => {
    const { pool, xUSDC, alice, bob, liquidator, usdcAddr, btcAddr, poolAddr } = await setup();
    // Set up a healthy position
    const seed = ethers.parseUnits("5000", 6);
    await xUSDC.connect(bob).approve(poolAddr, seed);
    await pool.connect(bob).deposit(usdcAddr, seed);
    const btc = ethers.parseUnits("0.1", 8);
    const xclrBTC = await ethers.getContractAt("MockERC20", btcAddr);
    await xclrBTC.connect(alice).approve(poolAddr, btc);
    await pool.connect(alice).deposit(btcAddr, btc);
    await pool.connect(alice).borrow(usdcAddr, ethers.parseUnits("1000", 6));
    // HF is healthy (~4.5) — should not be liquidatable
    await xUSDC.ownerMint(liquidator.address, ethers.parseUnits("2000", 6));
    await xUSDC.connect(liquidator).approve(poolAddr, ethers.parseUnits("500", 6));
    await expect(
      pool.connect(liquidator).liquidate(alice.address, usdcAddr, btcAddr, ethers.parseUnits("500", 6))
    ).to.be.revertedWithCustomError(pool, "NotLiquidatable");
  });

  it("reverts self-liquidation", async () => {
    const { pool, xUSDC, alice, usdcAddr, btcAddr, poolAddr } = await setupLiquidatable();
    await xUSDC.connect(alice).approve(poolAddr, ethers.parseUnits("2000", 6));
    await expect(
      pool.connect(alice).liquidate(alice.address, usdcAddr, btcAddr, ethers.parseUnits("2000", 6))
    ).to.be.revertedWithCustomError(pool, "SelfLiquidation");
  });
});
