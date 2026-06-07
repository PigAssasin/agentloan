import { NextRequest }      from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { ARC_TESTNET_CONTRACTS }              from "../../../../../config/contracts";
import { supabaseAdmin }                      from "@/lib/supabase";

const arcChain = {
  id:             5042002,
  name:           "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls:        { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const client = createPublicClient({ chain: arcChain, transport: http() });

// UserAccountData struct: (totalCollateralUSD, totalRawCollateralUSD, totalDebtUSD, availableBorrowsUSD, healthFactor)
const POOL_ABI = parseAbi([
  "function getUserAccountData(address) external view returns (uint256,uint256,uint256,uint256,uint256)",
  "function agentAuthorized(address,address) external view returns (bool)",
]);

const ERC20_ABI = parseAbi([
  "function allowance(address,address) external view returns (uint256)",
]);

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase() as `0x${string}` | null;
  if (!address) return Response.json({ error: "address required" }, { status: 400 });

  try {
    const [accountData, isAuthorized, approved] = await Promise.all([
      client.readContract({
        address:      ARC_TESTNET_CONTRACTS.LENDING_POOL,
        abi:          POOL_ABI,
        functionName: "getUserAccountData",
        args:         [address],
      }),
      client.readContract({
        address:      ARC_TESTNET_CONTRACTS.LENDING_POOL,
        abi:          POOL_ABI,
        functionName: "agentAuthorized",
        args:         [address, ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR],
      }),
      client.readContract({
        address:      ARC_TESTNET_CONTRACTS.X_USDC,
        abi:          ERC20_ABI,
        functionName: "allowance",
        args:         [address, ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR],
      }),
    ]);

    // Struct order: totalCollateralUSD (weighted), totalRawCollateralUSD, totalDebtUSD, availableBorrowsUSD, healthFactor
    const [totalCollUSD, , totalDebtUSD, , healthFactor] = accountData as unknown as bigint[];

    const { data: tg } = await supabaseAdmin
      .from("telegram_connections")
      .select("chat_id")
      .eq("wallet_address", address)
      .single();

    return Response.json({
      healthFactor:   (Number(healthFactor) / 1e18).toFixed(4),
      totalCollUSD:   (Number(totalCollUSD) / 1e18).toFixed(2),
      totalDebtUSD:   (Number(totalDebtUSD) / 1e18).toFixed(2),
      isAuthorized,
      approvedAmount: (Number(approved) / 1e6).toFixed(2),
      hasTelegram:    !!tg?.chat_id,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
