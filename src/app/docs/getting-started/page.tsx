import Link from "next/link";
import { DocPage, Step, InfoBox, WarnBox } from "../_components/DocPage";

export default function GettingStartedPage() {
  return (
    <DocPage
      title="Getting Started"
      description="Set up your wallet, connect to Arc Testnet, get test tokens, and make your first deposit — all in under 5 minutes."
      next={{ label: "How to Supply", href: "/docs/supply" }}
    >
      <InfoBox title="Testnet Only">
        ArcBank runs exclusively on <strong>Arc Testnet</strong> (Chain ID: 5042002).
        All tokens are testnet assets with no real-world value. You will need MetaMask or a compatible EVM wallet.
      </InfoBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 24, marginTop: 8 }}>STEP BY STEP</h2>

      <Step n={1} title="Install MetaMask">
        Download <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>MetaMask</a> for your browser if you don't have it.
        Create or import a wallet. Make sure to save your seed phrase securely.
      </Step>

      <Step n={2} title="Add Arc Testnet">
        Add the Arc Testnet network to MetaMask manually:
        <div style={{ marginTop: 12, border: "2px solid #000", padding: "16px", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2 }}>
          <div><strong>Network Name:</strong> Arc Testnet</div>
          <div><strong>RPC URL:</strong> https://rpc.testnet.arc.network</div>
          <div><strong>Chain ID:</strong> 5042002</div>
          <div><strong>Currency Symbol:</strong> USDC</div>
          <div><strong>Block Explorer:</strong> https://testnet.arcscan.app</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          Go to MetaMask → Settings → Networks → Add Network → Add a network manually.
        </div>
      </Step>

      <Step n={3} title="Get Gas (USDC)">
        Arc Testnet uses <strong>USDC as its gas token</strong>. You need a small amount of Arc Testnet USDC to pay for transactions.
        Get it from the official Arc faucet at{" "}
        <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>faucet.circle.com</a>.
      </Step>

      <Step n={4} title="Get Test Tokens from ArcBank Faucet">
        Visit the <Link href="/faucet" style={{ color: "#000", fontWeight: 600 }}>ArcBank Faucet</Link> to mint testnet tokens:
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 2 }}>
          <li><strong>10,000 xUSDC</strong> — stablecoin for borrowing and collateral</li>
          <li><strong>10,000 xEURC</strong> — euro stablecoin collateral</li>
          <li><strong>1 xclrBTC</strong> — bitcoin collateral</li>
        </ul>
        Each token has a <strong>24-hour on-chain cooldown</strong> — enforced by the smart contract.
      </Step>

      <Step n={5} title="Connect and Start">
        Go to the <Link href="/app" style={{ color: "#000", fontWeight: 600 }}>Dashboard</Link>, click <strong>CONNECT WALLET</strong>, and select MetaMask.
        Your balances will appear automatically after connecting.
      </Step>

      <WarnBox>
        <strong>⚠ If you see "Wrong Network"</strong> in the navbar, click it and switch to Arc Testnet in MetaMask.
        ArcBank only works on Arc Testnet (Chain ID: 5042002).
      </WarnBox>
    </DocPage>
  );
}
