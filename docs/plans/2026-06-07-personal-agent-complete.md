# Personal Agent — Complete Build Plan (v3 — reviewed)
> Contracts deployed ✓ — All logical errors from review corrected
> Created: 2026-06-07 | Reviewed: 2026-06-07

---

## Architecture

```
User wallet (MetaMask)
  ↓ approve xUSDC to AgentExecutor (1 tx)
  ↓ LendingPool.authorizeAgent(AgentExecutor, true) (1 tx)

PersonalAgentPanel (UI / Vercel)
  → reads settings from Supabase via API
  → shows HF, last action, history, Telegram link
  → POST requires EIP-712 signature to prove wallet ownership

Telegram Bot
  → /start 0x... links wallet to chat_id
  → /enable /disable /status /hf 1.4
  → agent sends notification per user after every action
  → webhook validated via X-Telegram-Bot-Api-Secret-Token

personal-agent.ts (VPS, PM2, DRY_RUN supported)
  Tier 1 (every block, $0):
    Multicall3 → HF all users → score urgency
  Tier 2 (on event, 5 min cooldown per user):
    callLLM(prompt) from gemini-client.ts
    Memory context injected into prompt
  Execute:
    AgentExecutor.emergencyProtect() or deployToYield()
    Read hfAfter via getUserAccountData after tx
    Log to Supabase → Telegram notification per user

AgentExecutor.sol (on-chain ✓)
  emergencyProtect: withdrawFor + repayFor atomic
  deployToYield: pull from wallet → depositFor
```

---

## PHASE A — Supabase (45 min)

### A1: Create project
supabase.com → New project → "agentloan" → copy URL, anon key, service role key

### A2: Enable extensions (in Supabase SQL editor)

```sql
-- Required before creating tables
CREATE EXTENSION IF NOT EXISTS moddatetime;  -- auto-update updated_at
CREATE EXTENSION IF NOT EXISTS pg_cron;      -- scheduled cleanup
```

### A3: Create tables

```sql
CREATE TABLE user_agent_subscriptions (
  id               BIGSERIAL PRIMARY KEY,
  wallet_address   TEXT NOT NULL,
  agent_type       TEXT NOT NULL DEFAULT 'personal',

  hf_target        NUMERIC DEFAULT 1.3,
  enabled          BOOLEAN DEFAULT false,

  -- LLM: null = use protocol default Gemini key
  llm_provider     TEXT,
  llm_api_key_enc  TEXT,    -- AES-256 encrypted with LLM_ENCRYPTION_KEY
  llm_base_url     TEXT,

  -- Rate limiting: last time LLM was called for this user
  last_llm_call_at TIMESTAMPTZ,

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(wallet_address, agent_type)
);

-- Auto-update updated_at on every UPDATE
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_agent_subscriptions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Telegram: wallet ↔ chat_id
CREATE TABLE telegram_connections (
  wallet_address TEXT PRIMARY KEY,
  chat_id        TEXT NOT NULL,
  connected_at   TIMESTAMPTZ DEFAULT now()
);

-- Agent action log
CREATE TABLE agent_actions (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  action         TEXT,   -- 'emergency_protect' | 'repay' | 'deploy_yield' | 'skip' | 'error'
  reason         TEXT,
  amount_usd     NUMERIC,
  hf_before      NUMERIC,
  hf_after       NUMERIC,
  success        BOOLEAN,
  tx_hash        TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Per-user memory (drives LLM decisions)
CREATE TABLE agent_memory (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  type           TEXT,   -- 'observation' | 'decision' | 'outcome'
  content        TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Indexes: all queries filter by wallet_address
CREATE INDEX ON user_agent_subscriptions(wallet_address);
CREATE INDEX ON agent_actions(wallet_address, created_at DESC);
CREATE INDEX ON agent_memory(wallet_address, agent_type, created_at DESC);
CREATE INDEX ON telegram_connections(chat_id);

-- Scheduled cleanup: runs daily at 3am UTC
SELECT cron.schedule(
  'cleanup-agent-data',
  '0 3 * * *',
  $$
    DELETE FROM agent_memory WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY wallet_address, agent_type ORDER BY created_at DESC
        ) as rn FROM agent_memory
      ) t WHERE rn <= 50
    );
    DELETE FROM agent_actions WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
```

