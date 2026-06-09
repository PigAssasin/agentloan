# Personal Agent v2 — Smart DeFi Optimizer

**Goal:** Upgrade Personal Agent từ rule-based bot thành agent thực sự: biết APY, biết tất cả balances, tự tính net P&L, tự quyết định multi-asset yield.

**Core constraint:** Pool không có `borrowFor` → agent không thể borrow thay user. Chỉ suggest qua Telegram.

---

## Files thay đổi
| File | Phase | Loại |
|------|-------|------|
| `agents/personal-agent.ts` | 1 | Rewrite |
| `contracts/AgentExecutor.sol` | 2 | Thêm functions |
| `config/contracts.ts` | 2 | Update address |
| `src/app/api/personal-agent/status/route.ts` | 3 | Thêm fields |
| `src/components/agents/PersonalAgentPanel.tsx` | 3 | UI upgrade |

## Files KHÔNG chạm
- `agents/liquidation-bot.ts`
- `agents/protocol-manager.ts`
- `agents/lib/pool-reader.ts`

---

## Phase 1 — Smart Context Engine (không deploy contract)

### Checkpoint 1A — fetchPortfolioContext()
Batch Multicall3: getReserveData×3 + balanceOf×3 + getUserSupplyBalance×3 + getUserBorrowBalance×3 + getUserAccountData×1 = 13 calls, 1 RPC.
- Verify: log context, APY xUSDC ~0.06%, balances khớp on-chain

### Checkpoint 1B — Backtest
`BACKTEST=true npx ts-node agents/personal-agent.ts` → chạy 5 scenarios:
1. HF=2.5, 110k idle xUSDC, 0 debt → expect supply_usdc
2. HF=1.15 < target=1.30, 10k wallet → expect repay
3. HF=2.0, APY supply=3%, APY borrow=2% → expect notify_borrow (lợi nhuận)
4. HF=2.0, APY supply=0.06%, APY borrow=2.1% → expect skip or supply idle only
5. HF=1.02 emergency, wallet empty → expect emergencyProtect

### Checkpoint 1C — VPS dry-run 5 phút
DRY_RUN=true, log hiện đúng context, không crash

### Checkpoint 1D — VPS live 10 phút
DRY_RUN=false, verify actions logged to Supabase

---

## Phase 2 — AgentExecutor v2 (deploy contract)

### Thêm vào contract
- `deployTokenToYield(user, token, amount)` — generic supply
- `withdrawTokenFromYield(user, token, amount)` — withdraw về wallet
- `supportedTokens` mapping — whitelist an toàn
- Giữ nguyên v1 functions (backward compat)

### Checkpoint 2A — compile
`npx hardhat compile` — 0 errors, v1 functions còn nguyên

### Checkpoint 2B — deploy + verify
Contract trên arcscan.app, bot authorized, 3 tokens whitelisted

### Checkpoint 2C — re-auth test
1 wallet test approve xEURC + xclrBTC → agent supply thành công

---

## Phase 3 — Frontend

### API thêm: markets, portfolio, needsTokenApproval
### UI thêm: Yield Dashboard, multi-token approval, migration banner

### Checkpoint 3A — API response
curl /api/personal-agent/status?address=... → verify có markets/portfolio fields

### Checkpoint 3B — Browser
Yield dashboard hiển thị, Net P&L đúng màu, idle assets hiện APPROVE button

---

## Decision Logic

```
urgency >= 3          → emergency_protect (skip LLM)
urgency 1-2           → LLM với full context (repay/protect priority)
urgency = 0, HF safe  → LLM với full context (yield optimization)
no action needed      → skip
```

## APY Formula
```
supplyAPY = currentLiquidityRate / 1e27 * 100   (%)
borrowAPY = currentBorrowRate    / 1e27 * 100   (%)
netLoop   = supplyAPY - borrowAPY               (âm = lỗ khi loop)
```

## Borrow Suggestion Threshold
Chỉ `notify_borrow` khi: `netLoop > 0.3%` AND `HF > hfTarget + 0.5`
