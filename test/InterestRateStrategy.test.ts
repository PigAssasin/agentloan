import { expect } from "chai";
import { ethers } from "hardhat";

const RAY = 10n ** 27n;

describe("InterestRateStrategy", () => {
  async function deploy() {
    const factory = await ethers.getContractFactory("InterestRateStrategy");
    const strategy = await factory.deploy(
      RAY * 5n / 100n,   // 5% base
      RAY * 4n / 100n,   // 4% slope1
      RAY * 80n / 100n,  // 80% kink
      RAY * 145n / 100n  // 145% slope2
    );
    return { strategy };
  }

  it("returns base rate when utilization = 0", async () => {
    const { strategy } = await deploy();
    const [borrowRate] = await strategy.calculateRates(0n, 1000n);
    expect(borrowRate).to.equal(RAY * 5n / 100n);
  });

  it("returns base+slope1 at kink (80% utilization)", async () => {
    const { strategy } = await deploy();
    const supply  = 1000n * 10n ** 6n;
    const borrows = 800n  * 10n ** 6n; // exactly 80%
    const [borrowRate] = await strategy.calculateRates(borrows, supply);
    // 5% + 4% = 9%
    expect(borrowRate).to.equal(RAY * 9n / 100n);
  });

  it("returns higher rate above kink (90% utilization)", async () => {
    const { strategy } = await deploy();
    const supply  = 1000n * 10n ** 6n;
    const borrows = 900n  * 10n ** 6n; // 90%
    const [borrowRate] = await strategy.calculateRates(borrows, supply);
    expect(borrowRate).to.be.gt(RAY * 9n / 100n);
  });

  it("supply rate < borrow rate always", async () => {
    const { strategy } = await deploy();
    const [borrowRate, supplyRate] = await strategy.calculateRates(800n, 1000n);
    expect(supplyRate).to.be.lt(borrowRate);
  });

  it("supply rate = 0 when utilization = 0", async () => {
    const { strategy } = await deploy();
    const [, supplyRate] = await strategy.calculateRates(0n, 1000n);
    expect(supplyRate).to.equal(0n);
  });

  it("utilizationRate returns correct value", async () => {
    const { strategy } = await deploy();
    const util = await strategy.utilizationRate(800n, 1000n);
    // 80% in RAY
    expect(util).to.equal(RAY * 80n / 100n);
  });
});