### A4: Install + env vars

```bash
npm install @supabase/supabase-js
```

```bash
# .env.local (local + VPS + Vercel)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # server only — never expose to browser
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...    # browser safe

# 32-byte hex key for AES-256 encrypting user LLM API keys
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
LLM_ENCRYPTION_KEY=<64 hex chars>

# Telegram: add to existing values
TELEGRAM_WEBHOOK_SECRET=<random 32-char string>
# TELEGRAM_BOT_TOKEN already exists in .env.local
```

**CHECKPOINT A:**
```
□ Extensions enabled (moddatetime, pg_cron)
□ All 4 tables + indexes created
□ cron job scheduled
□ .env.local updated local + VPS + Vercel
□ node -e "require('@supabase/supabase-js')" → no error
```

---

## PHASE B — API Routes + Helpers (1.5h)

### B1: `src/lib/supabase.ts`

```typescript
import { createClient } from "@supabase/supabase-js";
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### B2: `src/lib/agent-helpers.ts` — define all helpers

```typescript
import crypto from "crypto";

const ALGO = "aes-256-cbc";
const KEY  = Buffer.from(process.env.LLM_ENCRYPTION_KEY!, "hex");

export function encryptKey(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

export function decryptKey(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString();
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {}); // never throw
}

export function formatStatus(wallet: string, sub: any, hf: number): string {
  return [
    `<b>Personal Agent Status</b>`,
    `Wallet: <code>${wallet.slice(0,10)}...${wallet.slice(-6)}</code>`,
    `Agent: ${sub?.enabled ? "● ACTIVE" : "○ INACTIVE"}`,
    `HF now: <b>${hf.toFixed(3)}</b> | Target: ${sub?.hf_target ?? 1.3}`,
  ].join("\n");
}
```

### B3: `src/app/api/personal-agent/settings/route.ts`

```typescript
// GET: load settings
// POST: save settings — REQUIRES wallet ownership proof
export async function POST(req: Request) {
  const { address, hfTarget, enabled, llmProvider, llmApiKey, signature, message } = await req.json();

  // Verify wallet owns the address (EIP-191 personal sign)
  // message = "AgentLoan: update settings for " + address.toLowerCase()
  const recoveredAddress = await verifyMessage({ message, signature });
  if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const update: any = { hf_target: hfTarget, enabled, llm_provider: llmProvider };
  if (llmApiKey) update.llm_api_key_enc = encryptKey(llmApiKey);

  await supabaseAdmin.from("user_agent_subscriptions").upsert({
    wallet_address: address.toLowerCase(),
    agent_type: "personal",
    ...update,
  });
  return Response.json({ success: true });
}
```

### B4: `src/app/api/personal-agent/status/route.ts`

Reads on-chain: allowance, authorization, HF, debt, collateral.

### B5: `src/app/api/personal-agent/actions/route.ts`

Returns last 10 actions for a wallet.

### B6: `src/app/api/telegram/webhook/route.ts`

```typescript
export async function POST(req: Request) {
  // Validate request is from Telegram
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return Response.json({ ok: false }, { status: 403 });
  }

  const body = await req.json();
  const msg = body.message;
  if (!msg?.text) return Response.json({ ok: true });

  const chatId = msg.chat.id.toString();
  const text   = msg.text.trim();

  // Respond immediately — process async to avoid Telegram 5s timeout
  (async () => {
    if (text.startsWith("/start")) {
      // Handle both "/start 0x..." and deep link payload
      const wallet = (text.split(" ")[1] ?? "").toLowerCase();
      if (wallet.startsWith("0x") && wallet.length === 42) {
        await supabaseAdmin.from("telegram_connections").upsert({ wallet_address: wallet, chat_id: chatId });
        await sendTelegram(chatId, `✅ <b>Wallet linked!</b>\n<code>${wallet}</code>\n\nCommands:\n/status · /enable · /disable · /hf 1.4`);
      } else {
        await sendTelegram(chatId, `Send your wallet address:\n<code>/start 0xYOUR_WALLET</code>`);
      }
      return;
    }

    // Find wallet for this chat
    const { data: conn } = await supabaseAdmin.from("telegram_connections").select("wallet_address").eq("chat_id", chatId).single();
    if (!conn) { await sendTelegram(chatId, "Link your wallet first: /start 0xYOUR_WALLET"); return; }

    const wallet = conn.wallet_address;
    const { data: sub } = await supabaseAdmin.from("user_agent_subscriptions").select("*").eq("wallet_address", wallet).single();

    if (text === "/status") {
      // Read HF from on-chain (with 5s timeout guard)
      const hf = await getHFWithTimeout(wallet, 4000).catch(() => null);
      await sendTelegram(chatId, formatStatus(wallet, sub, hf ?? 0));
    }
    else if (text === "/enable") {
      await supabaseAdmin.from("user_agent_subscriptions").upsert({ wallet_address: wallet, agent_type: "personal", enabled: true });
      await sendTelegram(chatId, "✅ Agent enabled. Watching your position.");
    }
    else if (text === "/disable") {
      await supabaseAdmin.from("user_agent_subscriptions").upsert({ wallet_address: wallet, agent_type: "personal", enabled: false });
      await sendTelegram(chatId, "⏸ Agent disabled.");
    }
    else if (text.startsWith("/hf ")) {
      const t = parseFloat(text.slice(4));
      if (t >= 1.1 && t <= 3.0) {
        await supabaseAdmin.from("user_agent_subscriptions").upsert({ wallet_address: wallet, agent_type: "personal", hf_target: t });
        await sendTelegram(chatId, `✅ HF target set to ${t}`);
      } else {
        await sendTelegram(chatId, "HF target must be 1.1 – 3.0");
      }
    }
    else if (text === "/history") {
      const { data: actions } = await supabaseAdmin.from("agent_actions")
        .select("action,amount_usd,hf_before,hf_after,created_at")
        .eq("wallet_address", wallet).order("created_at", { ascending: false }).limit(5);
      const lines = (actions ?? []).map(a =>
        `${a.action}: $${a.amount_usd?.toFixed(0)} HF ${a.hf_before?.toFixed(2)}→${a.hf_after?.toFixed(2)}`
      );
      await sendTelegram(chatId, lines.length ? lines.join("\n") : "No actions yet.");
    }
  })();

  return Response.json({ ok: true }); // immediate response to Telegram
}
```

### B7: Register webhook (run once after Vercel deploy)

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://agentloan.vercel.app/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

**CHECKPOINT B:**
```
□ GET /api/personal-agent/settings?address=0x... → returns defaults
□ POST with valid signature → saved to Supabase
□ POST with wrong signature → 401
□ Telegram: send /start 0xADDRESS → welcome message received
□ Telegram: /enable /disable /status /hf all work
□ Fake POST to webhook without secret → 403
```

---

## PHASE C — Frontend UI (2h)

### C1: `src/components/agents/PersonalAgentPanel.tsx`

**State 1 — Not set up:**
```
┌──────────────────────────────────────────┐
│ PERSONAL AGENT               [INACTIVE]  │
├──────────────────────────────────────────┤
│ ① Approve xUSDC    [APPROVE →]   ✓/○   │
│ ② Authorize agent  [AUTHORIZE →] ✓/○   │
│ ③ HF Target  [1.30  ▲▼]               │
│                                          │
│            [ACTIVATE AGENT]             │
└──────────────────────────────────────────┘
```

**State 2 — Active:**
```
┌──────────────────────────────────────────┐
│ PERSONAL AGENT               [● ACTIVE]  │
├──────────────────────────────────────────┤
│ HF   1.42  →  Target  1.30              │
│ Reserve  2,500 xUSDC approved           │
│                                          │
│ Deployed $500 to yield · 6h ago         │
│                                          │
│ [Telegram ✓]  [History]  [Disable]     │
└──────────────────────────────────────────┘
```

**Telegram connect section:**
```
Connect Telegram for notifications:

  1. Open @AgentLoanBot
  2. Send this command:
     /start 0xYOUR_WALLET  [Copy]
  
  Status: ● Connected / ○ Not connected (polls every 5s)
