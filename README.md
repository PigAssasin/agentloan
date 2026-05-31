# ArcBank

> Decentralized lending and borrowing protocol on Arc Testnet

**[arcbank.vercel.app](https://arcbank.vercel.app)** · [Docs](https://arcbank.vercel.app/docs) · [GitHub](https://github.com/PigAssasin/arcbank)

---

## What is ArcBank?

ArcBank is a DeFi lending protocol inspired by Aave v2, running on [Arc Testnet](https://arc.io) (Chain ID: 5042002). Users can supply testnet tokens as collateral, borrow against them, and earn variable APY — all on-chain with no intermediaries.

- Supply **xUSDC**, **xEURC**, or **xclrBTC** to earn yield
- Borrow **xUSDC** against your collateral at variable rates
- Monitor your **Health Factor** in real time
- Earn interest automatically via scaled balance indexes (Aave-style)

---

## Live App

| | |
|---|---|
| **App** | https://arcbank.vercel.app |
| **Docs** | https://arcbank.vercel.app/docs |
| **Network** | Arc Testnet — Chain ID: 5042002 |
| **Explorer** | https://testnet.arcscan.app |

---

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| LendingPool | `0x893D0223f63A06CFf83F0e9ef4d58af1Ad2B95fb` |
| PriceOracle | `0x052252c0EEdCb0064D9bD49c94DdfE81Bad6fEA5` |
| InterestRateStrategy | `0x22B2A153F7694e49096ef91D627a80c5b6602Ffd` |
| xUSDC | `0xFa090bd1A524D861542888B6c5e7965dde1F4f35` |
| xEURC | `0x11aC6A7f4c3235e4edda971838640bE9e55aC222` |
| xclrBTC | `0x938ae31cc6418acc6730cF1AFFE53E91c143B078` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Arc Testnet · EVM · USDC gas token |
| Smart Contracts | Solidity 0.8.20 · OpenZeppelin 5 · Hardhat |
| Frontend | Next.js 16 · TypeScript · wagmi v2 · viem · RainbowKit |
| Styling | RawBlock design system |
| Deployment | Vercel |

---

## Local Development

### Requirements

- Node.js 20+
- MetaMask with Arc Testnet (RPC: `https://rpc.testnet.arc.network`, Chain ID: `5042002`)

### Setup

```bash
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

```bash
# .env.local
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x893D0223f63A06CFf83F0e9ef4d58af1Ad2B95fb
NEXT_PUBLIC_PRICE_ORACLE_ADDRESS=0x052252c0EEdCb0064D9bD49c94DdfE81Bad6fEA5
NEXT_PUBLIC_X_USDC_ADDRESS=0xFa090bd1A524D861542888B6c5e7965dde1F4f35
NEXT_PUBLIC_X_EURC_ADDRESS=0x11aC6A7f4c3235e4edda971838640bE9e55aC222
NEXT_PUBLIC_X_CLR_BTC_ADDRESS=0x938ae31cc6418acc6730cF1AFFE53E91c143B078

# Only needed for contract deployment — never commit
DEPLOYER_PRIVATE_KEY=
```

### Smart contract commands

```bash
# Run tests (39 tests)
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test

# Compile contracts
npx hardhat compile

# Deploy all contracts + seed pool
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/deploy-all.ts --network arcTestnet
```

---

## Working with AI Coding Assistants

This project is fully compatible with Claude Code, Cursor, and Codex. All three can read the codebase and help you extend it.

### Claude Code

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Clone and open
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank
claude
```

Claude Code will automatically discover the project structure. Useful prompts:

```
"Explain how the LendingPool scaled balance mechanism works"
"Add a new collateral token to the protocol"
"Write tests for the liquidation logic"
"Fix the health factor calculation in useUserAccountData"
```

### Cursor

```bash
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank
cursor .
```

In Cursor, use **Cmd+K** (or Ctrl+K) to ask inline questions. Recommended:

- Open `contracts/LendingPool.sol` and ask: *"How does the deposit function accrue interest?"*
- Open `src/hooks/use-lending-pool.ts` and ask: *"How can I add a new read for reserve utilization?"*
- Use `@codebase` in chat to ask questions across the whole project

### GitHub Copilot / Codex

```bash
git clone https://github.com/PigAssasin/arcbank.git
cd arcbank
code .  # or your preferred editor with Copilot
```

Copilot works best with explicit context. Start files with a comment:

```ts
// ArcBank lending protocol — wagmi v2 + viem + Arc Testnet (Chain ID 5042002)
// LendingPool: 0x893D0223f63A06CFf83F0e9ef4d58af1Ad2B95fb
```

Useful Copilot Chat commands:

```
/explain contracts/LendingPool.sol
/tests for the supply flow
/fix the type error in use-lending-pool.ts
```

---

## Project Structure

```
arcbank/
├── contracts/              # Solidity smart contracts
│   ├── LendingPool.sol     # Core protocol logic
│   ├── PriceOracle.sol     # Chainlink-compatible oracle
│   ├── InterestRateStrategy.sol
│   ├── libraries/          # ValidationLogic, ReserveLogic
│   ├── types/              # DataTypes structs
│   └── mocks/              # MockERC20, MockAggregator
├── scripts/                # Deploy and maintenance scripts
├── test/                   # Hardhat tests (39 tests)
├── src/
│   ├── app/                # Next.js pages
│   │   ├── page.tsx        # Landing page
│   │   ├── app/            # Dashboard
│   │   ├── markets/        # Markets overview
│   │   ├── profile/        # User positions
│   │   ├── faucet/         # Testnet token faucet
│   │   └── docs/           # Documentation
│   ├── components/         # React components
│   ├── hooks/              # wagmi contract hooks
│   └── providers/          # Web3Provider, ClientProviders
├── config/
│   ├── contracts.ts        # Contract addresses
│   └── networks.ts         # Arc Testnet config
└── docs/
    └── DEPLOYMENT.md       # Operations reference
```

---

## Security

Self-audited. All critical and high severity findings patched:

- Supply cap stale index bypass (C-1)
- Liquidation collateral accounting bug (C-2)
- Oracle `setAnswer` unprotected (C-3)
- Cross-reserve stale index in health factor (H-1, H-2)
- Borrow rate overflow cap (H-4)
- `initReserve` parameter validation (L-1, L-2, L-3)

> **Testnet only.** Not professionally audited. Do not use with real funds.

---

## License

MIT
