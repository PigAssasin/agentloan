import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockERC20", () => {
  async function deploy(name: string, symbol: string, decimals: number) {
    const [owner, user] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("MockERC20");
    const token = await factory.deploy(name, symbol, decimals);
    return { token, owner, user };
  }

  it("mints up to cap per call", async () => {
    const { token, user } = await deploy("Arc Testnet USD", "xUSDC", 6);
    const cap = await token.mintCap();
    await token.connect(user).mint(user.address, cap);
    expect(await token.balanceOf(user.address)).to.equal(cap);
  });

  it("reverts when amount exceeds cap", async () => {
    const { token, user } = await deploy("Arc Testnet USD", "xUSDC", 6);
    const cap = await token.mintCap();
    await expect(
      token.connect(user).mint(user.address, cap + 1n)
    ).to.be.revertedWithCustomError(token, "MintCapExceeded");
  });

  it("owner can mint unlimited (seed pool)", async () => {
    const { token, owner } = await deploy("Arc Testnet USD", "xUSDC", 6);
    const large = ethers.parseUnits("10000000", 6);
    await token.connect(owner).ownerMint(owner.address, large);
    expect(await token.balanceOf(owner.address)).to.equal(large);
  });

  it("has correct decimals", async () => {
    const { token } = await deploy("Arc Testnet BTC", "xclrBTC", 8);
    expect(await token.decimals()).to.equal(8);
  });

  it("cap is 10,000 units in token decimals", async () => {
    const { token: usdc } = await deploy("xUSDC", "xUSDC", 6);
    const { token: btc  } = await deploy("xclrBTC", "xclrBTC", 8);
    expect(await usdc.mintCap()).to.equal(10_000n * 10n ** 6n);
    expect(await btc.mintCap()).to.equal(10_000n * 10n ** 8n);
  });
});