```
Note: show copyable command as PRIMARY method. Deep link as secondary.
Deep link format (correct): `https://t.me/AgentLoanBot?start=0xWALLET`

**Settings POST — wallet ownership proof:**
```typescript
// Sign message before POST to prove wallet ownership
const message = `AgentLoan: update settings for ${address.toLowerCase()}`;
const signature = await walletClient.signMessage({ message });
await fetch("/api/personal-agent/settings", {
  method: "POST",
  body: JSON.stringify({ address, hfTarget, enabled, signature, message }),
});
```

**LLM section (optional, collapsible):**
```
▼ AI Reasoning (optional)
  Default: Protocol Gemini key (shared)
  [Use my own key ▼]
    Provider: [Gemini ▼] [OpenAI] [DeepSeek] [Custom]
    API Key: [••••••] [Test] [Save]
  Note: Your key is encrypted before storage. Enables market-aware decisions.
```

### C2: Update `AgentsTab.tsx`

```typescript
import { PersonalAgentPanel } from "./PersonalAgentPanel";
export function AgentsTab() {
  return (
    <div>
      <PersonalAgentPanel />
      <CoordinatorPanel />
      <BotStatusPanel />
    </div>
  );
}
```

**CHECKPOINT C:**
```
□ Setup wizard: approve → authorize → activate end-to-end
□ Settings POST requires wallet signature — rejects wrong signature
□ Panel shows correct on-chain HF
□ Telegram connect: copyable command shown, ✓ after linking
□ LLM key save: encrypts before storing
□ History shows last actions
□ Disable → Supabase updated → agent stops acting
```

