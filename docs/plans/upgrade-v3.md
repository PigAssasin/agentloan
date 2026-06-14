# AgentLoan Upgrade Plan v3

> **Status:** Planning
> **Last updated:** 2026-06-14
> **Scope:** Bug fixes from full audit + scale upgrades
> **Contract redeploy required:** Phase 3 only (grouped into 1 deploy)

---

## Overview

Full audit surfaced 4 Critical, 5 High, 7 Medium, 5 Low bugs plus 6 upgrade opportunities.
Plan is split into 4 phases ordered by: impact vs effort vs risk.

```
Phase 1 — Code-only fixes      ½ day    No contract redeploy
Phase 2 — DB & infra upgrades  1 day    No contract redeploy
Phase 3 — Contract fixes        1 day    Requires redeploy + user re-auth
Phase 4 — Architecture          2 weeks  Mixed
```

---

## Phase 1 — Code-only fixes

> All changes in `.ts` files only. Deploy: `git push + pm2 restart personal-agent + vercel deploy`.
> No contract redeploy. No DB migration. No user action needed.

### Checkpoint 1.1 — Telegram /status ABI bug `[HIGH]`

**File:** `src/app/api/telegram/webhook/route.ts:14,26`

**Problem:** ABI declares 6 return values but contract returns 5. Code reads `result[5]` → always `undefined` → HF = 0.000 for every user. The `/status` Telegram command is completely broken.

**Fix:**
```typescript
// Line 14 — change:
parseAbi(["function getUserAccountData(address) external view returns (uint256,uint256,uint256,uint256,uint256,uint256)"])
// to:
parseAbi(["function getUserAccountData(address) external view returns (uint256,uint256,uint256,uint256,uint256)"])

// Line 26 — change:
return Number(result[5]) / 1e18;
// to:
return Number(result[4]) / 1e18;
```

**Files to change:** `src/app/api/telegram/webhook/route.ts`
**Test:** Send `/status` from linked Telegram → should show real HF (e.g. 1.68), not 0.000
**Risk:** None — 2-line fix, same function signature

- [ ] Fix ABI declaration (line 14)
- [ ] Fix result index (line 26)
- [ ] Test `/status` via Telegram
- [ ] Commit: `fix(telegram): getUserAccountData ABI had 6 returns, should be 5 — /status showed HF 0`

---

### Checkpoint 1.2 — LLM repay skip has no audit trail `[CRITICAL]`

**File:** `agents/personal-agent.ts:531-533`

**Problem:** When LLM suggests "repay" but HF is already safe (>= target + 0.10), `executeRepay` silently returns. No `logAction`, no `notifyUser`, nothing. When users ask "why didn't agent do anything?" it's impossible to answer from logs.

**Fix:**
```typescript
// In executeRepay(), replace:
if (hf >= user.hf_target + 0.10) {
  console.log(`  [skip] ${user.wallet_address.slice(0,10)}... HF ${hf.toFixed(3)} safe`);
  return;
}

// With:
if (hf >= user.hf_target + 0.10) {
  console.log(`  [skip] ${user.wallet_address.slice(0,10)}... HF ${hf.toFixed(3)} safe`);
  await logAction(user.wallet_address, "skip", {
    reason: `LLM suggested repay but HF ${hf.toFixed(2)} is already safe (>= target + 0.10)`,
    hfBefore: hf,
    success: true,
  });
  return;
}
```

**Files to change:** `agents/personal-agent.ts`
**Test:** Check `agent_actions` table after a cycle where HF > target — should see `action: "skip"` rows
**Risk:** None — adds log, changes no logic

- [ ] Add `logAction` call in the HF-safe skip path
- [ ] Verify in Supabase that skip rows appear with reason text
- [ ] Commit: `fix(agent): log skip action when LLM suggests repay but HF already safe`

---

### Checkpoint 1.3 — Memory query includes other agents' context `[HIGH]`

**File:** `agents/personal-agent.ts:316-322`

**Problem:** The memory query for LLM context fetches all `agent_memory` rows for a wallet without filtering `agent_type`. The coordinator agent writes liquidation priority scores, protocol health summaries, and bot competition data to the same table. Personal agent LLM reads this as its own history and reasons about liquidation logic instead of yield optimization.

