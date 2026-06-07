import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const executor = new ethers.Contract(
    ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR,
    ["function setAgent(address,bool) external", "function authorizedAgents(address) external view returns (bool)"],
    deployer,
  );

  const isAuth = await executor.authorizedAgents(deployer.address);
  console.log("Already authorized:", isAuth);
  if (!isAuth) {
    const tx = await executor.setAgent(deployer.address, true);
    await tx.wait();
    console.log("Authorized:", deployer.address, "TX:", tx.hash);
  }
}
main().catch(console.error);
