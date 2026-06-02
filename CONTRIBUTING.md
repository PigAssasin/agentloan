# Contributing to AgentLoan

Thanks for your interest. AgentLoan is a testnet project — contributions welcome.

---

## Ways to Contribute

### 1. Run a Liquidation Bot

The most useful contribution. See [README.md#option-a](README.md) for setup.

### 2. Run a Signal Agent

Sell early liquidation warnings and earn xUSDC. See [signal-agent/README.md](signal-agent/README.md).

### 3. Submit Issues

Found a bug or logic error? Open an issue with:
- What you expected
- What actually happened
- Steps to reproduce

### 4. Submit PRs

Fork → branch → PR. Keep changes focused. Run tests before submitting:

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test
npm run build
```

All 56 tests must pass. No new packages in `package.json` without discussion (peer dep conflicts are painful).

---

## Development Setup

```bash
git clone https://github.com/PigAssasin/agentloan.git
cd agentloan
bash setup.sh          # installs deps + creates .env.local
npm run dev            # http://localhost:3000
```

---

## Project Structure (quick reference)

```
contracts/          Solidity — touch carefully, needs redeploy
agents/             Bot code — safe to modify
signal-agent/       Standalone Signal Agent server
src/                Next.js frontend
test/               Hardhat tests
config/contracts.ts Single source of truth for addresses
```

---

## Key Rules

- Never commit `.env.local` or private keys
- Never hardcode VPS IPs in tracked files — use env vars
- Contract changes require redeployment and test update
- Agent changes must not block liquidation on failure (try/catch everything)
- Signal Agent must work independently of the main agentloan repo

---

## Testing

```bash
# All tests
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test

# Specific
npx hardhat test test/LendingPool.test.ts
npx hardhat test test/agents/backtest.test.ts
```

---

## Questions

Open an issue or ask in Arc Discord.
