/**
 * Circle Developer-Controlled Wallet integration.
 * Replaces raw private key signing — Circle manages keys server-side.
 * Gas Station on ARC-TESTNET is auto-enabled (no per-tx gas needed).
 *
 * Requires in .env.local:
 *   CIRCLE_API_KEY     — from console.circle.com
 *   CIRCLE_ENTITY_SECRET — 32-byte hex, registered in Circle console
 *   CIRCLE_WALLET_ID   — set after createBotCircleWallet() first run
 */
// On VPS: SDK installed at /root/circle-sdk (separate dir to avoid arcbank npm conflicts)
// Locally: installed in node_modules via npm install @circle-fin/developer-controlled-wallets
let _circleSDK: any;
function getSDK() {
  if (_circleSDK) return _circleSDK;
  const paths = [
    "@circle-fin/developer-controlled-wallets",
    "/root/circle-sdk/node_modules/@circle-fin/developer-controlled-wallets",
  ];
  for (const p of paths) {
    try { _circleSDK = require(p); return _circleSDK; } catch {}
  }
  throw new Error("Circle SDK not found. Run: npm install @circle-fin/developer-controlled-wallets");
}
const initiateDeveloperControlledWalletsClient = (...args: any[]) =>
  getSDK().initiateDeveloperControlledWalletsClient(...args);
import { BOT_CONFIG } from "../config";

function getCircleClient() {
  const apiKey       = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in .env.local");
  }
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

// One-time setup: create wallet set + SCA wallet on ARC-TESTNET
// Run via: npm run agent:circle-setup
export async function createBotCircleWallet(): Promise<{ walletId: string; address: string }> {
  const client = getCircleClient();

  console.log("Creating Circle wallet set...");
  const setRes = await client.createWalletSet({ name: "ArcBank Liquidation Bot" });
  const walletSetId = setRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error("Failed to create wallet set");

  console.log("Creating SCA wallet on ARC-TESTNET...");
  const walletRes = await client.createWallets({
    walletSetId,
    blockchains:  ["ARC-TESTNET"],
    count:        1,
    accountType:  "SCA", // Smart Contract Account — Gas Station eligible
  });

  const wallet = walletRes.data?.wallets?.[0];
  if (!wallet) throw new Error("Failed to create wallet");

  console.log("✅ Circle bot wallet created!");
  console.log("   Wallet ID:      ", wallet.id);
  console.log("   Wallet Address: ", wallet.address);
  console.log("\nAdd to .env.local:");
  console.log(`   CIRCLE_WALLET_ID=${wallet.id}`);

  return { walletId: wallet.id!, address: wallet.address! };
}

// Execute a contract call via Circle (no private key needed, gas sponsored)
async function executeViaCircle(params: {
  functionSig: string;
  args:         string[];
  contractAddr: string;
}): Promise<string> {
  const client   = getCircleClient();
  const walletId = process.env.CIRCLE_WALLET_ID;
  if (!walletId) throw new Error("CIRCLE_WALLET_ID not set — run agent:circle-setup first");

  const res = await (client as any).createContractExecutionTransaction({
    walletId,
    blockchain:           "ARC-TESTNET",
    contractAddress:      params.contractAddr,
    abiFunctionSignature: params.functionSig,
    abiParameters:        params.args,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txId = res.data?.id;
  if (!txId) throw new Error("Circle transaction creation failed");

  // Poll until confirmed (Gas Station handles fee automatically)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await (client as any).getTransaction({ id: txId });
    const tx     = status.data as any;
    if (tx?.state === "COMPLETE")  return txId;
    if (tx?.state === "FAILED" || tx?.state === "CANCELLED") {
      throw new Error(`Circle tx ${tx.state}: ${tx.errorReason ?? ""}`);
    }
  }
  throw new Error("Circle tx timed out");
}

// Approve ERC20 token via Circle wallet
export async function approveViaCircle(
  tokenAddress: string,
  spender:      string,
  amount:       string,
): Promise<void> {
  if (BOT_CONFIG.DRY_RUN) { console.log("    [DRY_RUN] Would approve", amount); return; }
  await executeViaCircle({
    contractAddr: tokenAddress,
    functionSig:  "approve(address,uint256)",
    args:         [spender, amount],
  });
}

// Execute liquidate() via Circle wallet
export async function liquidateViaCircle(
  borrower:    string,
  debtToken:   string,
  collToken:   string,
  debtAmount:  string,
): Promise<string | null> {
  if (BOT_CONFIG.DRY_RUN) {
    console.log("    [DRY_RUN] Would liquidate via Circle:", borrower);
    return null;
  }
  // Approve first
  await approveViaCircle(debtToken, BOT_CONFIG.LENDING_POOL, debtAmount);
  // Liquidate
  const txId = await executeViaCircle({
    contractAddr: BOT_CONFIG.LENDING_POOL,
    functionSig:  "liquidate(address,address,address,uint256)",
    args:         [borrower, debtToken, collToken, debtAmount],
  });
  return txId;
}

// Update Pyth prices via Circle wallet (no gas needed)
export async function updatePythViaCircle(
  oracleAddress: string,
  updateData:    string[],
  fee:           string,
): Promise<void> {
  if (BOT_CONFIG.DRY_RUN) { console.log("    [DRY_RUN] Would update Pyth via Circle"); return; }
  await executeViaCircle({
    contractAddr: oracleAddress,
    functionSig:  "updatePrices(bytes[])",
    args:         [JSON.stringify(updateData)],
  });
}