**Fix:**
```typescript
// Add one line after line 318:
memUrl.searchParams.set("agent_type", "eq.personal");
```

**Files to change:** `agents/personal-agent.ts`
**Test:** Query Supabase `agent_memory` for a wallet that has both personal and coordinator rows — verify agent only gets `agent_type = 'personal'` rows
**Risk:** None — stricter filter, can't make things worse

- [ ] Add `agent_type` filter to memory query
- [ ] Commit: `fix(agent): scope memory query to personal agent only — coordinator memories were polluting LLM context`

---

### Checkpoint 1.4 — hfTarget API has no range validation `[MEDIUM]`

**File:** `src/app/api/personal-agent/settings/route.ts:49`

**Problem:** POST body `hfTarget` is written to DB without validation. Any numeric value accepted. Setting `hfTarget = 0` makes the rule-based engine always repay (hf < 0 is never true, but LLM sees target 0 and computes unlimited repay). Setting `hfTarget = 999` means agent never acts.

**Fix:**
```typescript
// Replace line 49:
if (hfTarget !== undefined) update.hf_target = hfTarget;

// With:
if (hfTarget !== undefined) {
  const t = Number(hfTarget);
  if (!isFinite(t) || t < 1.1 || t > 3.0) {
    return Response.json({ error: "hfTarget must be between 1.1 and 3.0" }, { status: 400 });
  }
  update.hf_target = t;
}
```

**Files to change:** `src/app/api/personal-agent/settings/route.ts`
**Test:** POST with `hfTarget: 0` → 400 error. POST with `hfTarget: 1.5` → 200 success
**Risk:** None — only rejects invalid values

- [ ] Add range validation for hfTarget
- [ ] Test with boundary values (1.1, 3.0 valid; 1.09, 3.01, 0, -1, "abc" invalid)
- [ ] Commit: `fix(api): validate hfTarget range 1.1–3.0 in settings POST`

---

### Checkpoint 1.5 — Agent crashes silently on missing DEPLOYER_PRIVATE_KEY `[CRITICAL]`

**File:** `agents/personal-agent.ts:55`

**Problem:** `privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as any)` throws at module load if env var is missing or malformed. PM2 enters restart loop with no clear error. All users lose agent protection. The TypeScript cast hides the undefined from the compiler.

**Fix:**
```typescript
// Replace line 55:
const deployerAccount = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);

// With:
const _pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!_pk || !/^0x[0-9a-fA-F]{64}$/.test(_pk)) {
  console.error("[FATAL] DEPLOYER_PRIVATE_KEY missing or invalid. Expected 0x + 32 bytes hex.");
  console.error("        Check /root/arcbank/.env.local on VPS.");
  process.exit(1);
}
const deployerAccount = privateKeyToAccount(_pk as `0x${string}`);
```

**Files to change:** `agents/personal-agent.ts`
**Test:** Temporarily rename env var on VPS → agent should exit with clear message, not loop-crash
**Risk:** None — fail-fast is always better than silent crash

- [ ] Add env var guard with descriptive error message
- [ ] Test on VPS with missing key
- [ ] Commit: `fix(agent): fail-fast with clear message if DEPLOYER_PRIVATE_KEY missing`

---

### Checkpoint 1.6 — executeSupplyToken makes redundant RPC call `[LOW]`

**File:** `agents/personal-agent.ts:682-685`

**Problem:** `executeSupplyToken` calls `publicClient.readContract({ functionName: "allowance" })` as a live RPC. But `ctx.allowances[sym]` already has this value from the 18-call Multicall3 batch built at the start of the cycle. With 100 users having idle xEURC/xclrBTC, this wastes 100 RPC calls per cycle.

**Fix:**
```typescript
// Remove lines 682-685 (the live readContract call):
const allowed = await publicClient.readContract({
  address: assetInfo.addr, abi: ERC20_ABI,
  functionName: "allowance",
  args: [user.wallet_address as `0x${string}`, ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR],
}) as bigint;

// Replace with:
const allowed = ctx.allowances[sym];
```

**Files to change:** `agents/personal-agent.ts`
**Test:** Cycle still completes, supply still executes when allowance > 0
**Risk:** Low — uses data from same-cycle Multicall3 snapshot, ~1s stale at most

