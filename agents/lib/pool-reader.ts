import { createPublicClient, http, type Address } from "viem";
import * as fs   from "fs";
import * as path from "path";
import { arcTestnetChain, BOT_CONFIG } from "../config";
import LendingPoolABI from "../../src/lib/abi-lending-pool.json";

export const publicClient = createPublicClient({
  chain:     arcTestnetChain,
  transport: http(BOT_CONFIG.RPC_URL),
});

// Multicall3 — batches N contract reads into 1 RPC call
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const MULTICALL3_ABI = [
  {
    name: "aggregate3",
    type: "function",
    stateMutability: "view",
    inputs: [{
      name: "calls", type: "tuple[]",
      components: [
        { name: "target",       type: "address" },
        { name: "allowFailure", type: "bool"    },
        { name: "callData",     type: "bytes"   },
      ],
    }],
    outputs: [{
      name: "returnData", type: "tuple[]",
      components: [
        { name: "success",    type: "bool"  },
        { name: "returnData", type: "bytes" },
      ],
    }],
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────

export interface UserPosition {
  address:            Address;
  healthFactor:       bigint;
  totalDebtUSD:       bigint;
  totalCollateralUSD: bigint;
}

// ── Incremental block scanning ─────────────────────────────────────────────

export function readLastBlock(): bigint {
  const file = path.resolve(BOT_CONFIG.STATE_FILE);
  if (fs.existsSync(file)) {
    const val = fs.readFileSync(file, "utf8").trim();
    if (val) return BigInt(val);
  }
  // First run: use POOL_START_BLOCK env if set (deployment block from arcscan.app)
  const envBlock = process.env.POOL_START_BLOCK;
  return envBlock ? BigInt(envBlock) : 0n;
}

function writeLastBlock(block: bigint): void {
  const file = path.resolve(BOT_CONFIG.STATE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, block.toString(), "utf8");
}

// Returns all unique wallets that have ever borrowed — incremental scan
export async function getAllBorrowers(): Promise<Address[]> {
  const latest    = await publicClient.getBlockNumber();
  const fromBlock = readLastBlock();

  if (fromBlock > latest) {
    console.log(`  No new blocks (last=${fromBlock}, latest=${latest})`);
    return [];
  }

  const CHUNK = 5_000n;
  const seen  = new Set<string>();
  console.log(`  Scanning blocks ${fromBlock}→${latest} (${(latest - fromBlock + 1n)} blocks)`);

  for (let from = fromBlock; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    try {
      const logs = await publicClient.getLogs({
        address:   BOT_CONFIG.LENDING_POOL,
        event: {
          type: "event", name: "Borrow",
          inputs: [
            { type: "address", name: "token",  indexed: true  },
            { type: "address", name: "user",   indexed: true  },
            { type: "uint256", name: "amount", indexed: false },
          ],
        } as any,
        fromBlock: from,
        toBlock:   to,
      });
      for (const log of logs) {
        const user = (log as any).args?.user as string | undefined;
        if (user) seen.add(user.toLowerCase());
      }
    } catch (e: any) {
      console.warn(`  Chunk ${from}-${to} skipped: ${e.message}`);
    }
  }

  writeLastBlock(latest + 1n);
  return Array.from(seen) as Address[];
}

// ── Batch HF reads via Multicall3 ─────────────────────────────────────────
// 1 RPC call for N borrowers instead of N calls — no rate limit issues

export async function getPositionsBatch(borrowers: Address[]): Promise<UserPosition[]> {
  if (borrowers.length === 0) return [];

  // Encode getUserAccountData(address) calldata for each borrower
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");

  const calls = borrowers.map(user => ({
    target:       BOT_CONFIG.LENDING_POOL as Address,
    allowFailure: true,
    callData:     encodeFunctionData({
      abi:          LendingPoolABI as any,
      functionName: "getUserAccountData",
      args:         [user],
    }),
  }));

  const results = await publicClient.readContract({
    address:      MULTICALL3,
    abi:          MULTICALL3_ABI,
    functionName: "aggregate3",
    args:         [calls],
  }) as Array<{ success: boolean; returnData: `0x${string}` }>;

  return results.map((r, i) => {
    if (!r.success) {
      return { address: borrowers[i], healthFactor: 2n ** 256n - 1n, totalDebtUSD: 0n, totalCollateralUSD: 0n };
    }
    const decoded = decodeFunctionResult({
      abi:          LendingPoolABI as any,
      functionName: "getUserAccountData",
      data:         r.returnData,
    }) as {
      totalCollateralUSD:    bigint;
      totalRawCollateralUSD: bigint;
      totalDebtUSD:          bigint;
      availableBorrowsUSD:   bigint;
      healthFactor:          bigint;
    };
    return {
      address:            borrowers[i],
      healthFactor:       decoded.healthFactor,
      totalDebtUSD:       decoded.totalDebtUSD,
      totalCollateralUSD: decoded.totalRawCollateralUSD,
    };
  });
}

// Returns positions with HF < 1e18 WAD = liquidatable
export function filterLiquidatable(positions: UserPosition[]): UserPosition[] {
  const WAD = 10n ** 18n;
  return positions.filter(p => p.totalDebtUSD > 0n && p.healthFactor < WAD);
}

// ── Oracle staleness check ─────────────────────────────────────────────────

export async function getOracleLastUpdateTime(tokenAddress: Address): Promise<number> {
  const result = await publicClient.readContract({
    address:      BOT_CONFIG.LENDING_POOL,
    abi:          LendingPoolABI as any,
    functionName: "getReserveData",
    args:         [tokenAddress],
  }) as { lastUpdateTimestamp: bigint };
  return Number(result.lastUpdateTimestamp);
}

export async function isOracleStale(): Promise<boolean> {
  const now        = Math.floor(Date.now() / 1000);
  const lastUpdate = await getOracleLastUpdateTime(BOT_CONFIG.DEBT_TOKEN as Address);
  const ageSeconds = now - lastUpdate;
  return ageSeconds > BOT_CONFIG.ORACLE_STALENESS_THRESHOLD;
}