---

## PHASE D — VPS Agent (2.5h)

### D1: `agents/personal-agent.ts` — imports + helpers

```typescript
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { callLLM } from "./lib/gemini-client";        // existing function
import { publicClient, getPositionsBatch } from "./lib/pool-reader";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const DRY_RUN = process.env.DRY_RUN === "true";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EXECUTOR_ADDR = ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR;
const X_USDC_ADDR   = ARC_TESTNET_CONTRACTS.X_USDC;
const MIN_COVERAGE  = 0.10; // only act if approved covers ≥10% of needed repay
```

### D2: Repay formula — MUST use weighted collateral

```typescript
// HF = totalCollateralUSD (weighted) / totalDebtUSD
// Target HF after repay: target = weightedColl / (debt - repay)
// → repay = debt - weightedColl / target

function calcRepayAmount(pos: UserPosition, targetHF: number): bigint {
  const weightedCollUSD = pos.totalWeightedCollateralUSD; // from getUserAccountData — already weighted
  const debtUSD         = pos.totalDebtUSD;
  if (debtUSD === 0n) return 0n;

  const wColl = Number(weightedCollUSD) / 1e18;
  const debt  = Number(debtUSD) / 1e18;
  const repayUSD = Math.max(0, debt - wColl / targetHF);

  return parseUnits(repayUSD.toFixed(6), 6);  // xUSDC 6 decimals
}
```

### D3: shouldCallLLM — uses `last_llm_call_at` from Supabase

```typescript
const MIN_LLM_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function shouldCallLLM(user: UserSubscription): boolean {
  if (!user.last_llm_call_at) return true;
  const age = Date.now() - new Date(user.last_llm_call_at).getTime();
  return age > MIN_LLM_INTERVAL_MS;
}

async function updateLastLLMCall(wallet: string) {
  await supabase.from("user_agent_subscriptions")
    .update({ last_llm_call_at: new Date().toISOString() })
    .eq("wallet_address", wallet);
}
```

### D4: LLM decision — uses `callLLM` not `llmClient.complete`