- [ ] Replace live allowance read with ctx.allowances[sym]
- [ ] Remove now-unused `assetInfo` reference in that block if no longer needed
- [ ] Commit: `perf(agent): use ctx.allowances instead of live RPC in executeSupplyToken`

---

### Checkpoint 1.7 — Reserve margin inconsistency between execute and LLM prompt `[MEDIUM]`

**File:** `agents/personal-agent.ts:621`

**Problem:** `executeSupplyUSDC` keeps a reserve sized to repay back to `target + 0.30`, but LLM prompt Rule 1 says `target + 0.20`. LLM suggests supply amounts based on a smaller reserve assumption, but the executor keeps more back. Result: user sees agent supplied less than suggested, and idle funds remain higher than necessary.

**Fix:**
```typescript
// Line 621 — change:
? Math.max(0, ctx.debtUSD - ctx.weightedCollUSD / (user.hf_target + 0.30)) * 1.2

// To:
? Math.max(0, ctx.debtUSD - ctx.weightedCollUSD / (user.hf_target + 0.20)) * 1.2
```

**Files to change:** `agents/personal-agent.ts`
**Note:** Also verify LLM prompt Rule 2 still reads `target + 0.20` — should be consistent
**Risk:** Low — slightly more capital deployed, still safe because LLM prompt already told users this is the margin

- [ ] Update reserve margin from +0.30 to +0.20
- [ ] Verify LLM prompt Rule 2 matches
- [ ] Commit: `fix(agent): align supply reserve margin with LLM prompt rule 2 (target+0.20 not +0.30)`

---

### Phase 1 Final

- [ ] All 7 checkpoints done
- [ ] `git push origin main`
- [ ] `pm2 restart personal-agent` on VPS
- [ ] `vercel deploy --prod` (for API route changes)
- [ ] Spot check: `/status` Telegram works, Supabase shows skip logs, no crash on restart

---

## Phase 2 — Database & Infrastructure

> Changes in `.ts` files + Supabase SQL. No contract redeploy. VPS restart required.

### Checkpoint 2.1 — Per-user LLM API key `[BLOCKER at scale]`

**Problem:** 1 shared Gemini API key → 1,500 req/day free tier → hard cap at ~50 active users. Above 50 users: LLM throttled from evening onward. Agent falls back to rule-based only, no `notify_borrow`, no sophisticated reasoning.

**Schema:** `user_agent_subscriptions` already has `llm_api_key_enc text` and `llm_provider text`. `encryptKey`/`decryptKey` helpers already exist in `src/lib/agent-helpers.ts`. Just need to wire up.

**Changes in `agents/personal-agent.ts`:**
```typescript
// 1. Import decryptKey
import { decryptKey } from "../src/lib/agent-helpers"; // or inline the decrypt

// 2. New helper:
async function callLLMForUser(user: UserSub, prompt: string): Promise<LLMResponse> {
  if (user.llm_api_key_enc) {
    try {
      const userKey = decryptKey(user.llm_api_key_enc);
      // Call Gemini with user's own key (same callGemini() but pass key as param)
      return await callLLMWithKey(userKey, prompt);
    } catch {
      // Fall through to server key if user key fails
    }
  }
  return callLLM(prompt); // server fallback
}

// 3. Replace `decideLLM` call to callLLM → callLLMForUser(user, prompt)
```

**Changes in `agents/lib/gemini-client.ts`:**
```typescript
// Add optional key parameter to callGemini:
async function callGemini(prompt: string, apiKey?: string): Promise<string> {
  const key = apiKey ?? GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  // rest unchanged
}

export async function callLLMWithKey(apiKey: string, prompt: string): Promise<LLMResponse> {
  const text = await callGemini(prompt, apiKey);
  return { text, model: "gemini-2.5-flash (user key)" };
}
```

**Changes in UI (`src/components/agents/PersonalAgentPanel.tsx`):**
- Add "Gemini API Key (optional)" input field in settings
- Add helper text: "Get a free key at aistudio.google.com. Your key is encrypted before storage."
- Add link to instructions
- Wire to existing `POST /api/personal-agent/settings` with `llmApiKey` field

**Files to change:**
- `agents/personal-agent.ts`
- `agents/lib/gemini-client.ts`
- `src/components/agents/PersonalAgentPanel.tsx`

