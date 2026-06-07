import { ethers } from "hardhat";

const OLD_ORACLE = "0xf0fcba0e48e53870e451ff57c77cc517337b1c2d";
const ABI = ["function withdrawFees() external", "function owner() external view returns (address)"];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const oracle = new ethers.Contract(OLD_ORACLE, ABI, deployer);

  const owner = await oracle.owner();
  console.log("Oracle owner:", owner);
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Deployer is not oracle owner — cannot withdraw");
  }

  const balanceBefore = await ethers.provider.getBalance(OLD_ORACLE);
  console.log("Oracle balance:", ethers.formatEther(balanceBefore), "USDC");

  if (balanceBefore === 0n) {
    console.log("Nothing to withdraw — balance is 0");
    return;
  }

  const deployerBefore = await ethers.provider.getBalance(deployer.address);
  const tx = await oracle.withdrawFees();
  await tx.wait();
  console.log("TX:", tx.hash);

  const deployerAfter = await ethers.provider.getBalance(deployer.address);
  console.log("Withdrawn:", ethers.formatEther(deployerAfter - deployerBefore), "USDC ✓");
}

main().catch(console.error);
