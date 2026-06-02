/**
 * ERC-8183 AgenticCommerce — registers liquidation opportunities on-chain.
 *
 * ALL calls are best-effort: failures are caught and logged, never block the bot.
 * Contract: 0x0747EEf0706327138c69792bF28Cd525089e4583 (Arc Testnet)
 */
import { parseAbi, type Address, type WalletClient } from "viem";
import { arcTestnetChain, BOT_CONFIG }                from "../config";
import { publicClient }                               from "./pool-reader";

const ERC8183_ADDRESS  = "0x0747EEf0706327138c69792bF28Cd525089e4583" as const;
const DEPLOYER_ADDRESS = "0x93A7daa58B2dDf25387cE072a95Bea96dc5f93FA" as const;
const ZERO_ADDRESS     = "0x0000000000000000000000000000000000000000" as const;

const ERC8183_ABI = parseAbi([
  "function createJob(address provider, address evaluator, uint256 expiration, string description, address hookAddress) external returns (uint256)",
  "function submit(uint256 jobId, bytes32 deliverableHash) external",
]);

// In-memory: borrower address (lowercase) → ERC-8183 jobId
// Prevents duplicate jobs for same borrower within same bot session
export const openJobs = new Map<string, bigint>();

/**
 * Register a liquidation opportunity on ERC-8183.
 * Returns jobId or null if already registered / failed.
 */
export async function createLiquidationJob(
  borrower: Address,
  wallet:   WalletClient,
): Promise<bigint | null> {
  const key = borrower.toLowerCase();
  if (openJobs.has(key)) return openJobs.get(key)!;

  if (BOT_CONFIG.DRY_RUN) {
    console.log(`    [DRY_RUN] Would createJob for borrower ${borrower.slice(0,10)}...`);
    return null;
  }

  try {
    const expiration = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour TTL
    const description = `Liquidate ${borrower} on AgentLoan`;

    const hash = await wallet.writeContract({
      address:      ERC8183_ADDRESS,
      abi:          ERC8183_ABI,
      functionName: "createJob",
      args:         [
        wallet.account!.address, // provider = bot (will execute if no one else does)
        DEPLOYER_ADDRESS,         // evaluator = deployer (trusted verifier)
        expiration,
        description,
        ZERO_ADDRESS as Address,  // no hook
      ],
    } as any);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Find jobId from first log topics (ERC-8183 JobCreated event)
    const log = receipt.logs.find(
      l => l.address.toLowerCase() === ERC8183_ADDRESS.toLowerCase()
    );
    if (!log?.topics[1]) throw new Error("JobCreated event not found in receipt");

    const jobId = BigInt(log.topics[1]);
    openJobs.set(key, jobId);
    console.log(`    ERC-8183 job #${jobId} created for ${borrower.slice(0,10)}...`);
    return jobId;
  } catch (e: any) {
    // Best-effort: never throw
    console.warn(`    ERC-8183 createJob skipped: ${(e.message ?? "").slice(0, 60)}`);
    return null;
  }
}

/**
 * Submit liquidation proof to ERC-8183 after successful execution.
 * txHash is used as bytes32 deliverable hash.
 */
export async function submitLiquidationProof(
  jobId:  bigint,
  txHash: `0x${string}`,
  wallet: WalletClient,
): Promise<void> {
  if (BOT_CONFIG.DRY_RUN) {
    console.log(`    [DRY_RUN] Would submitProof for job #${jobId}`);
    return;
  }
  try {
    await wallet.writeContract({
      address:      ERC8183_ADDRESS,
      abi:          ERC8183_ABI,
      functionName: "submit",
      args:         [jobId, txHash as `0x${string}`],
    } as any);
    console.log(`    ERC-8183 proof submitted for job #${jobId}`);
  } catch (e: any) {
    console.warn(`    ERC-8183 submitProof skipped: ${(e.message ?? "").slice(0, 60)}`);
  }
}

/** Remove borrower from open jobs map after liquidation completes. */
export function closeJob(borrower: Address): void {
  openJobs.delete(borrower.toLowerCase());
}

/** Get job ID for a borrower, or null if none registered. */
export function getJobId(borrower: Address): bigint | null {
  return openJobs.get(borrower.toLowerCase()) ?? null;
}