**Test:**
1. User without key → uses server key → works as before
2. User with their own Gemini key → key is decrypted and used → check logs show "user key"
3. User with invalid key → falls back to server key → no error surfaced to user

**Risk:** Medium — touches auth path. Test thoroughly before deploy.

- [ ] Add `callLLMWithKey` to gemini-client.ts
- [ ] Add `callLLMForUser` helper in personal-agent.ts
- [ ] Replace all `callLLM(prompt)` in `decideLLM` with `callLLMForUser(user, prompt)`
- [ ] Add API key input to PersonalAgentPanel UI
- [ ] Test user-key path end-to-end
- [ ] Test fallback when user key is invalid
- [ ] Commit: `feat(agent): per-user Gemini API key — server key is fallback only`

---

### Checkpoint 2.2 — Parallel user processing `[BLOCKER at scale]`

**Problem:** Current loop is sequential. Each user takes ~200ms (2 RPC calls) + up to 8s if LLM fires. With 50 users: ~150s per cycle, exceeding the 90s interval. Cycles start overlapping.

**Fix in `agents/personal-agent.ts` — replace the `for` loop in `runCycle`:**
```typescript
// Add at top of file:
const CONCURRENCY = 8; // max users processed in parallel

// Replace the for loop:
async function processUser(user: UserSub, hfMap: Map<...>): Promise<void> {
  // Move entire per-user logic here (lines ~976-1060)
}

// In runCycle():
const results: Promise<void>[] = [];
for (let i = 0; i < users.length; i += CONCURRENCY) {
  const chunk = users.slice(i, i + CONCURRENCY);
  await Promise.all(chunk.map(u =>
    processUser(u, hfMap).catch(e =>
      console.error(`  [cycle] user ${u.wallet_address.slice(0,10)} error:`, e.message)
    )
  ));
}
```

**Why chunked not full parallel:** Prevents 300 concurrent Gemini API calls if all users' LLM cooldowns expire at once.

**Files to change:** `agents/personal-agent.ts`

**Scale results:**
| Users | Before | After (CONCURRENCY=8) |
|---|---|---|
| 10 | ~15s | ~3s |
| 50 | ~75s | ~10s |
| 100 | ~150s | ~19s |
| 300 | ~450s | ~57s |

**Test:** Add 3+ test subscriptions, verify all processed within 1 cycle interval

- [ ] Extract `processUser(user, hfMap)` function
- [ ] Replace sequential for loop with chunked parallel
- [ ] Set CONCURRENCY constant at top of file
- [ ] Test with 3 users — all should complete in <10s
- [ ] Commit: `perf(agent): parallel user processing with CONCURRENCY=8 cap`

---

### Checkpoint 2.3 — agent_memory index + 30-day cleanup `[MEDIUM]`

**Problem:** No index on `agent_memory`. Query: `WHERE wallet_address = ? ORDER BY created_at DESC LIMIT 10` does full table scan. With 100 users × 10 actions/day × 365 days = 365,000 rows after 1 year. Query time grows linearly. No cleanup — table grows forever.

**SQL to run in Supabase Dashboard → SQL Editor:**
```sql
-- 1. Composite index for the exact query pattern used by personal-agent
CREATE INDEX IF NOT EXISTS idx_agent_memory_lookup
  ON agent_memory (wallet_address, agent_type, created_at DESC);

-- 2. Index for agent_actions (used by UI history panel)
CREATE INDEX IF NOT EXISTS idx_agent_actions_lookup
  ON agent_actions (wallet_address, created_at DESC);

-- 3. Cleanup policy: keep last 60 records per wallet+agent_type, delete rest
-- Run this once manually, then set up as a weekly cron in Supabase
DELETE FROM agent_memory am
WHERE am.id NOT IN (
  SELECT id FROM agent_memory
  WHERE wallet_address = am.wallet_address
    AND agent_type     = am.agent_type
  ORDER BY created_at DESC
  LIMIT 60
);
```

**For ongoing cleanup:** Supabase → Database → Extensions → enable `pg_cron`, then:
```sql
SELECT cron.schedule(
  'cleanup-agent-memory',
  '0 3 * * 0',  -- every Sunday at 3am
  $$
  DELETE FROM agent_memory
  WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
```