```typescript
async function decideLLM(user: UserSubscription, pos: UserPosition): Promise<Decision> {
  const memories = await supabase.from("agent_memory")
    .select("content")
    .eq("wallet_address", user.wallet_address)
    .order("created_at", { ascending: false })
    .limit(10);

  const hf      = Number(pos.healthFactor) / 1e18;
  const debtUSD = Number(pos.totalDebtUSD) / 1e18;
  const collUSD = Number(pos.totalWeightedCollateralUSD) / 1e18; // weighted

  const prompt = `
You are a DeFi position manager for ${user.wallet_address.slice(0,10)}...

CURRENT STATE:
- Health Factor: ${hf.toFixed(3)} (target: ${user.hf_target})
- Total debt: $${debtUSD.toFixed(0)}
- Weighted collateral: $${collUSD.toFixed(0)}
- xUSDC approved to agent: $${Number(approvedAmount)/1e6}

USER MEMORY:
${(memories.data ?? []).map(m => `- ${m.content}`).join("\n") || "- No history yet"}

ACTIONS: repay(amount) | deploy_yield(amount) | skip

Respond in JSON only: {"action":"repay"|"deploy_yield"|"skip","amount_usd":number,"reason":"..."}`.trim();

  const raw = await callLLM(prompt);
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(start, end + 1));
}
```

### D5: Main loop — complete

```typescript
let isRunning = false;
const BLOCK_INTERVAL = 20; // check every 20 blocks for HF changes (~10s)
let lastCheckedBlock = 0n;

publicClient.watchBlocks({
  onBlock: async (block) => {
    if (block.number % BigInt(BLOCK_INTERVAL) !== 0n) return;
    if (isRunning) return;
    isRunning = true;
    try {
      await runCycle();
    } finally {
      isRunning = false;
    }
  }
});

async function runCycle() {
  // Load all enabled users in 1 Supabase query
  const { data: users } = await supabase
    .from("user_agent_subscriptions")
    .select("*")
    .eq("enabled", true)
    .eq("agent_type", "personal");

  if (!users?.length) return;

  // Tier 1: batch HF for all users — 1 Multicall3 RPC call
  const positions = await getPositionsBatch(users.map(u => u.wallet_address));

  for (const user of users) {
    const pos = positions.find(p => p.address.toLowerCase() === user.wallet_address);
    if (!pos || pos.totalDebtUSD === 0n) continue;

    const hf = Number(pos.healthFactor) / 1e18;
    const urgency = scoreUrgency(user, hf);
    if (urgency === 0) continue;

    // Authorization check (on-chain, fast)
    const authorized = await pool.agentAuthorized(user.wallet_address, EXECUTOR_ADDR);
    if (!authorized) continue;

    // Approved amount
    const approved = await xUSDC.allowance(user.wallet_address, EXECUTOR_ADDR);

    let decision: Decision;
    if (urgency >= 3) {
      // Emergency: no LLM, act immediately
      const repay = calcRepayAmount(pos, user.hf_target + 0.2);
      decision = { action: "emergency_protect", amountUsd: Number(repay)/1e6, reason: `HF ${hf.toFixed(2)} < 1.05` };
    } else if (shouldCallLLM(user)) {
      decision = await decideLLM(user, pos).catch(() =>
        decideRuleBased(user, pos) // fallback if LLM fails
      );
      await updateLastLLMCall(user.wallet_address);
    } else {
      decision = decideRuleBased(user, pos);
    }

    if (decision.action === "skip") continue;

    await executeDecision(user, pos, decision, approved);
  }
}

function scoreUrgency(user: UserSubscription, hf: number): number {
  if (hf < 1.05)                 return 3; // emergency
  if (hf < user.hf_target)       return 2; // needs repay
  if (hf < user.hf_target + 0.15) return 1; // approaching threshold
  return 0; // safe
}

async function executeDecision(user, pos, decision, approved) {
  const hfBefore = Number(pos.healthFactor) / 1e18;
  let repayAmount: bigint;

  if (decision.action === "repay" || decision.action === "emergency_protect") {
    repayAmount = parseUnits(decision.amountUsd.toFixed(6), 6);

    // Minimum coverage check: don't act if approved covers < 10% of needed
    if (approved < repayAmount) {
      const coverage = Number(approved) / Number(repayAmount);
      if (coverage < MIN_COVERAGE) {
        await logAction(user.wallet_address, "skip", {
          reason: `Approved ($${Number(approved)/1e6}) < ${MIN_COVERAGE*100}% of needed ($${decision.amountUsd})`,
          hfBefore, success: false,
        });
        await notifyUser(user.wallet_address, `⚠️ Agent cannot act: insufficient xUSDC reserve.\nNeed $${decision.amountUsd.toFixed(0)}, have $${(Number(approved)/1e6).toFixed(0)} approved.`);
        return;
      }
      repayAmount = approved; // partial repay
    }

    if (DRY_RUN) {
      console.log(`[DRY_RUN] Would emergencyProtect ${user.wallet_address} for $${Number(repayAmount)/1e6}`);
      return;
    }

    const tx = await executor.emergencyProtect(user.wallet_address, repayAmount);
    const receipt = await tx.wait();

    // Read hfAfter — explicit RPC call after tx
    const posAfter = await getPositionsBatch([user.wallet_address]);
    const hfAfter = posAfter[0] ? Number(posAfter[0].healthFactor) / 1e18 : 0;

    await logAndNotify(user, "emergency_protect", {
      amountUsd: Number(repayAmount)/1e6,
      hfBefore, hfAfter,
      txHash: receipt.hash,
      reason: decision.reason,
    });
    await saveMemory(user.wallet_address, `Repaid $${(Number(repayAmount)/1e6).toFixed(0)}: HF ${hfBefore.toFixed(2)}→${hfAfter.toFixed(2)}. ${decision.reason}`);
  }

  if (decision.action === "deploy_yield") {
    const walletBalance = await xUSDC.balanceOf(user.wallet_address);
    const deployAmount  = walletBalance < approved ? walletBalance : approved;

    if (deployAmount < parseUnits("10", 6)) return; // skip dust

    if (DRY_RUN) {
      console.log(`[DRY_RUN] Would deployToYield ${user.wallet_address} $${Number(deployAmount)/1e6}`);
      return;
    }

    const tx = await executor.deployToYield(user.wallet_address, deployAmount);
    const receipt = await tx.wait();

    await logAndNotify(user, "deploy_yield", {
      amountUsd: Number(deployAmount)/1e6,
      hfBefore, hfAfter: hfBefore, // HF unchanged when supplying
      txHash: receipt.hash,
      reason: decision.reason,
    });
  }
}
```

