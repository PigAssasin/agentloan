import { expect } from "chai";
import { ethers } from "hardhat";

const RAY = 10n ** 27n;

async function setup() {
  const [owner, alice, bob, agentWallet] = await ethers.getSigners();

  const TokenFactory = await ethers.getContractFactory("MockERC20");
  const xUSDC   = await TokenFactory.deploy("Arc Testnet USD", "xUSDC",   6);
  const xclrBTC = await TokenFactory.deploy("Arc Testnet BTC", "xclrBTC", 8);

  const oracle = await (await ethers.getContractFactory("MockPriceOracle")).deploy();
  await oracle.setPrice(await xUSDC.getAddress(),   ethers.parseEther("1"));
  await oracle.setPrice(await xclrBTC.getAddress(), ethers.parseEther("60000"));

  const strategy = await (await ethers.getContractFactory("InterestRateStrategy")).deploy(
    RAY * 5n / 100n, RAY * 4n / 100n, RAY * 80n / 100n, RAY * 145n / 100n
  );

  const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
    await oracle.getAddress(), await strategy.getAddress()
  );

  const usdcAddr = await xUSDC.getAddress();
  const btcAddr  = await xclrBTC.getAddress();
  const poolAddr = await pool.getAddress();

  await pool.initReserve(usdcAddr, 6, true,  7000, 7500, 10500, 0);
  await pool.initReserve(btcAddr,  8, false, 7000, 7500, 10500, 0);

  // Mint tokens
  await xUSDC.ownerMint(alice.address,       ethers.parseUnits("10000", 6));
  await xUSDC.ownerMint(bob.address,         ethers.parseUnits("10000", 6));
  await xUSDC.ownerMint(agentWallet.address, ethers.parseUnits("5000",  6));
  await xclrBTC.ownerMint(alice.address,     ethers.parseUnits("1", 8));

  // Bob seeds pool with xUSDC liquidity
  const seed = ethers.parseUnits("5000", 6);
  await xUSDC.connect(bob).approve(poolAddr, seed);
  await pool.connect(bob).deposit(usdcAddr, seed);

  // Alice deposits BTC collateral + borrows xUSDC
  await xclrBTC.connect(alice).approve(poolAddr, ethers.parseUnits("0.5", 8));
  await pool.connect(alice).deposit(btcAddr, ethers.parseUnits("0.5", 8));
  await pool.connect(alice).borrow(usdcAddr, ethers.parseUnits("1000", 6));

  return { pool, xUSDC, xclrBTC, oracle, owner, alice, bob, agentWallet, usdcAddr, btcAddr, poolAddr };
}

// ── authorizeAgent ─────────────────────────────────────────────────────────

describe("LendingPool — authorizeAgent", () => {
  it("user can authorize an agent", async () => {
    const { pool, alice, agentWallet } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);
    expect(await pool.agentAuthorized(alice.address, agentWallet.address)).to.be.true;
  });

  it("user can revoke an agent", async () => {
    const { pool, alice, agentWallet } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);
    await pool.connect(alice).authorizeAgent(agentWallet.address, false);
    expect(await pool.agentAuthorized(alice.address, agentWallet.address)).to.be.false;
  });

  it("reverts on zero address agent", async () => {
    const { pool, alice } = await setup();
    await expect(pool.connect(alice).authorizeAgent(ethers.ZeroAddress, true))
      .to.be.revertedWith("zero agent");
  });

  it("emits AgentAuthorized event", async () => {
    const { pool, alice, agentWallet } = await setup();
    await expect(pool.connect(alice).authorizeAgent(agentWallet.address, true))
      .to.emit(pool, "AgentAuthorized")
      .withArgs(alice.address, agentWallet.address, true);
  });
});

// ── depositFor ─────────────────────────────────────────────────────────────