**Files to change:** Supabase SQL only (no code changes)
**Test:** Run `EXPLAIN ANALYZE` on memory query → verify index scan, not seq scan

- [ ] Run index creation SQL in Supabase
- [ ] Run one-time cleanup SQL
- [ ] Set up pg_cron weekly cleanup
- [ ] Run EXPLAIN ANALYZE to verify index is used
- [ ] Commit (docs only): `docs: add supabase index migration notes`

---

### Checkpoint 2.4 — Persist notifCooldown to DB `[MEDIUM]`

**Problem:** `notifCooldown` is a `Map<string, number>` in process memory. On every VPS restart or deploy, all cooldowns reset. Agent immediately sends pending-approval, rebalance, and borrow notifications to all users → Telegram flood.

**Fix:** Store cooldown timestamps in Supabase.

**Schema change:**
```sql
ALTER TABLE user_agent_subscriptions
  ADD COLUMN IF NOT EXISTS notif_cooldowns jsonb DEFAULT '{}';
-- Example value: {"rebalance_xEURC_xUSDC": 1718347200000, "pending_approval": 1718340000000}
```

**Changes in `agents/personal-agent.ts`:**
```typescript
// Replace in-memory Map with DB-backed helpers:

async function canNotify(wallet: string, event: string): Promise<boolean> {
  const { data } = await supabaseAdmin  // or fetch() like rest of agent
    .from("user_agent_subscriptions")
    .select("notif_cooldowns")
    .eq("wallet_address", wallet)
    .single();

  const cooldowns = (data?.notif_cooldowns ?? {}) as Record<string, number>;
  const last = cooldowns[event] ?? 0;
  if (Date.now() - last < NOTIF_COOLDOWN_MS) return false;

  // Update cooldown
  cooldowns[event] = Date.now();
  await fetch(/* supabase REST PATCH */, { body: JSON.stringify({ notif_cooldowns: cooldowns }) });
  return true;
}
```

**Note:** Makes `canNotify` async — need to add `await` at all 3 call sites.

**Files to change:**
- `agents/personal-agent.ts`
- Supabase SQL (schema migration)

**Test:** Restart agent → verify Telegram not flooded, cooldown persists through restart

- [ ] Run ALTER TABLE migration in Supabase
- [ ] Rewrite canNotify as async DB-backed function
- [ ] Add await at all canNotify call sites
- [ ] Test: restart agent → no notification flood
- [ ] Commit: `feat(agent): persist notification cooldowns to DB — survive restarts`

---

### Phase 2 Final

- [ ] All 4 checkpoints done
- [ ] `git push origin main`
- [ ] `pm2 restart personal-agent` on VPS
- [ ] `vercel deploy --prod`
- [ ] Load test: verify 3+ users processed in parallel in logs

---

## Phase 3 — Contract fixes

> Requires: Solidity compile → deploy → update config → VPS restart.
> Users MUST re-authorize new executor + re-approve all tokens.
> **Group all 3 contract changes into 1 deploy to minimize user friction.**

### Checkpoint 3.1 — repayFromWallet emits wrong event `[CRITICAL]`

**File:** `contracts/AgentExecutor.sol:113`

**Problem:** `repayFromWallet` emits `EmergencyProtected(user, repayAmount)`. Off-chain indexers cannot distinguish a wallet-funded repay from an emergency collateral-withdrawal repay. The on-chain audit trail is incorrect.

**Fix:**
```solidity
// Replace in repayFromWallet():
emit EmergencyProtected(user, repayAmount);
// With:
emit RepaidFromWallet(user, address(xUSDC), repayAmount);
```

**Note:** `TokenRepaidFromWallet` event already exists for the multi-token version. `repayFromWallet` (xUSDC only) should use it too. Or add a dedicated `RepaidFromWallet(address indexed user, uint256 amount)` event for cleanliness.

- [ ] Change emitted event in repayFromWallet
- [ ] Verify event matches what off-chain indexers expect

---

### Checkpoint 3.2 — Pyth oracle normalization wrong for expo >= 0 `[CRITICAL]`

**File:** `contracts/PriceOraclePyth.sol:77-79`

