import { expect } from "chai";
import { ethers } from "hardhat";

describe("pool-reader logic (local hardhat)", function () {
  let pool: any, xUSDC: any, xCLRBTC: any;
  let owner: any, alice: any;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    const ERC20    = await ethers.getContractFactory("MockERC20");
    const Agg      = await ethers.getContractFactory("MockAggregator");
    const Oracle   = await ethers.getContractFactory("PriceOracle");
    const Strategy = await ethers.getContractFactory("InterestRateStrategy");
    const Pool     = await ethers.getContractFactory("LendingPool");

    // 3-arg constructor
    xUSDC   = await ERC20.deploy("xUSDC",   "xUSDC",   6);
    xCLRBTC = await ERC20.deploy("xclrBTC", "xclrBTC", 8);
    await xUSDC.ownerMint(owner.address,   ethers.parseUnits("1000000", 6));
    await xCLRBTC.ownerMint(owner.address, ethers.parseUnits("100",     8));
    await xCLRBTC.ownerMint(alice.address, ethers.parseUnits("2",       8));

    // 2-arg constructor (decimals_, initialAnswer)
    const btcFeed  = await Agg.deploy(8, 100_000_00000000n);
    const usdcFeed = await Agg.deploy(8, 1_00000000n);

    const oracle = await Oracle.deploy();
    await oracle.setFeed(await xCLRBTC.getAddress(), await btcFeed.getAddress());
    await oracle.setFeed(await xUSDC.getAddress(),   await usdcFeed.getAddress());

    // 4-arg constructor
    const strategy = await Strategy.deploy(500n, 400n, 8000n, 14500n);
    pool = await Pool.deploy(await oracle.getAddress(), await strategy.getAddress());

    await pool.initReserve(await xUSDC.getAddress(),   6, true,  8000, 8500, 10500, ethers.parseUnits("1000000", 6));
    await pool.initReserve(await xCLRBTC.getAddress(), 8, false, 7000, 7500, 10500, ethers.parseUnits("100", 8));

    // Seed pool
    await xUSDC.approve(await pool.getAddress(), ethers.parseUnits("500000", 6));
    await pool.deposit(await xUSDC.getAddress(), ethers.parseUnits("500000", 6));
  });

  it("getUserAccountData returns MaxUint256 HF when no debt", async () => {
    const data = await pool.getUserAccountData(alice.address);
    expect(data.healthFactor).to.equal(ethers.MaxUint256);
    expect(data.totalDebtUSD).to.equal(0n);
  });

  it("getUserAccountData returns finite HF after borrow", async () => {
    await xCLRBTC.connect(alice).approve(await pool.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(alice).deposit(await xCLRBTC.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(alice).borrow(await xUSDC.getAddress(), ethers.parseUnits("50000", 6));

    const data = await pool.getUserAccountData(alice.address);
    expect(data.healthFactor).to.be.lessThan(ethers.MaxUint256);
    expect(data.healthFactor).to.be.greaterThan(0n);
    expect(data.totalDebtUSD).to.be.greaterThan(0n);
  });

  it("getReserveData returns currentBorrowRate > 0 after borrow", async () => {
    await xCLRBTC.connect(alice).approve(await pool.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(alice).deposit(await xCLRBTC.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(alice).borrow(await xUSDC.getAddress(), ethers.parseUnits("10000", 6));

    const reserve = await pool.getReserveData(await xUSDC.getAddress());
    // Named struct fields — access by name not index
    expect(reserve.currentBorrowRate).to.be.greaterThan(0n);
    expect(reserve.currentLiquidityRate).to.be.greaterThan(0n);
  });
});
