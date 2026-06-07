import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

async function main() {
  const pool = await ethers.getContractAt("LendingPool", ARC_TESTNET_CONTRACTS.LENDING_POOL);
  const r = await pool.getReserveData(ARC_TESTNET_CONTRACTS.X_USDC);
  const RAY = 10n ** 27n;
  const borrowApy = Number(BigInt(r.currentBorrowRate) * 10000n / RAY) / 100;
  const supplyApy = Number(BigInt(r.currentLiquidityRate) * 10000n / RAY) / 100;
  const totalSupply = Number(BigInt(r.totalScaledSupply) * BigInt(r.liquidityIndex) / RAY) / 1e6;
  const totalBorrow = Number(BigInt(r.totalScaledBorrow) * BigInt(r.borrowIndex) / RAY) / 1e6;
  const util = totalBorrow / totalSupply;
  console.log(`Supply: $${totalSupply.toFixed(0)}, Borrow: $${totalBorrow.toFixed(0)}`);
  console.log(`Utilization: ${(util*100).toFixed(1)}%`);
  console.log(`Borrow APY: ${borrowApy}%`);
  console.log(`Supply APY: ${supplyApy}%`);
  console.log(`currentLiquidityRate raw: ${r.currentLiquidityRate}`);
}
main().catch(console.error);
