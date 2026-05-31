import { ethers } from "hardhat";

// Seed the already-deployed pool with initial liquidity
// Run: npx hardhat run scripts/seed.ts --network arcTestnet
//
// Fill in addresses from your deployment:
const ADDRESSES = {
  LENDING_POOL: "0xE0Eea36812451EdA53C23ebc04B7C83bd4c2CF64",
  X_USDC:       "0xF33C81bbA3CC6425a9EfAe70A2352420f2026230",
  X_EURC:       "0xe35d66f369b529F8D3d008447F2a0Ebb065fE32F",
  X_CLR_BTC:    "0x55BF14097bff153655e390A760F30c04BFd1Cc2B",
};

const USDC_SEED   = ethers.parseUnits("500000", 6);  // 500k xUSDC
const EURC_SEED   = ethers.parseUnits("200000", 6);  // 200k xEURC
const BTC_SEED    = ethers.parseUnits("10",     8);  // 10 xclrBTC

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeding with:", deployer.address);

  const xUSDC   = await ethers.getContractAt("MockERC20", ADDRESSES.X_USDC,    deployer);
  const xEURC   = await ethers.getContractAt("MockERC20", ADDRESSES.X_EURC,    deployer);
  const xclrBTC = await ethers.getContractAt("MockERC20", ADDRESSES.X_CLR_BTC, deployer);
  const pool    = await ethers.getContractAt("LendingPool", ADDRESSES.LENDING_POOL, deployer);

  // Check current balances
  console.log("\nCurrent deployer balances:");
  console.log("  xUSDC:  ", ethers.formatUnits(await xUSDC.balanceOf(deployer.address), 6));
  console.log("  xEURC:  ", ethers.formatUnits(await xEURC.balanceOf(deployer.address), 6));
  console.log("  xclrBTC:", ethers.formatUnits(await xclrBTC.balanceOf(deployer.address), 8));

  // Step 1: Mint
  console.log("\nMinting seed tokens...");
  const tx1 = await xUSDC.connect(deployer).ownerMint(deployer.address, USDC_SEED);
  await tx1.wait();
  console.log("  xUSDC minted");

  const tx2 = await xEURC.connect(deployer).ownerMint(deployer.address, EURC_SEED);
  await tx2.wait();
  console.log("  xEURC minted");

  const tx3 = await xclrBTC.connect(deployer).ownerMint(deployer.address, BTC_SEED);
  await tx3.wait();
  console.log("  xclrBTC minted");

  // Step 2: Approve
  console.log("\nApproving pool...");
  const tx4 = await xUSDC.connect(deployer).approve(ADDRESSES.LENDING_POOL, USDC_SEED);
  await tx4.wait();
  const tx5 = await xEURC.connect(deployer).approve(ADDRESSES.LENDING_POOL, EURC_SEED);
  await tx5.wait();
  const tx6 = await xclrBTC.connect(deployer).approve(ADDRESSES.LENDING_POOL, BTC_SEED);
  await tx6.wait();
  console.log("  All approvals confirmed");

  // Verify approvals
  const usdcAllowance = await xUSDC.allowance(deployer.address, ADDRESSES.LENDING_POOL);
  console.log("  xUSDC allowance:", ethers.formatUnits(usdcAllowance, 6));

  // Step 3: Deposit
  console.log("\nDepositing into pool...");
  const tx7 = await pool.connect(deployer).deposit(ADDRESSES.X_USDC, USDC_SEED);
  await tx7.wait();
  console.log("  xUSDC deposited ✓");

  const tx8 = await pool.connect(deployer).deposit(ADDRESSES.X_EURC, EURC_SEED);
  await tx8.wait();
  console.log("  xEURC deposited ✓");

  const tx9 = await pool.connect(deployer).deposit(ADDRESSES.X_CLR_BTC, BTC_SEED);
  await tx9.wait();
  console.log("  xclrBTC deposited ✓");

  // Verify pool state
  const usdcReserve = await pool.getReserveData(ADDRESSES.X_USDC);
  console.log("\nPool state after seed:");
  console.log("  xUSDC totalSupplied:", ethers.formatUnits(usdcReserve.totalSupplied, 6));

  console.log("\n=== SEED COMPLETE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