**Problem:**
```solidity
// Current (wrong):
priceWAD = rawPrice * (10 ** uint32(p.expo)) * 1e10;
// For expo=2: result = rawPrice * 100 * 1e10 = rawPrice * 1e12 (NOT 1e18)

// Correct formula:
// WAD price = rawPrice × 10^expo × 10^(18 - expo - expo)... wait
// Actual: raw Pyth price represents value × 10^expo
// To get USD in WAD: price_usd = rawPrice × 10^expo
// In WAD:           price_wad = rawPrice × 10^expo × 10^(18 - decimals_of_price)
// Pyth prices are dimensionless ratios, so:
// price_wad = rawPrice × 10^(18 + expo)    [when expo >= 0]
```

**Fix:**
```solidity
if (p.expo >= 0) {
    // rawPrice × 10^expo gives price with expo decimal places
    // multiply by 10^(18-expo) to reach WAD
    uint256 scale = 18 + uint256(uint32(p.expo));
    priceWAD = rawPrice * (10 ** scale);
} else {
    uint256 divisor = 10 ** uint256(uint32(-p.expo));
    priceWAD = (rawPrice * 1e18) / divisor;
}
```

**Risk:** Current feeds (BTC -8, EUR -5) all use negative expo → this code path is never hit today. Fix is preventive.

- [ ] Fix the expo >= 0 branch
- [ ] Add a comment explaining the Pyth normalization formula
- [ ] Verify negative expo path is unchanged

---

### Checkpoint 3.3 — withdrawFor has no post-HF safety check `[HIGH]`

**File:** `contracts/LendingPool.sol` — `withdrawFor` function

**Problem:** `withdrawFor` is `external` with only `onlyAuthorizedAgent` guard. A buggy or compromised agent can call it without a matching `repayFor`, reducing collateral below liquidation threshold with no revert.

**Fix:** Add HF assertion after withdrawal:
```solidity
function withdrawFor(
    address onBehalfOf, address token, uint256 amount, address recipient
) external onlyAuthorizedAgent(onBehalfOf) nonReentrant {
    // ... existing withdrawal logic ...

    // Safety: cannot withdraw to below liquidation threshold
    if (totalDebt > 0) {
        (, , , , uint256 hfAfter) = getUserAccountData(onBehalfOf);
        require(hfAfter >= 1e18, "withdrawal would cause undercollateralization");
    }
}
```

**Note:** `emergencyProtect` calls `withdrawFor` then `repayFor` in the same tx. The HF check fires AFTER `withdrawFor` but BEFORE `repayFor`. This will break `emergencyProtect` if the intermediate HF is < 1.0. Two options:
- Option A: Add a `withdrawAndRepay` atomic function to LendingPool that does both steps and only checks HF at the end. `AgentExecutor.emergencyProtect` calls this instead.
- Option B: Add a `inEmergencyProtect` flag to skip the mid-tx HF check (reentrancy risk).
- **Recommended: Option A** — cleaner, testable.

- [ ] Decide on Option A vs B (recommend A)
- [ ] If Option A: add `withdrawAndRepayFor(user, withdrawAmount, repayAmount)` to LendingPool
- [ ] Update AgentExecutor.emergencyProtect to call new function
- [ ] Add post-withdrawal HF check to standalone withdrawFor
- [ ] Add Hardhat test: agent withdraws without repay → should revert

---

### Checkpoint 3.4 — Deploy v3 contract + update config

**After all 3 contract changes above are made:**

```bash
# Compile
npx hardhat compile

# Run tests
npx hardhat test

# Deploy new AgentExecutor v3 + new LendingPool v4 (if needed)
npx hardhat run scripts/deploy-v3.ts --network arcTestnet
```

**New deploy script** (`scripts/deploy-v3.ts`):
- Deploy new LendingPool (with withdrawAndRepayFor)
- Deploy new PriceOraclePyth (with expo fix)
- Deploy new AgentExecutor v3 (with correct event)
- Authorize bot wallet
- Whitelist all 3 tokens
- Migrate existing oracle feeds (copy priceIds from old oracle)

**After deploy:**
```typescript
// Update config/contracts.ts:
LENDING_POOL:  "0x<new>",
PRICE_ORACLE:  "0x<new>",
AGENT_EXECUTOR: "0x<new>",
```

