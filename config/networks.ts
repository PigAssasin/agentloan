import { defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
    blockdaemon: {
      http: ["https://rpc.blockdaemon.testnet.arc.network"],
      webSocket: ["wss://rpc.blockdaemon.testnet.arc.network:443/websocket"],
    },
    drpc: {
      http: ["https://rpc.drpc.testnet.arc.network"],
      webSocket: ["wss://rpc.drpc.testnet.arc.network"],
    },
    quicknode: {
      http: ["https://rpc.quicknode.testnet.arc.network"],
      webSocket: ["wss://rpc.quicknode.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

// Arc Lending chỉ hỗ trợ Arc Testnet — không có chain nào khác
export const SUPPORTED_CHAINS = [arcTestnet] as const;
export const DEFAULT_CHAIN = arcTestnet;