describe("LendingPool — depositFor", () => {
  it("agent supplies on behalf of user — position credited to user", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();

    await pool.connect(alice).authorizeAgent(agentWallet.address, true);
    const amount = ethers.parseUnits("500", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, amount);

    const supplyBefore = await pool.getUserSupplyBalance(usdcAddr, alice.address);
    await pool.connect(agentWallet).depositFor(alice.address, usdcAddr, amount);
    const supplyAfter = await pool.getUserSupplyBalance(usdcAddr, alice.address);

    expect(supplyAfter - supplyBefore).to.be.closeTo(amount, 2n);
  });

  it("tokens pulled from agent wallet, NOT from user", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);

    const amount = ethers.parseUnits("500", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, amount);

    const agentBalBefore = await xUSDC.balanceOf(agentWallet.address);
    const aliceBalBefore = await xUSDC.balanceOf(alice.address);

    await pool.connect(agentWallet).depositFor(alice.address, usdcAddr, amount);

    expect(await xUSDC.balanceOf(agentWallet.address)).to.equal(agentBalBefore - amount);
    expect(await xUSDC.balanceOf(alice.address)).to.equal(aliceBalBefore); // alice balance unchanged
  });

  it("reverts if agent not authorized", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    const amount = ethers.parseUnits("100", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, amount);
    await expect(pool.connect(agentWallet).depositFor(alice.address, usdcAddr, amount))
      .to.be.revertedWith("agent not authorized");
  });

  it("reverts on zero amount", async () => {
    const { pool, alice, agentWallet, usdcAddr } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);
    await expect(pool.connect(agentWallet).depositFor(alice.address, usdcAddr, 0n))
      .to.be.revertedWithCustomError(pool, "AmountZero");
  });

  it("emits Deposit event with user as beneficiary", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);
    const amount = ethers.parseUnits("200", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, amount);
    await expect(pool.connect(agentWallet).depositFor(alice.address, usdcAddr, amount))
      .to.emit(pool, "Deposit")
      .withArgs(usdcAddr, alice.address, amount);
  });
});

// ── withdrawFor ────────────────────────────────────────────────────────────

describe("LendingPool — withdrawFor", () => {
  it("agent withdraws from user's position — tokens go to agent", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);

    // First agent deposits some xUSDC for alice
    const depositAmt = ethers.parseUnits("500", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, depositAmt);
    await pool.connect(agentWallet).depositFor(alice.address, usdcAddr, depositAmt);

    // Then agent withdraws to itself
    const withdrawAmt = ethers.parseUnits("200", 6);
    const agentBalBefore = await xUSDC.balanceOf(agentWallet.address);
    await pool.connect(agentWallet).withdrawFor(alice.address, usdcAddr, withdrawAmt, agentWallet.address);

    expect(await xUSDC.balanceOf(agentWallet.address)).to.equal(agentBalBefore + withdrawAmt);
  });

  it("user supply balance decreases by withdrawn amount", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);

    const depositAmt = ethers.parseUnits("500", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, depositAmt);
    await pool.connect(agentWallet).depositFor(alice.address, usdcAddr, depositAmt);

    const supplyBefore = await pool.getUserSupplyBalance(usdcAddr, alice.address);
    const withdrawAmt  = ethers.parseUnits("300", 6);
    await pool.connect(agentWallet).withdrawFor(alice.address, usdcAddr, withdrawAmt, agentWallet.address);
    const supplyAfter  = await pool.getUserSupplyBalance(usdcAddr, alice.address);

    expect(supplyBefore - supplyAfter).to.be.closeTo(withdrawAmt, 1n);
  });

  it("reverts if agent not authorized", async () => {
    const { pool, alice, agentWallet, usdcAddr } = await setup();
    await expect(
      pool.connect(agentWallet).withdrawFor(alice.address, usdcAddr, ethers.parseUnits("100", 6), agentWallet.address)
    ).to.be.revertedWith("agent not authorized");
  });

  it("reverts if amount exceeds user supply", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);
    const depositAmt = ethers.parseUnits("100", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, depositAmt);
    await pool.connect(agentWallet).depositFor(alice.address, usdcAddr, depositAmt);

    await expect(
      pool.connect(agentWallet).withdrawFor(alice.address, usdcAddr, ethers.parseUnits("200", 6), agentWallet.address)
    ).to.be.revertedWithCustomError(pool, "InsufficientBalance");
  });

  it("emits Withdraw event with user as subject", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    await pool.connect(alice).authorizeAgent(agentWallet.address, true);
    const depositAmt = ethers.parseUnits("500", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, depositAmt);
    await pool.connect(agentWallet).depositFor(alice.address, usdcAddr, depositAmt);

    const withdrawAmt = ethers.parseUnits("100", 6);
    await expect(pool.connect(agentWallet).withdrawFor(alice.address, usdcAddr, withdrawAmt, agentWallet.address))
      .to.emit(pool, "Withdraw")
      .withArgs(usdcAddr, alice.address, withdrawAmt);
  });
});

// ── repayFor ───────────────────────────────────────────────────────────────

