import { parseAbi, type WalletClient } from "viem";
import { publicClient } from "./pool-reader";
import { ARC_TESTNET_CONTRACTS } from "../../config/contracts";

const HERMES_URL = "https://hermes.pyth.network";
const PRICE_IDS  = [
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // BTC/USD
  "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b", // EUR/USD
  "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a", // USDC/USD
];

const ORACLE_ABI = parseAbi([
  "function getUpdateFee(bytes[] calldata updateData) external view returns (uint256)",
  "function updatePrices(bytes[] calldata updateData) external payable",
]);

async function fetchPriceUpdateData(): Promise<`0x${string}`[]> {
  const ids = PRICE_IDS.map(id => `ids[]=${id}`).join("&");
  const url = `${HERMES_URL}/v2/updates/price/latest?${ids}&encoding=hex`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Hermes API error: ${res.status}`);
  const json = await res.json() as { binary: { data: string[] } };
  return json.binary.data.map(d => `0x${d}` as `0x${string}`);
}

// Fetches latest prices from Pyth Hermes and pushes them on-chain.
// Called by the bot before each HF check cycle when oracle is stale.
export async function updateOraclePrices(wallet: WalletClient): Promise<void> {
  const updateData = await fetchPriceUpdateData();

  const fee = await publicClient.readContract({
    address:      ARC_TESTNET_CONTRACTS.PRICE_ORACLE,
    abi:          ORACLE_ABI,
    functionName: "getUpdateFee",
    args:         [updateData],
  }) as bigint;

  const hash = await wallet.writeContract({
    address:      ARC_TESTNET_CONTRACTS.PRICE_ORACLE,
    abi:          ORACLE_ABI,
    functionName: "updatePrices",
    args:         [updateData],
    value:        fee,
  } as any);

  await publicClient.waitForTransactionReceipt({ hash });
}
