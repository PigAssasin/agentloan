import { expect } from "chai";
import { ethers } from "hardhat";

describe("Backtest: BTC price crash scenarios", function () {
  let pool: any, xUSDC: any, xCLRBTC: any, btcFeed: any;
  let owner: any, alice: any, bob: any, carol: any, bot: any;

  beforeEach(async () => {
    [owner, alice, bob, carol, bot] = await ethers.getSigners();

    const ERC20    = await ethers.getContractFactory("MockERC20");
    const Agg      = await ethers.getContractFactory("MockAggregator");
    const Oracle   = await ethers.getContractFactory("PriceOracle");
    const Strategy = await ethers.getContractFactory("InterestRateStrategy");
    const Pool     = await ethers.getContractFactory("LendingPool");

    xUSDC   = await ERC20.deploy("xUSDC",   "xUSDC",   6);
    xCLRBTC = await ERC20.deploy("xclrBTC", "xclrBTC", 8);
    await xUSDC.ownerMint(owner.address,  ethers.parseUnits("5000000", 6));
    await xUSDC.ownerMint(bot.address,    ethers.parseUnits("1000000", 6));
    for (const u of [alice, bob, carol]) {
      await xCLRBTC.ownerMint(u.address, ethers.parseUnits("2", 8));
    }

    btcFeed        = await Agg.deploy(8, 60_000_00000000n); // Start $60k
    const usdcFeed = await Agg.deploy(8, 1_00000000n);

    const oracle = await Oracle.deploy();
    await oracle.setFeed(await xCLRBTC.getAddress(), await btcFeed.getAddress());
    await oracle.setFeed(await xUSDC.getAddress(),   await usdcFeed.getAddress());

    const strategy = await Strategy.deploy(500n, 400n, 8000n, 14500n);
    pool = await Pool.deploy(await oracle.getAddress(), await strategy.getAddress());

    await pool.initReserve(await xUSDC.getAddress(),   6, true,  8000, 8500, 10500, ethers.parseUnits("1000000", 6));
    await pool.initReserve(await xCLRBTC.getAddress(), 8, false, 7000, 7500, 10500, ethers.parseUnits("100", 8));

    await xUSDC.approve(await pool.getAddress(), ethers.parseUnits("1000000", 6));
    await pool.deposit(await xUSDC.getAddress(), ethers.parseUnits("1000000", 6));

    // Alice: conservative 40% LTV ($24k on 1 BTC @$60k)
    await xCLRBTC.connect(alice).approve(await pool.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(alice).deposit(await xCLRBTC.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(alice).borrow(await xUSDC.getAddress(), ethers.parseUnits("24000", 6));

    // Bob: aggressive 65% LTV ($39k)
    await xCLRBTC.connect(bob).approve(await pool.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(bob).deposit(await xCLRBTC.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(bob).borrow(await xUSDC.getAddress(), ethers.parseUnits("39000", 6));

    // Carol: very aggressive 69% LTV ($41.4k)
    await xCLRBTC.connect(carol).approve(await pool.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(carol).deposit(await xCLRBTC.getAddress(), ethers.parseUnits("1", 8));
    await pool.connect(carol).borrow(await xUSDC.getAddress(), ethers.parseUnits("41400", 6));
  });

  it("-20% crash ($60k→$48k): Alice safe, Bob+Carol liquidatable", async () => {
    // Alice: $24k debt, $48k × 75% = $36k weighted → HF = 1.5 (safe)
    // Bob:   $39k debt, $48k × 75% = $36k weighted → HF = 0.923 (liquidatable)
    // Carol: $41.4k debt, $48k × 75% = $36k weighted → HF = 0.869 (liquidatable)
    await btcFeed.connect(owner).setAnswer(48_000_00000000n);
    const WAD = ethers.parseUnits("1", 18);
    expect((await pool.getUserAccountData(alice.address)).healthFactor).to.be.greaterThan(WAD);
    expect((await pool.getUserAccountData(bob.address)).healthFactor).to.be.lessThan(WAD);
    expect((await pool.getUserAccountData(carol.address)).healthFactor).to.be.lessThan(WAD);

    // Bot liquidates Bob and Carol
    for (const user of [bob, carol]) {
      const debt  = await pool.getUserBorrowBalance(await xUSDC.getAddress(), user.address);
      const repay = debt / 2n;
      await xUSDC.connect(bot).approve(await pool.getAddress(), repay);
      await pool.connect(bot).liquidate(user.address, await xUSDC.getAddress(), await xCLRBTC.getAddress(), repay);
      expect(await pool.getUserBorrowBalance(await xUSDC.getAddress(), user.address)).to.be.lessThan(debt);
    }

    // Alice is untouched
    await expect(
      pool.connect(bot).liquidate(alice.address, await xUSDC.getAddress(), await xCLRBTC.getAddress(), ethers.parseUnits("1000", 6))
    ).to.be.revertedWithCustomError(pool, "NotLiquidatable");
  });

  it("-40% crash ($60k→$36k): Bob + Carol liquidatable, bot handles both", async () => {
    await btcFeed.connect(owner).setAnswer(36_000_00000000n);
    const WAD = ethers.parseUnits("1", 18);
    expect((await pool.getUserAccountData(alice.address)).healthFactor).to.be.greaterThan(WAD);
    expect((await pool.getUserAccountData(bob.address)).healthFactor).to.be.lessThan(WAD);
    expect((await pool.getUserAccountData(carol.address)).healthFactor).to.be.lessThan(WAD);

    for (const user of [bob, carol]) {
      const debt  = await pool.getUserBorrowBalance(await xUSDC.getAddress(), user.address);
      const repay = debt / 2n;
      await xUSDC.connect(bot).approve(await pool.getAddress(), repay);
      await pool.connect(bot).liquidate(user.address, await xUSDC.getAddress(), await xCLRBTC.getAddress(), repay);
    }

    expect(await pool.getUserBorrowBalance(await xUSDC.getAddress(), bob.address))
      .to.be.lessThan(ethers.parseUnits("39000", 6));
    expect(await pool.getUserBorrowBalance(await xUSDC.getAddress(), carol.address))
      .to.be.lessThan(ethers.parseUnits("41400", 6));
  });

  it("-60% crash ($60k→$24k): all 3 positions liquidatable", async () => {
    await btcFeed.connect(owner).setAnswer(24_000_00000000n);
    const WAD = ethers.parseUnits("1", 18);
    // At -60%, even 40% LTV (Alice) goes under: $24k debt, collateral $24k × 75% = $18k → HF=0.75
    for (const user of [alice, bob, carol]) {
      expect((await pool.getUserAccountData(user.address)).healthFactor).to.be.lessThan(WAD);
    }

    // Bot can liquidate all three
    for (const user of [alice, bob, carol]) {
      const debt  = await pool.getUserBorrowBalance(await xUSDC.getAddress(), user.address);
      const repay = debt / 2n;
      await xUSDC.connect(bot).approve(await pool.getAddress(), repay);
      await pool.connect(bot).liquidate(user.address, await xUSDC.getAddress(), await xCLRBTC.getAddress(), repay);
      expect(await pool.getUserBorrowBalance(await xUSDC.getAddress(), user.address)).to.be.lessThan(debt);
    }
  });
});
