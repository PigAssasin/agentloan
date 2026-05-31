# Arc Lending — Web3 Project Rules

## ⚠️ CRITICAL: Always Use Arc MCP
- **Trước khi code bất cứ thứ gì liên quan Arc → gọi `arc-docs` MCP trước**
- Contract address, ABI, SDK API, gas, oracle, bridge — tất cả phải verify qua MCP
- Nếu MCP trả về khác với memory → **tin MCP**
- Không được đoán hoặc dùng kiến thức cũ về Arc

## ⚠️ CRITICAL: Arc-Only Network
- App chạy **100% trên Arc Testnet** (Chain ID: `5042002`)
- **KHÔNG** support Ethereum, BSC, Polygon, Sepolia, hay bất kỳ chain nào khác
- wagmi config: chỉ `[arcTestnet]` — một chain duy nhất
- Nếu user ở sai chain: hiện "Switch to Arc Network", không cho phép tiếp tục
- Mọi địa chỉ contract lấy từ `config/contracts.ts` — không hardcode

## Stack
- Blockchain: EVM-compatible (Solidity)
- Frontend: Next.js (App Router) + TypeScript
- Wallet: wagmi + viem + RainbowKit
- Backend: Node.js / API Routes
- Styling: Tailwind CSS + shadcn/ui
- Testing: Hardhat + Vitest

## Code Rules
- Never commit private keys, mnemonics, or `.env` files
- Smart contracts must pass security audit before deploy
- All contract interactions must handle wallet errors gracefully
- Use `viem` for on-chain reads, `wagmi` hooks for React state
- Keep functions small and single-purpose

## File Conventions
- Components: `PascalCase.tsx`
- Hooks: `use-kebab-case.ts`
- Contracts: `PascalCase.sol`
- Tests: `*.test.ts` or `*.spec.ts`

## Git
- Commit messages: `type(scope): message` (feat, fix, chore, docs)
- Never force-push to `main`
- PRs require security review for any contract changes

## Secrets
- Use `.env.local` for local secrets (gitignored)
- Use Vercel env vars in production
- Never hardcode addresses — use config files