### D6: `run-personal-agent.sh`

```bash
#!/bin/bash
cd /root/arcbank
npx ts-node --project tsconfig.hardhat.json agents/personal-agent.ts
```

### D7: Add to `ecosystem.config.js`

```javascript
{
  name: "personal-agent",
  script: "/root/arcbank/run-personal-agent.sh",
  interpreter: "bash",
  cwd: "/root/arcbank",
  restart_delay: 10000,
  max_restarts: 10,
  min_uptime: "15s",
  out_file: "logs/personal-agent-out.log",
  error_file: "logs/personal-agent-err.log",
  log_date_format: "YYYY-MM-DD HH:mm:ss",
  merge_logs: true,
}
```

### D8: VPS RAM check before deploy

```bash
free -m
# Current processes use ~350-370MB
# personal-agent expected: 120-150MB
# Required free: > 200MB to be safe

# If RAM tight: stop coordinator temporarily, start personal-agent, check RSS
pm2 stop coordinator-agent
pm2 start ecosystem.config.js --only personal-agent
pm2 info personal-agent | grep memory  # should be < 150MB
# If OK: restart coordinator
pm2 restart coordinator-agent
free -m  # must still be > 80MB free
```

**CHECKPOINT D:**
```
□ DRY_RUN=true: logs decisions, no on-chain txs
□ DRY_RUN=false: first run with 1 test user, verify correct
□ calcRepayAmount uses totalWeightedCollateralUSD (not raw)
□ hfAfter is read after tx (not undefined)
□ shouldCallLLM respects 5-min cooldown per user
□ Low coverage (<10%) → skip with Telegram warning
□ Memory saves after each action
□ RAM stable after start: free > 80MB
```