describe("LendingPool — repayFor", () => {
  it("agent repays borrower's debt — debt decreases", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    // Alice already borrowed 1000 xUSDC in setup

    const debtBefore  = await pool.getUserBorrowBalance(usdcAddr, alice.address);
    const repayAmount = ethers.parseUnits("500", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, repayAmount);
    await pool.connect(agentWallet).repayFor(alice.address, usdcAddr, repayAmount);
    const debtAfter = await pool.getUserBorrowBalance(usdcAddr, alice.address);

    // debt reduction ≈ repayAmount (small rounding from interest index)
    expect(debtBefore - debtAfter).to.be.closeTo(repayAmount, 10n);
  });

  it("anyone can repay — no authorization needed", async () => {
    const { pool, xUSDC, alice, bob, usdcAddr, poolAddr } = await setup();
    // Bob (unrelated) can repay Alice's debt
    const repayAmount = ethers.parseUnits("200", 6);
    await xUSDC.connect(bob).approve(poolAddr, repayAmount);
    await expect(pool.connect(bob).repayFor(alice.address, usdcAddr, repayAmount))
      .to.not.be.reverted;
  });

  it("tokens pulled from msg.sender (agent), NOT from borrower", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    const repayAmount = ethers.parseUnits("300", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, repayAmount);

    const agentBalBefore = await xUSDC.balanceOf(agentWallet.address);
    const aliceBalBefore = await xUSDC.balanceOf(alice.address);

    await pool.connect(agentWallet).repayFor(alice.address, usdcAddr, repayAmount);

    expect(await xUSDC.balanceOf(agentWallet.address)).to.be.lt(agentBalBefore);
    expect(await xUSDC.balanceOf(alice.address)).to.equal(aliceBalBefore); // alice unchanged
  });

  it("caps repay at actual debt — no overpay", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    const debt = await pool.getUserBorrowBalance(usdcAddr, alice.address);
    const overpay = debt * 2n;
    await xUSDC.connect(agentWallet).approve(poolAddr, overpay);
    await pool.connect(agentWallet).repayFor(alice.address, usdcAddr, overpay);
    expect(await pool.getUserBorrowBalance(usdcAddr, alice.address)).to.equal(0n);
  });

  it("reverts on zero amount", async () => {
    const { pool, alice, agentWallet, usdcAddr } = await setup();
    await expect(pool.connect(agentWallet).repayFor(alice.address, usdcAddr, 0n))
      .to.be.revertedWithCustomError(pool, "AmountZero");
  });

  it("emits Repay event with borrower as subject", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    const repayAmount = ethers.parseUnits("100", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, repayAmount);
    await expect(pool.connect(agentWallet).repayFor(alice.address, usdcAddr, repayAmount))
      .to.emit(pool, "Repay")
      .withArgs(usdcAddr, alice.address, repayAmount);
  });

  it("HF improves after repayFor", async () => {
    const { pool, xUSDC, alice, agentWallet, usdcAddr, poolAddr } = await setup();
    const hfBefore = (await pool.getUserAccountData(alice.address)).healthFactor;
    const repayAmount = ethers.parseUnits("500", 6);
    await xUSDC.connect(agentWallet).approve(poolAddr, repayAmount);
    await pool.connect(agentWallet).repayFor(alice.address, usdcAddr, repayAmount);
    const hfAfter = (await pool.getUserAccountData(alice.address)).healthFactor;
    expect(hfAfter).to.be.gt(hfBefore);
  });
});

// ── AgentExecutor ──────────────────────────────────────────────────────────

