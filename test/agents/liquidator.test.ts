import { expect } from "chai";
import { ethers } from "hardhat";

describe("Liquidator integration (local hardhat)", function () {
  let pool: any, xUSDC: any, xCLRBTC: any, btcFeed: any;
  let owner: any, alice: any, bot: any;

  beforeEach(async () => {
    [owner, alice, bot] = await ethers.getSigners();

    const ERC20    = await ethers.getContractFactory("MockERC20");
    const Agg      = await ethers.getContractFactory("MockAggregator");
    const Oracle   = await ethers.getContractFactory("PriceOracle");
    const Strategy = await ethers.getContractFactory("InterestRateStrategy");
    const Pool     = await ethers.getContractFactory("LendingPool");

    xUSDC   = await ERC20.deploy("xUSDC",   "xUSDC",   6);
    xCLRBTC = await ERC20.deploy("xclrBTC", "xclrBTC", 8);
    await xUSDC.ownerMint(owner.address, ethers.parseUnits("1000000", 6));
    await xUSDC.ownerMint(bot.address,   ethers.parseUnits("200000",  6));
    await xCLRBTC.ownerMint(alice.address, ethers.parseUnits("2", 8));

    btcFeed        = await Agg.deploy(8, 100_000_00000000n);
    const usdcFeed = await Agg.deploy(8, 1_00000000n);

    const oracle = await Oracle.deploy();
    await oracle.setFeed(await xCLRBTC.getAddress(), await btcFeed.getAddress());
    await oracle.setFeed(await xUSDC.getAddress(),   await usdcFeed.getAddress());

    const strategy = await Strategy.deploy(500n, 400n, 8000n, 14500n);
    pool = await Pool.deploy(await oracle.getAddress(), await strategy.getAddress());

    await pool.initReserve(await xUSDC.getAddress(),   6, true,  8000, 8500, 10500, ethers.parseUnits("1000000", 6));
    await pool.initReserve(await xCLRBTC.getAddress(), 8, false, 7000, 7500, 10500, ethers.parseUnits("100", 8));

    await xUSDC.approve(await pool.getAddress(), ethers.parseUnits("500000", 6));
    await pool.deposit(await xUSDC.getAddress(), ethers.parseUnits("500000", 6));

    // Alice deposits 1 BTC, borrows $69k USDC (69% LTV)
    await xCLRBTC.connect(alice).approve(await pool.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(alice).deposit(await xCLRBTC.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(alice).borrow(await xUSDC.getAddress(), ethers.parseUnits("69000", 6));
  });

  it("Alice is healthy at $100k BTC", async () => {
    const data = await pool.getUserAccountData(alice.address);
    expect(data.healthFactor).to.be.greaterThan(ethers.parseUnits("1", 18));
  });

  it("Alice becomes liquidatable at $70k BTC (-30%)", async () => {
    await btcFeed.connect(owner).setAnswer(70_000_00000000n);
    const data = await pool.getUserAccountData(alice.address);
    expect(data.healthFactor).to.be.lessThan(ethers.parseUnits("1", 18));
  });

  it("Bot liquidates and receives BTC collateral + 5% bonus", async () => {
    await btcFeed.connect(owner).setAnswer(70_000_00000000n);

    const debt   = await pool.getUserBorrowBalance(await xUSDC.getAddress(), alice.address);
    const repay  = debt / 2n;
    const btcBefore  = await xCLRBTC.balanceOf(bot.address);
    const usdcBefore = await xUSDC.balanceOf(bot.address);

    await xUSDC.connect(bot).approve(await pool.getAddress(), repay);
    await pool.connect(bot).liquidate(alice.address, await xUSDC.getAddress(), await xCLRBTC.getAddress(), repay);

    expect(await xCLRBTC.balanceOf(bot.address)).to.be.greaterThan(btcBefore);
    expect(await xUSDC.balanceOf(bot.address)).to.be.lessThan(usdcBefore);
    expect(await pool.getUserBorrowBalance(await xUSDC.getAddress(), alice.address)).to.be.lessThan(debt);
  });

  it("Bot cannot liquidate a healthy position", async () => {
    await expect(
      pool.connect(bot).liquidate(alice.address, await xUSDC.getAddress(), await xCLRBTC.getAddress(), ethers.parseUnits("1000", 6))
    ).to.be.revertedWithCustomError(pool, "NotLiquidatable");
  });

  it("Cannot self-liquidate", async () => {
    await btcFeed.connect(owner).setAnswer(70_000_00000000n);
    await xCLRBTC.ownerMint(bot.address, ethers.parseUnits("1", 8));
    await xCLRBTC.connect(bot).approve(await pool.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(bot).deposit(await xCLRBTC.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(bot).borrow(await xUSDC.getAddress(), ethers.parseUnits("10000", 6));

    await expect(
      pool.connect(bot).liquidate(bot.address, await xUSDC.getAddress(), await xCLRBTC.getAddress(), ethers.parseUnits("1000", 6))
    ).to.be.revertedWithCustomError(pool, "SelfLiquidation");
  });
});