---

## PHASE E — Integration Test (30 min)

### E1: DRY_RUN first
```bash
DRY_RUN=true pm2 start ecosystem.config.js --only personal-agent
pm2 logs personal-agent --lines 20
# Must see: "[DRY_RUN] Would..." — no real txs
```

### E2: Full setup
```
Connect wallet → AGENTS tab
→ Approve 2000 xUSDC to AgentExecutor
→ Authorize AgentExecutor in LendingPool
→ Set HF target 1.3 → Enable
→ Telegram: /start 0xWALLET → ✓ connected
→ /status → shows HF
```

### E3: deployToYield
```
Keep 2000 xUSDC idle in wallet
Wait 1-2 cycles (~10s)
→ Agent deploys to pool
→ Panel shows "Deployed $2000"
→ Telegram: "Agent deployed $2,000 to yield"
```

### E4: Auto-repay
```
Borrow until HF ~1.15
Wait 1 cycle
→ Agent detects HF < target
→ LLM or rule decides repay amount
→ TX executes
→ HF improves
→ Telegram notification sent
```

### E5: Telegram commands
```
/disable → panel inactive, agent skips
/enable  → resumes
/hf 1.5  → threshold changes
/status  → shows current HF
```

**ALL DONE when:**
```
□ DRY_RUN test passes without errors
□ Full setup flow works
□ deployToYield executes automatically
□ auto-repay works correctly
□ hfAfter shows correct value (not NaN/undefined)
□ Telegram: all commands work
□ Telegram: notification sent after action
□ Low reserve test: warns correctly, no partial tx
□ RAM stable after 10 min
```

---

## Edge cases

| Scenario | Handling |
|---|---|
| User revokes authorization | `agentAuthorized` check per-user before tx → skip |
| User disables (Supabase updated) | Next cycle skips (enabled flag from fresh DB load) |
| Approved < 10% of needed | Skip + Telegram warning "insufficient reserve" |
| LLM fails / key expired | Fallback to rule-based + log warning |
| Pool paused | tx reverts → log error, notify user |
| hfAfter read fails | Log error, store null, notify but continue |
| VPS restart | PM2 auto-restarts, resumes next block |
| Telegram not connected | Notifications silently skip |
| Multiple users same block | Batch Multicall3 read, sequential execute |

---

## Issues fixed from review

| Issue | Fix applied |
|---|---|
| `updated_at` not auto-updating | `moddatetime` trigger added |
| Cleanup not scheduled | `pg_cron` schedule added |
| `ENCRYPTION_KEY` missing | `LLM_ENCRYPTION_KEY` env var defined |
| No DB indexes | 4 indexes added |
| `last_llm_call_at` not in schema | Column added to `user_agent_subscriptions` |
| Telegram webhook unauthenticated | `X-Telegram-Bot-Api-Secret-Token` validation |
| Settings POST: no ownership proof | EIP-191 signature verification |
| Helper functions undefined | All defined in `agent-helpers.ts` |
| Telegram slow RPC: timeout risk | Respond immediately, process async |
| Repay formula: wrong collateral | Explicitly uses `totalWeightedCollateralUSD` |
| `hfAfter` never computed | Explicit `getPositionsBatch` after tx |
| `btcChange1h` not available | Removed from LLM prompt |
| `shouldCallLLM` undefined | Defined with `last_llm_call_at` column |
| `llmClient.complete` not in codebase | Use `callLLM` from `gemini-client.ts` |
| Partial repay < 10% useful | Minimum coverage check added |
| RAM: 4th process may OOM | Check + sequence documented |
| No DRY_RUN mode | `DRY_RUN=true` support added |
| Telegram deep link unreliable | Copyable command shown as primary |

---

## Build order

```
Phase A  Supabase + env vars          45 min  ← START
Phase B  API routes + helpers          1.5h
Phase C  PersonalAgentPanel UI         2h
Phase D  personal-agent.ts             2.5h
Phase E  Integration test (DRY_RUN first)  30 min

Total: ~7h
```