**User communication:**
> "AgentLoan has deployed contract updates. To continue using the Personal Agent:
> 1. Go to agentloan.vercel.app/app → AGENTS tab
> 2. Click 'Re-authorize' (one transaction)
> 3. Re-approve xUSDC, xEURC, xclrBTC to new executor (one transaction each)
> Your positions are unaffected — only agent permissions need to be re-granted."

- [ ] Merge all 3 contract fixes (3.1, 3.2, 3.3) into single branch
- [ ] Run full Hardhat test suite (56 tests must pass)
- [ ] Write deploy-v3.ts script
- [ ] Deploy to Arc Testnet
- [ ] Update config/contracts.ts with new addresses
- [ ] Update README.md contract table
- [ ] Deploy frontend (Vercel)
- [ ] Restart VPS agent
- [ ] Test: personal agent picks up new addresses, executes successfully
- [ ] Announce to users: re-auth + re-approve
- [ ] Commit: `feat(contracts): v3 — fix Pyth expo, withdrawFor HF guard, correct event emit`

---

### Phase 3 Final

- [ ] All contracts deployed and verified on arcscan
- [ ] Agent running with new addresses
- [ ] Users notified via Telegram broadcast
- [ ] Old contract addresses documented (not deleted from codebase for history)

---

## Phase 4 — Architecture upgrades

> Larger scope. Each is independent — do in any order.

### Checkpoint 4.1 — Circuit breaker: pause user after cascade repays `[HIGH value]`

**Problem:** If a user's collateral price crashes hard (e.g. BTC -30% in 1 hour), the agent could execute 5-6 consecutive repays, burning through the user's approved USDC balance, while HF keeps falling because the root cause (oracle price) is still falling. No point continuing.

**Trigger:** 3+ repays for the same user within 60 minutes without HF improving.

**Implementation:**
```typescript
// In runCycle, before calling executeRepay:
const recentRepays = await getRecentRepayCount(user.wallet_address, 60); // last 60 min
if (recentRepays >= 3) {
  const hfImproved = // check if HF is higher than before first repay
  if (!hfImproved) {
    await pauseUser(user.wallet_address, "circuit_breaker");
    await notifyUser(user.wallet_address, 
      "⚠️ Agent paused — 3 repays in 60 min with no HF improvement.\n" +
      "This may indicate a sharp price drop. Please check your position manually.\n" +
      "Re-enable at agentloan.vercel.app/app"
    );
    return;
  }
}
```

**New Supabase fields:**
```sql
ALTER TABLE user_agent_subscriptions
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reason text;
```

**Files:** `agents/personal-agent.ts`, Supabase SQL

- [ ] Add pause fields to schema
- [ ] Implement getRecentRepayCount helper
- [ ] Implement pauseUser helper
- [ ] Add circuit breaker check before executeRepay
- [ ] Add UI indicator when user is circuit-breaker paused
- [ ] Commit: `feat(agent): circuit breaker — pause after 3 failed repays in 60min`

---

### Checkpoint 4.2 — Telegram push alerts for HF threshold crossing `[UX]`

**Problem:** Users only find out about HF changes when they manually send `/status` or when agent executes an action. No proactive alert when HF drifts toward danger zone.

**Implementation:**
```typescript
// In runCycle, after fetching ctx:
const ALERT_THRESHOLD = user.hf_target + 0.25; // warn before agent fires
if (ctx.hf < ALERT_THRESHOLD && ctx.hf >= user.hf_target) {
  if (await canNotify(user.wallet_address, "hf_warning")) {
    await notifyUser(user.wallet_address,
      `⚠️ <b>HF approaching target</b>\n` +
      `Current: ${ctx.hf.toFixed(2)} (target: ${user.hf_target})\n` +
      `Agent will auto-repay if HF drops below ${user.hf_target}.`
    );
  }
}
```

**Files:** `agents/personal-agent.ts`

- [ ] Add HF drift check in runCycle
- [ ] Set warning threshold at hf_target + 0.25
- [ ] Use canNotify with 2-hour cooldown for warnings
- [ ] Test: lower hf_target temporarily to trigger warning
- [ ] Commit: `feat(agent): proactive Telegram HF warning before agent fires`

---

### Checkpoint 4.3 — getUserAccountData view-accrual `[accuracy]`