describe("AgentExecutor", () => {
  async function setupExecutor() {
    const s = await setup();
    const executor = await (await ethers.getContractFactory("AgentExecutor")).deploy(
      s.poolAddr,
      s.usdcAddr
    );
    const executorAddr = await executor.getAddress();

    // Authorize executor as agent in pool (for alice)
    await s.pool.connect(s.alice).authorizeAgent(executorAddr, true);

    // Set agentWallet as authorized caller in executor
    await executor.connect(s.owner).setAgent(s.agentWallet.address, true);

    return { ...s, executor, executorAddr };
  }

  it("setAgent: owner can authorize agent wallet", async () => {
    const { executor, agentWallet } = await setupExecutor();
    expect(await executor.authorizedAgents(agentWallet.address)).to.be.true;
  });

  it("setAgent: non-owner cannot authorize", async () => {
    const { executor, alice } = await setupExecutor();
    await expect(executor.connect(alice).setAgent(alice.address, true))
      .to.be.revertedWithCustomError(executor, "OwnableUnauthorizedAccount");
  });

  it("deployToYield: pulls xUSDC from user → supply credited to user", async () => {
    const { pool, xUSDC, alice, agentWallet, executor, executorAddr, usdcAddr } = await setupExecutor();

    const amount = ethers.parseUnits("500", 6);
    // Alice approves executor to pull her xUSDC
    await xUSDC.connect(alice).approve(executorAddr, amount);

    const supplyBefore = await pool.getUserSupplyBalance(usdcAddr, alice.address);
    await executor.connect(agentWallet).deployToYield(alice.address, amount);
    const supplyAfter  = await pool.getUserSupplyBalance(usdcAddr, alice.address);

    expect(supplyAfter - supplyBefore).to.be.closeTo(amount, 2n);
  });

  it("deployToYield: unauthorized caller reverts", async () => {
    const { xUSDC, alice, executor, executorAddr } = await setupExecutor();
    await xUSDC.connect(alice).approve(executorAddr, ethers.parseUnits("100", 6));
    await expect(executor.connect(alice).deployToYield(alice.address, ethers.parseUnits("100", 6)))
      .to.be.revertedWithCustomError(executor, "NotAgent");
  });

  it("emergencyProtect: withdraw + repay in 1 tx — HF improves", async () => {
    const { pool, xUSDC, alice, agentWallet, executor, executorAddr, usdcAddr } = await setupExecutor();

    // First give alice a supply position for agent to withdraw from
    const depositAmt = ethers.parseUnits("800", 6);
    await xUSDC.connect(agentWallet).approve(executorAddr, depositAmt);

    // Agent deposits via executor (agentWallet → alice's supply)
    // Actually deployToYield pulls from alice, so let's fund alice and have her approve
    await xUSDC.ownerMint(alice.address, depositAmt);
    await xUSDC.connect(alice).approve(executorAddr, depositAmt);
    await executor.connect(agentWallet).deployToYield(alice.address, depositAmt);

    const hfBefore    = (await pool.getUserAccountData(alice.address)).healthFactor;
    const repayAmount = ethers.parseUnits("500", 6);

    await executor.connect(agentWallet).emergencyProtect(alice.address, repayAmount);

    const hfAfter = (await pool.getUserAccountData(alice.address)).healthFactor;
    expect(hfAfter).to.be.gt(hfBefore);
  });

  it("emergencyProtect: reverts if supply < repayAmount", async () => {
    const { agentWallet, executor, alice } = await setupExecutor();
    // Alice has no xUSDC supply — trying to withdraw 100 should revert
    await expect(
      executor.connect(agentWallet).emergencyProtect(alice.address, ethers.parseUnits("100", 6))
    ).to.be.revertedWithCustomError(executor, "InsufficientSupply");
  });

  it("emergencyProtect: unauthorized caller reverts", async () => {
    const { alice, executor } = await setupExecutor();
    await expect(
      executor.connect(alice).emergencyProtect(alice.address, ethers.parseUnits("100", 6))
    ).to.be.revertedWithCustomError(executor, "NotAgent");
  });

  it("emergencyProtect: atomic withdraw+repay improves HF", async () => {
    const { pool, xUSDC, oracle, agentWallet, executor, executorAddr, usdcAddr, btcAddr, poolAddr, owner } = await setupExecutor();

    // Deploy a fresh scenario: carol borrows near max LTV
    const [,,, carol] = await ethers.getSigners();
    const xclrBTC = await ethers.getContractAt("MockERC20", btcAddr);
    await (xclrBTC as any).ownerMint(carol.address, ethers.parseUnits("0.5", 8));
    await xUSDC.ownerMint(carol.address, ethers.parseUnits("2000", 6));

    // Seed pool with enough xUSDC for carol's borrow
    await xUSDC.ownerMint(owner.address, ethers.parseUnits("20000", 6));
    await xUSDC.connect(owner).approve(poolAddr, ethers.parseUnits("20000", 6));
    await pool.connect(owner).deposit(usdcAddr, ethers.parseUnits("20000", 6));

    await xclrBTC.connect(carol).approve(poolAddr, ethers.parseUnits("0.5", 8));
    await pool.connect(carol).deposit(btcAddr, ethers.parseUnits("0.5", 8));
    // Borrow near max: 0.5 BTC × $60k × 70% LTV = $21k max — borrow $18k
    await pool.connect(carol).borrow(usdcAddr, ethers.parseUnits("18000", 6));

    // HF before = (0.5 × 60000 × 0.75) / 18000 = 1.25
    const hfBefore = (await pool.getUserAccountData(carol.address)).healthFactor;
    expect(hfBefore).to.be.closeTo(ethers.parseEther("1.25"), ethers.parseEther("0.05"));

    // Authorize executor for carol
    await pool.connect(carol).authorizeAgent(executorAddr, true);

    // Carol supplies xUSDC as repay reserve
    const depositAmt = ethers.parseUnits("2000", 6);
    await xUSDC.connect(carol).approve(executorAddr, depositAmt);
    await executor.connect(agentWallet).deployToYield(carol.address, depositAmt);

    // BTC price drops → HF dips
    await oracle.setPrice(btcAddr, ethers.parseEther("45000"));
    const hfAfterDrop = (await pool.getUserAccountData(carol.address)).healthFactor;

    // Emergency protect: withdraw carol's supply → repay carol's debt — 1 atomic tx
    await expect(
      executor.connect(agentWallet).emergencyProtect(carol.address, ethers.parseUnits("1500", 6))
    ).to.not.be.reverted;

    const hfFinal = (await pool.getUserAccountData(carol.address)).healthFactor;
    expect(hfFinal).to.be.gt(hfAfterDrop);
  });
});
