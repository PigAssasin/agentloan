import { createPublicClient, http, parseAbi, formatUnits, encodeFunctionData,
         decodeFunctionResult, type Address } from "viem";
import { ARC_TESTNET_CONTRACTS } from "../../../../config/contracts";
import LendingPoolABI from "../../../lib/abi-lending-pool.json";
import { NextResponse } from "next/server";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const client = createPublicClient({ chain: arcTestnet, transport: http() });

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const MC3_ABI = parseAbi([
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
]);
const BORROW_EVENT = {
  type: "event", name: "Borrow",
  inputs: [
    { type: "address", name: "token",  indexed: true  },
    { type: "address", name: "user",   indexed: true  },
    { type: "uint256", name: "amount", indexed: false },
  ],
} as const;

// Scan last 50k blocks for Borrow events → get all unique borrowers
async function getAllBorrowers(): Promise<Address[]> {
  const latest = await client.getBlockNumber();
  const from   = latest > 50_000n ? latest - 50_000n : 0n;
  const seen   = new Set<string>();
  try {
    const logs = await client.getLogs({
      address:   ARC_TESTNET_CONTRACTS.LENDING_POOL,
      event:     BORROW_EVENT as any,
      fromBlock: from,
      toBlock:   latest,
    });
    for (const log of logs) {
      const user = (log as any).args?.user as string | undefined;
      if (user) seen.add(user.toLowerCase());
    }
  } catch { /* RPC error — return empty */ }
  return Array.from(seen) as Address[];
}

export async function GET() {
  try {
    const borrowers = await getAllBorrowers();
    if (borrowers.length === 0) {
      return NextResponse.json({ positions: [] }, {
        headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
      });
    }

    // Batch HF reads via Multicall3 — 1 RPC call for all borrowers
    const calls = borrowers.map(user => ({
      target:       ARC_TESTNET_CONTRACTS.LENDING_POOL as Address,
      allowFailure: true,
      callData:     encodeFunctionData({
        abi:          LendingPoolABI as any,
        functionName: "getUserAccountData",
        args:         [user],
      }),
    }));

    const results = await client.readContract({
      address:      MULTICALL3,
      abi:          MC3_ABI,
      functionName: "aggregate3",
      args:         [calls],
    }) as Array<{ success: boolean; returnData: `0x${string}` }>;

    const WAD = 10n ** 18n;
    const positions = [];

    for (let i = 0; i < results.length; i++) {
      if (!results[i].success) continue;
      try {
        const decoded = decodeFunctionResult({
          abi:          LendingPoolABI as any,
          functionName: "getUserAccountData",
          data:         results[i].returnData,
        }) as {
          totalCollateralUSD:    bigint;
          totalRawCollateralUSD: bigint;
          totalDebtUSD:          bigint;
          availableBorrowsUSD:   bigint;
          healthFactor:          bigint;
        };

        if (decoded.totalDebtUSD === 0n) continue;
        if (decoded.healthFactor >= WAD) continue; // HF >= 1.0 → healthy

        // Close factor: max 50% of debt per liquidation
        const maxRepayUSD  = decoded.totalDebtUSD / 2n;
        // 5% bonus on repay value
        const estimBonus   = maxRepayUSD * 5n / 100n;
        // Convert WAD→ 6 dec for xUSDC amount
        const maxRepayUsdc = maxRepayUSD / 10n ** 12n;

        positions.push({
          borrower:        borrowers[i],
          healthFactor:    (Number(decoded.healthFactor) / 1e18).toFixed(4),
          totalDebtUSD:    formatUnits(decoded.totalDebtUSD, 18),
          maxRepayUSD:     formatUnits(maxRepayUSD, 18),
          maxRepayUsdc:    formatUnits(maxRepayUsdc, 6),
          estimatedBonus:  formatUnits(estimBonus, 18),
          collateralUSD:   formatUnits(decoded.totalRawCollateralUSD, 18),
          debtToken:       ARC_TESTNET_CONTRACTS.X_USDC,
          debtSymbol:      "xUSDC",
          debtDecimals:    6,
        });
      } catch { continue; }
    }

    // Sort by HF ascending — most urgent first
    positions.sort((a, b) => parseFloat(a.healthFactor) - parseFloat(b.healthFactor));

    return NextResponse.json({ positions }, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
