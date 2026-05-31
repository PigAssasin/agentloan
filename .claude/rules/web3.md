---
globs: ["contracts/**/*.sol", "src/hooks/use-*.ts", "src/lib/web3*.ts"]
---

# Web3 Rules (auto-loaded for contract and web3 files)

## Solidity
- Always specify compiler version: `pragma solidity ^0.8.20;`
- Use OpenZeppelin contracts for standard patterns (ERC20, Ownable, ReentrancyGuard)
- Emit events for all state-changing functions
- Follow checks-effects-interactions pattern
- Use `custom error` instead of `require(false, "string")` for gas efficiency

## wagmi / viem
- Use `useReadContract` for reads, `useWriteContract` for writes
- Always handle `isPending`, `isError`, `error` states in UI
- Decode revert reasons with `viem.decodeErrorResult`
- Never trust client-side balance checks for critical logic

## Lending Protocol Specifics
- Collateral ratio must always be validated on-chain, not just frontend
- Interest rate calculations must use fixed-point math (no floating point)
- Liquidations must emit `Liquidated(borrower, liquidator, amount)` event
- All price feeds must have staleness checks (max 1 hour old)
