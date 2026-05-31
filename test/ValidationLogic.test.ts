import { expect } from "chai";
import { ethers } from "hardhat";

describe("ValidationLogic", () => {
  async function deploy() {
    const factory = await ethers.getContractFactory("ValidationLogicHarness");
    const harness = await factory.deploy();
    return { harness };
  }

  it("calculates health factor correctly — 1.4", async () => {
    const { harness } = await deploy();
    const collUSD = ethers.parseEther("4200"); // $4,200 weighted collateral
    const debtUSD = ethers.parseEther("3000"); // $3,000 debt
    const hf = await harness.calcHealthFactor(collUSD, debtUSD);
    expect(hf).to.equal(ethers.parseEther("1.4"));
  });

  it("returns MAX_UINT256 when no debt", async () => {
    const { harness } = await deploy();
    const hf = await harness.calcHealthFactor(ethers.parseEther("5000"), 0n);
    expect(hf).to.equal(ethers.MaxUint256);
  });

  it("health factor < 1 when undercollateralized", async () => {
    const { harness } = await deploy();
    const hf = await harness.calcHealthFactor(
      ethers.parseEther("2000"),
      ethers.parseEther("3000")
    );
    expect(hf).to.be.lt(ethers.parseEther("1"));
  });

  it("validateHF passes when HF >= 1", async () => {
    const { harness } = await deploy();
    await expect(
      harness.validateHF(ethers.parseEther("4200"), ethers.parseEther("3000"))
    ).to.not.be.reverted;
  });

  it("validateHF reverts when HF < 1", async () => {
    const { harness } = await deploy();
    await expect(
      harness.validateHF(ethers.parseEther("2000"), ethers.parseEther("3000"))
    ).to.be.revertedWithCustomError(harness, "HealthFactorBelowOne");
  });
});
