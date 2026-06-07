import { expect } from "chai";
import { ethers } from "hardhat";

const RAY = 10n ** 27n;

// End-to-end scenario: supply → borrow → price crash → liquidation → health restored
describe("Integration — full user lifecycle", () => {
  it("complete flow: deposit, borrow, price crash, liquidation", async () => {
    const [owner, alice, bob, liquidator] = await ethers.getSigners();

    // ── Deploy ────────────────────────────────────────────────────────
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    const xUSDC   = await TokenFactory.deploy("Arc Testnet USD",  "xUSDC",   6);
    const xclrBTC = await TokenFactory.deploy("Arc Testnet BTC",  "xclrBTC", 8);

    const oracle = await (await ethers.getContractFactory("MockPriceOracle")).deploy();
    await oracle.setPrice(await xUSDC.getAddress(),   ethers.parseEther("1"));
    await oracle.setPrice(await xclrBTC.getAddress(), ethers.parseEther("60000"));

    const strategy = await (await ethers.getContractFactory("InterestRateStrategy")).deploy(
      RAY * 5n / 100n, RAY * 4n / 100n, RAY * 80n / 100n, RAY * 145n / 100n
    );

    const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
      await oracle.getAddress(), await strategy.getAddress()
    );
    const poolAddr = await pool.getAddress();
    const usdcAddr = await xUSDC.getAddress();
    const btcAddr  = await xclrBTC.getAddress();

    await pool.initReserve(usdcAddr, 6, true,  8000, 8500, 10500, 0);
    await pool.initReserve(btcAddr,  8, false, 7000, 7500, 10500, 0);

    // ── Seed pool (bob = liquidity provider) ─────────────────────────
    const POOL_SEED = ethers.parseUnits("10000", 6);
    await xUSDC.ownerMint(bob.address, POOL_SEED);
    await xUSDC.connect(bob).approve(poolAddr, POOL_SEED);
    await pool.connect(bob).deposit(usdcAddr, POOL_SEED);

    const bobSupply = await pool.getUserSupplyBalance(usdcAddr, bob.address);
    expect(bobSupply).to.equal(POOL_SEED, "Bob supply tracked");

    // ── Alice deposits BTC collateral ─────────────────────────────────
    const BTC_AMOUNT = ethers.parseUnits("0.1", 8); // 0.1 BTC = $6,000
    await xclrBTC.ownerMint(alice.address, BTC_AMOUNT);
    await xclrBTC.connect(alice).approve(poolAddr, BTC_AMOUNT);
    await pool.connect(alice).deposit(btcAddr, BTC_AMOUNT);

    const aliceBTCSupply = await pool.getUserSupplyBalance(btcAddr, alice.address);
    expect(aliceBTCSupply).to.equal(BTC_AMOUNT, "Alice BTC supply tracked");

    // ── Alice borrows USDC ─────────────────────────────────────────────
    // Max LTV: 0.1 BTC × $60k × 70% = $4,200
    const BORROW_AMOUNT = ethers.parseUnits("3000", 6); // $3,000 — safe
    await pool.connect(alice).borrow(usdcAddr, BORROW_AMOUNT);

    const aliceDebt = await pool.getUserBorrowBalance(usdcAddr, alice.address);
    expect(aliceDebt).to.equal(BORROW_AMOUNT, "Alice borrow tracked");

    // ── Verify health factor before price crash ────────────────────────
    const accountBefore = await pool.getUserAccountData(alice.address);
    // HF = 0.1 BTC × $60k × 0.75 / $3000 = $4500/$3000 = 1.5
    expect(accountBefore.healthFactor).to.be.gte(ethers.parseEther("1.4"), "HF >= 1.4 before crash");

    // ── BTC price crashes from $60k to $35k ───────────────────────────
    await oracle.setPrice(btcAddr, ethers.parseEther("35000"));

    // New HF = 0.1 × $35k × 0.75 / $3000 = $2625/$3000 = 0.875 < 1 → LIQUIDATABLE
    const accountAfter = await pool.getUserAccountData(alice.address);
    expect(accountAfter.healthFactor).to.be.lt(ethers.parseEther("1"), "HF < 1 after crash");

    // ── Liquidator repays debt, seizes collateral ─────────────────────
    await xUSDC.ownerMint(liquidator.address, ethers.parseUnits("2000", 6));
    await xUSDC.connect(liquidator).approve(poolAddr, ethers.parseUnits("1500", 6));

    const btcBalBefore = await xclrBTC.balanceOf(liquidator.address);
    await pool.connect(liquidator).liquidate(
      alice.address, usdcAddr, btcAddr, ethers.parseUnits("1500", 6)
    );
    const btcBalAfter = await xclrBTC.balanceOf(liquidator.address);

    // Liquidator received BTC
    expect(btcBalAfter).to.be.gt(btcBalBefore, "Liquidator received BTC");

    // Alice's debt reduced
    const aliceDebtAfter = await pool.getUserBorrowBalance(usdcAddr, alice.address);
    expect(aliceDebtAfter).to.be.lt(BORROW_AMOUNT, "Alice debt reduced after liquidation");

    // ── Alice repays remaining debt ────────────────────────────────────
    // Pass a large overpay amount so repay() caps to real debt (clears fully)
    const remaining = await pool.getUserBorrowBalance(usdcAddr, alice.address);
    if (remaining > 0n) {
      // Overpay by 2x to ensure we cover any interest accrued between query and execution
      const overpay = remaining * 2n;
      await xUSDC.ownerMint(alice.address, overpay);
      await xUSDC.connect(alice).approve(poolAddr, overpay);
      await pool.connect(alice).repay(usdcAddr, overpay);
    }
    expect(await pool.getUserBorrowBalance(usdcAddr, alice.address)).to.equal(0n, "Debt cleared");

    // ── Bob withdraws supply ──────────────────────────────────────────
    // Fetch real balance and withdraw; tiny dust may remain from index rounding
    const bobWithdrawAmount = await pool.getUserSupplyBalance(usdcAddr, bob.address);
    await pool.connect(bob).withdraw(usdcAddr, bobWithdrawAmount);
    // Allow up to 1 token-unit of dust from rounding (interest index math)
    const bobRemaining = await pool.getUserSupplyBalance(usdcAddr, bob.address);
    expect(bobRemaining).to.be.lte(1n, "Bob withdrew all (dust ≤ 1 unit)");
  });

  it("multiple suppliers and borrowers coexist", async () => {
    const [owner, alice, bob, carol] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    const xUSDC   = await TokenFactory.deploy("xUSDC",   "xUSDC",   6);
    const xclrBTC = await TokenFactory.deploy("xclrBTC", "xclrBTC", 8);

    const oracle = await (await ethers.getContractFactory("MockPriceOracle")).deploy();
    await oracle.setPrice(await xUSDC.getAddress(),   ethers.parseEther("1"));
    await oracle.setPrice(await xclrBTC.getAddress(), ethers.parseEther("60000"));

    const strategy = await (await ethers.getContractFactory("InterestRateStrategy")).deploy(
      RAY * 5n / 100n, RAY * 4n / 100n, RAY * 80n / 100n, RAY * 145n / 100n
    );
    const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
      await oracle.getAddress(), await strategy.getAddress()
    );
    const poolAddr = await pool.getAddress();
    const usdcAddr = await xUSDC.getAddress();
    const btcAddr  = await xclrBTC.getAddress();

    await pool.initReserve(usdcAddr, 6, true,  8000, 8500, 10500, 0);
    await pool.initReserve(btcAddr,  8, false, 7000, 7500, 10500, 0);

    // Alice and Bob both supply USDC
    for (const user of [alice, bob]) {
      await xUSDC.ownerMint(user.address, ethers.parseUnits("5000", 6));
      await xUSDC.connect(user).approve(poolAddr, ethers.parseUnits("5000", 6));
      await pool.connect(user).deposit(usdcAddr, ethers.parseUnits("5000", 6));
    }

    // Carol deposits BTC and borrows
    await xclrBTC.ownerMint(carol.address, ethers.parseUnits("0.2", 8));
    await xclrBTC.connect(carol).approve(poolAddr, ethers.parseUnits("0.2", 8));
    await pool.connect(carol).deposit(btcAddr, ethers.parseUnits("0.2", 8));
    await pool.connect(carol).borrow(usdcAddr, ethers.parseUnits("2000", 6));

    // Verify pool state via view functions (real balances)
    // At t=0 indexes = RAY, so totalScaledSupply * RAY / RAY == real amount
    const r = await pool.getReserveData(usdcAddr);
    // totalScaledSupply * liquidityIndex / RAY == 10000 USDC (at index = RAY)
    expect(r.totalScaledSupply).to.equal(ethers.parseUnits("10000", 6));
    // totalScaledBorrow * borrowIndex / RAY == 2000 USDC (at index = RAY)
    expect(r.totalScaledBorrow).to.equal(ethers.parseUnits("2000", 6));
  });
});
