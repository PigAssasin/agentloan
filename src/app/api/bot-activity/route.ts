import { createPublicClient, http, parseAbi, formatUnits, type Address } from "viem";
import { ARC_TESTNET_CONTRACTS } from "../../../../config/contracts";
import { NextResponse } from "next/server";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const client = createPublicClient({ chain: arcTestnet, transport: http() });

const POOL_ABI = parseAbi([
  "event Liquidated(address indexed borrower, address indexed liquidator, address collateralToken, uint256 debtRepaid, uint256 collateralSeized)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

const BOT_ADDRESS = process.env.NEXT_PUBLIC_BOT_ADDRESS as Address | undefined;
const TOKENS = {
  [ARC_TESTNET_CONTRACTS.X_USDC]:    { symbol: "xUSDC",   decimals: 6 },
  [ARC_TESTNET_CONTRACTS.X_EURC]:    { symbol: "xEURC",   decimals: 6 },
  [ARC_TESTNET_CONTRACTS.X_CLR_BTC]: { symbol: "xclrBTC", decimals: 8 },
};

export async function GET() {
  try {
    const latest = await client.getBlockNumber();
    const fromBlock = latest > 10_000n ? latest - 10_000n : 0n;

    // Fetch recent Liquidated events
    const logs = await client.getLogs({
      address:   ARC_TESTNET_CONTRACTS.LENDING_POOL,
      event:     POOL_ABI[0] as any,
      fromBlock,
      toBlock:   latest,
    });

    const liquidations = logs.map((log: any) => ({
      borrower:         log.args.borrower,
      liquidator:       log.args.liquidator,
      collateralToken:  log.args.collateralToken,
      collSymbol:       TOKENS[log.args.collateralToken as keyof typeof TOKENS]?.symbol ?? "?",
      debtRepaid:       formatUnits(log.args.debtRepaid ?? 0n, 6),
      collateralSeized: formatUnits(log.args.collateralSeized ?? 0n,
        TOKENS[log.args.collateralToken as keyof typeof TOKENS]?.decimals ?? 18),
      txHash:     log.transactionHash,
      blockNumber: log.blockNumber?.toString(),
      byBot: BOT_ADDRESS
        ? log.args.liquidator?.toLowerCase() === BOT_ADDRESS.toLowerCase()
        : false,
    })).reverse(); // newest first

    // Bot wallet balances
    const balances: Record<string, string> = {};
    if (BOT_ADDRESS) {
      for (const [addr, meta] of Object.entries(TOKENS)) {
        try {
          const bal = await client.readContract({
            address: addr as Address, abi: ERC20_ABI,
            functionName: "balanceOf", args: [BOT_ADDRESS],
          }) as bigint;
          balances[meta.symbol] = formatUnits(bal, meta.decimals);
        } catch { balances[meta.symbol] = "?"; }
      }
    }

    return NextResponse.json(
      { botAddress: BOT_ADDRESS ?? null, botAgentId: process.env.NEXT_PUBLIC_BOT_AGENT_ID ?? null, balances, liquidations, scannedBlocks: 10_000 },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch {
    // Don't expose internal error details to the client
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