**Problem:** `getUserAccountData` is a `view` function — it reads stored indexes without accruing interest since the last state-changing tx. As time passes, actual debt grows but `getUserAccountData` shows the old value. HF appears higher than reality. The longer since the last tx, the more optimistic the reading.

**Impact example:** User with $50,000 borrowed at 10% APY after 30 days of no transactions:
- Actual debt: ~$50,411
- Reported debt: $50,000 (old index)
- HF appears 0.8% better than reality

**Fix in `contracts/LendingPool.sol`:** Add a view-safe accrual path:
```solidity
function getUserAccountDataAccrued(address user)
    external view
    returns (uint256 totalCollateralUSD, uint256 totalDebtUSD, uint256 healthFactor)
{
    // For each asset:
    //   accrued_borrow = scaledBorrow × _viewCurrentBorrowIndex(asset)
    // where _viewCurrentBorrowIndex computes compound interest without writing state
}
```

**Note:** This is a view-only function. Requires computing the current borrow index mathematically. The formula is `borrowIndex × (1 + rate × dt)` where `dt = block.timestamp - lastUpdateTimestamp`. This is a safe approximation for view purposes.

**Files:** `contracts/LendingPool.sol`, `contracts/libraries/ReserveLogic.sol`

- [ ] Implement `_viewCurrentBorrowIndex` in ReserveLogic
- [ ] Add `getUserAccountDataAccrued` to LendingPool
- [ ] Update personal agent to use new function for HF reads
- [ ] Update frontend dashboard to use new function
- [ ] Add Hardhat test comparing accrued vs non-accrued after time advance
- [ ] Commit: `feat(contracts): getUserAccountDataAccrued — real-time HF without state write`

---

### Phase 4 Final

Phase 4 items are independent. Ship 4.2 (Telegram alerts) first — highest user-visible value, lowest risk. Then 4.1 (circuit breaker). Then 4.3 (view accrual — requires contract redeploy, can be batched with a future upgrade).

---

## Dependency Map

```
Phase 1 ──────────────────────────────────────────────► Deploy today
   │
   ├── 1.1 Telegram ABI (standalone)
   ├── 1.2 Repay skip log (standalone)
   ├── 1.3 Memory filter (standalone)
   ├── 1.4 hfTarget validation (standalone)
   ├── 1.5 Env guard (standalone)
   ├── 1.6 RPC dedup (standalone)
   └── 1.7 Reserve margin (standalone)

Phase 2 ──────────────────────────────────────────────► After Phase 1
   │
   ├── 2.1 Per-user API key (needs UI change)
   ├── 2.2 Parallel loop (standalone)
   ├── 2.3 DB indexes (standalone, Supabase only)
   └── 2.4 Persist cooldowns (needs schema change)

Phase 3 ──────────────────────────────────────────────► After Phase 2
   │                                                    Bundle all 3 into 1 deploy
   ├── 3.1 repayFromWallet event
   ├── 3.2 Pyth expo fix
   ├── 3.3 withdrawFor HF guard → needs withdrawAndRepayFor in LendingPool
   └── 3.4 Deploy + user re-auth

Phase 4 ──────────────────────────────────────────────► Ongoing
   │
   ├── 4.1 Circuit breaker (after Phase 2 — needs pause fields)
   ├── 4.2 Telegram push alerts (after Phase 1 — standalone)
   └── 4.3 View accrual (after Phase 3 — needs contract redeploy)
```

---

## Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Phase 3 deploy fails on Arc Testnet | Low | High | Test on local fork first |
| Users don't re-auth after Phase 3 | Medium | Medium | Telegram broadcast + in-app banner |
| Parallel loop introduces race condition | Low | Medium | Each user's state is independent, no shared write |
| Per-user key decryption bug | Low | High | Fallback to server key always, test thoroughly |
| DB index migration locks table | Very low | Low | Supabase CREATE INDEX is non-blocking by default |
| withdrawAndRepayFor audit risk | Medium | High | Hardhat test coverage before deploy |

---

## Estimated timeline

| Phase | Effort | When |
|---|---|---|
| Phase 1 | 4 hours | Day 1 |
| Phase 2 | 2 days | Day 2–3 |
| Phase 3 | 2 days | Day 4–5 |
| Phase 4 (4.2 only) | 4 hours | Day 6 |
| Phase 4 (4.1 + 4.3) | 3 days | Week 2 |
