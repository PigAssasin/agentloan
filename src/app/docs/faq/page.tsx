import Link from "next/link";
import { DocPage } from "../_components/DocPage";

const FAQS = [
  {
    q: "Is AgentLoan safe to use with real money?",
    a: "No. AgentLoan runs on Arc Testnet only. All tokens are testnet assets with no real-world value. Smart contracts have not been professionally audited. Do not use with real funds.",
  },
  {
    q: "Why does my Supply APY show 0.00%?",
    a: "Supply APY = Borrow APY × utilization. When very few people are borrowing relative to the total pool size, utilization is near zero and supply APY is near zero. Supply APY will increase as more borrowers use the pool.",
  },
  {
    q: "Why do I need two transactions to supply or repay?",
    a: "ERC20 tokens require an 'approve' transaction before a smart contract can spend them. Step 1 sets the approval, Step 2 executes the deposit or repay. This is standard in all DeFi protocols.",
  },
  {
    q: "I cleared my browser data — will my faucet cooldown reset?",
    a: "No. The faucet cooldown is enforced by the smart contract (stored in lastMintTime[address] on-chain). Clearing cookies, localStorage, or using a different browser does not reset it.",
  },
  {
    q: "What oracle does AgentLoan use for prices?",
    a: "AgentLoan uses Pyth Network — a real-time pull oracle with data from multiple institutional providers. Prices are submitted on-chain before each transaction and also refreshed every 5 minutes by an automated process. This is the same oracle infrastructure used by major DeFi protocols on mainnet.",
  },
  {
    q: "Why does the Health Factor sometimes show a different number briefly?",
    a: "The Health Factor is calculated on-chain using the Pyth oracle price. If the on-chain price is slightly different from the real-time display price (updated every 15 seconds), you may see a brief discrepancy. If the prices diverge by more than 1%, a price lag warning appears on the dashboard.",
  },
  {
    q: "Why is my Health Factor showing ∞?",
    a: "Health Factor is ∞ when you have no active debt. As soon as you borrow, a real HF number appears.",
  },
  {
    q: "What happens if my Health Factor goes below 1.0?",
    a: "Your position becomes liquidatable. Any wallet on Arc Testnet can call the liquidate() function to repay up to 50% of your debt in exchange for your collateral at a 5% discount.",
  },
  {
    q: "Why is the Borrow APY different from Supply APY?",
    a: "Borrow APY is always higher. Supply APY = Borrow APY × utilization rate. The difference accounts for the fact that only a portion of supplied funds are actively borrowed.",
  },
  {
    q: "Can I borrow xEURC or xclrBTC?",
    a: "No. Currently only xUSDC is borrowable. xEURC and xclrBTC can only be supplied as collateral.",
  },
  {
    q: "What is the maximum I can borrow?",
    a: "It depends on your collateral: xclrBTC → 70% LTV, xEURC → 80% LTV, xUSDC → 80% LTV. Example: $10,000 in xclrBTC collateral → max $7,000 xUSDC borrow.",
  },
  {
    q: "Does AgentLoan work on mobile?",
    a: "Yes. The app is fully responsive — all pages including Dashboard, Markets, Profile, Faucet, and Docs are optimized for mobile. On small screens, the navbar collapses into a hamburger menu and tables adjust to show essential columns.",
  },
  {
    q: "How do I add Arc Testnet to MetaMask?",
    a: "Go to MetaMask → Settings → Networks → Add Network → Add manually. Use: RPC: https://rpc.testnet.arc.network, Chain ID: 5042002, Symbol: USDC.",
  },
  {
    q: "I supplied tokens but my dashboard shows $0. What happened?",
    a: "This usually means your browser has cached data from an old contract address. Do a hard refresh (Ctrl+Shift+R), disconnect your wallet, and reconnect. If the issue persists, clear your browser's localStorage and reconnect.",
  },
  {
    q: "Why does WalletConnect not work?",
    a: "WalletConnect is disabled unless a valid project ID is configured. MetaMask injected wallet works fully without WalletConnect.",
  },
  {
    q: "What is the Liquidation Bot and who runs it?",
    a: "The Liquidation Bot is an autonomous program that monitors all borrower positions every ~15 seconds. When a position's Health Factor drops below 1.0, the bot automatically liquidates it — repaying up to 50% of the debt and receiving collateral + 5% bonus. It runs 24/7 on a dedicated VPS via PM2, and is registered on-chain as an AI agent via Arc ERC-8004 (Agent ID #30907).",
  },
  {
    q: "Can the Liquidation Bot liquidate me?",
    a: "Yes — if your Health Factor drops below 1.0, the bot will liquidate up to 50% of your debt position. You lose some collateral but keep the rest. To avoid this: keep your HF above 1.2 by repaying debt or adding more collateral when prices drop.",
  },
  {
    q: "How do I know if the bot is running?",
    a: "Go to Dashboard → AGENTS tab. The LIQUIDATION BOT panel shows LIVE status, the bot wallet address, current balances (xUSDC, xEURC, xclrBTC), and a log of recent liquidations in the last 10,000 blocks. The panel refreshes every 30 seconds.",
  },
  {
    q: "Why is Supply APY showing 0.00%?",
    a: "Supply APY = Borrow APY × utilization rate. When utilization is near zero (few active borrows vs total pool size), supply APY is near zero. As more users borrow, utilization rises and both borrow and supply APY increase.",
  },
];

export default function FaqPage() {
  return (
    <DocPage
      title="FAQ"
      description="Frequently asked questions about AgentLoan."
      prev={{ label: "Smart Contracts", href: "/docs/contracts" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {FAQS.map(({ q, a }, i) => (
          <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? "2px solid #000" : "none", paddingBottom: 28, marginBottom: 28 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, marginBottom: 12 }}>{q.toUpperCase()}</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8 }}>{a}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, border: "3px solid #000", padding: "24px", background: "#f9f9f9" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 12 }}>STILL HAVE QUESTIONS?</div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", margin: 0 }}>
          Check the source code on{" "}
          <a href="https://github.com/PigAssasin/agentloan" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>GitHub</a>{" "}
          or launch the{" "}
          <Link href="/app" style={{ color: "#000", fontWeight: 600 }}>app</Link> and explore.
        </p>
      </div>
    </DocPage>
  );
}
