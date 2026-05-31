import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PriceOracle", () => {
  async function deploy() {
    const [owner] = await ethers.getSigners();

    const AggFactory = await ethers.getContractFactory("MockAggregator");
    const btcFeed  = await AggFactory.deploy(8, 60_000n * 10n ** 8n); // $60,000
    const eurFeed  = await AggFactory.deploy(8, 108_000_000n);         // $1.08
    const usdcFeed = await AggFactory.deploy(8, 100_000_000n);         // $1.00

    const OracleFactory = await ethers.getContractFactory("PriceOracle");
    const oracle = await OracleFactory.deploy();

    const randomToken = ethers.Wallet.createRandom().address;
    await oracle.setFeed(randomToken, await btcFeed.getAddress());

    return { oracle, btcFeed, eurFeed, usdcFeed, owner, randomToken };
  }

  it("returns price normalized to WAD for registered token", async () => {
    const { oracle, randomToken } = await deploy();
    const price = await oracle.getPrice(randomToken);
    // $60,000 → 60000 * 1e18
    expect(price).to.equal(ethers.parseEther("60000"));
  });

  it("normalizes 8-decimal feed to WAD correctly", async () => {
    const { oracle, eurFeed } = await deploy();
    const token2 = ethers.Wallet.createRandom().address;
    await oracle.setFeed(token2, await eurFeed.getAddress());
    const price = await oracle.getPrice(token2);
    // $1.08 → 1.08 * 1e18
    expect(price).to.equal(ethers.parseEther("1.08"));
  });

  it("never goes stale — MockAggregator returns block.timestamp (testnet design)", async () => {
    const { oracle, randomToken } = await deploy();
    await time.increase(3601);
    // MockAggregator always returns block.timestamp as updatedAt — never stale on testnet
    const price = await oracle.getPrice(randomToken);
    expect(price).to.equal(ethers.parseEther("60000"));
  });

  it("reverts for unregistered token", async () => {
    const { oracle } = await deploy();
    const unknown = ethers.Wallet.createRandom().address;
    await expect(
      oracle.getPrice(unknown)
    ).to.be.revertedWithCustomError(oracle, "FeedNotFound");
  });

  it("owner can update feed", async () => {
    const { oracle, eurFeed, randomToken } = await deploy();
    await oracle.setFeed(randomToken, await eurFeed.getAddress());
    const price = await oracle.getPrice(randomToken);
    expect(price).to.equal(ethers.parseEther("1.08"));
  });
});
