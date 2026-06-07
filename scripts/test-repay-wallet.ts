/**
 * Test repayFromWallet manually to see what error occurs
 */
import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const USER    = "0xcafd5319ba356f1effdfd09dd8996d6d0c169d72";
const AMOUNT  = ethers.parseUnits("100", 6); // try $100

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const executor = new ethers.Contract(ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, [
    "function repayFromWallet(address,uint256) external",
    "function authorizedAgents(address) external view returns (bool)",
  ], deployer);

  const xUSDC = new ethers.Contract(ARC_TESTNET_CONTRACTS.X_USDC, [
    "function allowance(address,address) external view returns (uint256)",
    "function balanceOf(address) external view returns (uint256)",
  ], deployer);

  const pool = new ethers.Contract(ARC_TESTNET_CONTRACTS.LENDING_POOL, [
    "function getUserBorrowBalance(address,address) external view returns (uint256)",
  ], deployer);

  console.log("Executor auth (deployer):", await executor.authorizedAgents(deployer.address));

  const allowance = await xUSDC.allowance(USER, ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR);
  console.log("User allowance to executor:", ethers.formatUnits(allowance, 6));

  const balance = await xUSDC.balanceOf(USER);
  console.log("User xUSDC balance:", ethers.formatUnits(balance, 6));

  const debt = await pool.getUserBorrowBalance(ARC_TESTNET_CONTRACTS.X_USDC, USER);
  console.log("User xUSDC debt:", ethers.formatUnits(debt, 6));

  console.log("\nCalling repayFromWallet($100)...");
  try {
    const tx = await executor.repayFromWallet(USER, AMOUNT);
    const receipt = await tx.wait();
    console.log("SUCCESS! TX:", tx.hash);
  } catch (e: any) {
    console.log("REVERT:", e.message?.slice(0, 300));
    // Try to decode the error
    if (e.data) console.log("Error data:", e.data);
  }
}

main().catch(console.error);
