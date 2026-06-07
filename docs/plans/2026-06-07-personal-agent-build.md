# Personal Agent — Build Plan
> Status: APPROVED — ready to implement
> Created: 2026-06-07

---

## Tổng quan thay đổi

| Việc | Loại | Rủi ro |
|---|---|---|
| Rút USDC từ oracle cũ | Script | Thấp |
| LendingPool.sol + 4 functions | Contract update | Trung bình |
| AgentExecutor.sol | Contract mới | Thấp |
| Hardhat tests | Test | Không |
| Redeploy contracts | Deploy | Trung bình |
| Tách oracle keeper | VPS | Cao — cẩn thận |
| personal-agent.ts | VPS | Trung bình |
| Supabase | Cloud | Thấp |
| UI panel | Frontend | Thấp |

---

## PRE-FLIGHT — Trước khi làm bất cứ thứ gì

### PF-1: Rút USDC từ oracle cũ

Oracle `0xf0fcba0e48e53870e451ff57c77cc517337b1c2d` tích lũy USDC fee từ mỗi lần bot push prices.
Phải rút về trước khi contract bị orphan.

```bash
# Chạy script này TRƯỚC KHI deploy bất cứ thứ gì
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/withdraw-oracle-fees.ts --network arcTestnet
```

Script cần viết: `scripts/withdraw-oracle-fees.ts`
```typescript
// Gọi withdrawFees() trên oracle cũ
// In ra số USDC rút được
// Verify deployer wallet balance tăng lên
```

**CHECKPOINT PF-1:** Deployer wallet nhận USDC, oracle balance = 0

---

### PF-2: Kiểm tra VPS

```bash
# SSH vào VPS, chạy lệnh này
free -m
# RAM free phải > 400MB trước khi làm bất cứ thứ gì
# Nếu < 400MB → pm2 stop coordinator-agent trước

pm2 status
# Phải thấy 3 process: arcbank-bot, coordinator-agent, signal-server

swapon --show
# Phải có ít nhất 2GB swap đang active
```

**CHECKPOINT PF-2:** RAM free > 400MB, swap active, 3 processes running

---

### PF-3: Ghi lại trạng thái hiện tại

```bash
# Trên VPS — lưu lại để rollback nếu cần
cp /root/arcbank/.env.local /root/arcbank/.env.local.backup
pm2 save
```

---

## PHASE 0 — Code Changes (local, KHÔNG deploy, KHÔNG động VPS)

### P0-1: Tách oracle keeper khỏi liquidation-bot

**File:** `agents/liquidation-bot.ts`
- Tìm hàm `safeUpdateOracle()` và block gọi nó
- Move logic sang `agents/lib/oracle-keeper.ts` (file mới)
- liquidation-bot chỉ gọi oracle-keeper như 1 import

**File mới:** `agents/lib/oracle-keeper.ts`
```typescript
export async function runOracleKeeper(wallet: WalletClient): Promise<void>
// Giống safeUpdateOracle hiện tại, nhưng standalone
```

**Kiểm tra:** liquidation-bot vẫn compile, logic không đổi

---

### P0-2: Thiết kế AgentExecutor.sol (generic, không chỉ Personal Agent)

**File:** `contracts/AgentExecutor.sol`

```solidity
contract AgentExecutor is Ownable {
    ILendingPool public immutable pool;
    IERC20       public immutable xUSDC;

    // agent wallet address (VPS) được phép gọi execute functions
    mapping(address => bool) public authorizedAgents;

    // owner (deployer) thêm/xóa agent wallet
    function setAgent(address agent, bool allowed) external onlyOwner

    // === PERSONAL AGENT actions ===
    // Pull xUSDC từ user → supply vào pool → position credit về user
    function deployToYield(address user, uint256 amount) external onlyAgent

    // Rút từ supply của user + repay nợ của user — 1 tx atomic
    function emergencyProtect(address user, uint256 repayAmount) external onlyAgent

    // === HUNTER AGENT actions (Phase 2 sau) ===
    // liquidateFor(borrower, ...) — để trống, implement sau

    modifier onlyAgent() {
        require(authorizedAgents[msg.sender], "not agent");
        _;
    }
}
```

---

### P0-3: LendingPool.sol — thêm 4 functions

**File:** `contracts/LendingPool.sol`

Thêm vào sau các function hiện có:

```solidity
// 1. User cho phép address agent act on their behalf
mapping(address => mapping(address => bool)) public agentAuthorized;
function authorizeAgent(address agent, bool allowed) external {
    agentAuthorized[msg.sender][agent] = allowed;
    emit AgentAuthorized(msg.sender, agent, allowed);
}

// 2. Supply thay cho user — position credit về onBehalfOf
function depositFor(
    address onBehalfOf,
    address token,
    uint256 amount
) external nonReentrant {
    // require msg.sender đã được onBehalfOf authorize
    // hoặc msg.sender là AgentExecutor contract
    require(agentAuthorized[onBehalfOf][msg.sender], "not authorized");
    _deposit(onBehalfOf, token, amount);
}

// 3. Rút từ position của user — gửi token về recipient
function withdrawFor(
    address onBehalfOf,
    address token,
    uint256 amount,
    address recipient
) external nonReentrant {
    require(agentAuthorized[onBehalfOf][msg.sender], "not authorized");
    _withdraw(onBehalfOf, token, amount, recipient);
}

// 4. Ai cũng có thể repay thay người khác (như Aave)
// xUSDC pull từ msg.sender
function repayFor(
    address borrower,
    address token,
    uint256 amount
) external nonReentrant {
    // không cần authorization — ai cũng được phép trả nợ cho người khác
    _repay(borrower, token, amount, msg.sender);
}
```

Events cần thêm:
```solidity
event AgentAuthorized(address indexed user, address indexed agent, bool allowed);
```

---

### P0-4: Supabase schema — multi-agent từ đầu

```sql
-- Thay vì user_agents (1 user = 1 agent)
-- Dùng user_agent_subscriptions (1 user = nhiều agent)

CREATE TABLE user_agent_subscriptions (
    id              BIGSERIAL PRIMARY KEY,
    wallet_address  TEXT NOT NULL,
    agent_type      TEXT NOT NULL,  -- 'personal' | 'hunter' | 'protocol'
    config          JSONB,          -- { hf_target: 1.3, llm_provider: 'gemini', ... }
    llm_api_key_enc TEXT,           -- AES-256 encrypted
    enabled         BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(wallet_address, agent_type)
);

CREATE TABLE agent_memory (
    id             BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    agent_type     TEXT NOT NULL,
    type           TEXT,            -- 'observation' | 'decision' | 'outcome'
    content        TEXT,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_actions (
    id             BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    agent_type     TEXT NOT NULL,
    action         TEXT,            -- 'repay' | 'deposit' | 'liquidate' | 'alert'
    amount_usd     NUMERIC,
    hf_before      NUMERIC,
    hf_after       NUMERIC,
    success        BOOLEAN,
    tx_hash        TEXT,
    error          TEXT,
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- Cleanup cron: giữ 50 memory entries per user per agent type
-- Cleanup cron: xóa agent_actions cũ hơn 30 ngày
```

**CHECKPOINT P0:** Code compile, không có lỗi TypeScript, chưa deploy gì

---

## PHASE 1 — Tests (local Hardhat, KHÔNG deploy lên testnet)

### P1-1: Viết tests cho LendingPool v3

**File:** `test/LendingPoolV3.test.ts`

Test cases bắt buộc pass:

```
✓ authorizeAgent: user A authorize agent X
✓ authorizeAgent: unauthorized call bị reject
✓ depositFor: agent X deposit xUSDC cho user A → position về A
✓ depositFor: non-authorized agent bị reject
✓ withdrawFor: agent X rút xUSDC từ user A → nhận đúng amount
✓ withdrawFor: cannot withdraw hơn supply balance
✓ withdrawFor: non-authorized agent bị reject
✓ repayFor: agent X repay nợ cho user A → debt giảm đúng
✓ repayFor: anyone can call (không cần authorization)
✓ repayFor: xUSDC pull từ msg.sender (agent), không phải user
✓ HF sau depositFor phải tăng
✓ HF sau repayFor phải tăng
✓ Reentrancy guard: depositFor + withdrawFor không bị reentrancy
```

### P1-2: Viết tests cho AgentExecutor

**File:** `test/AgentExecutor.test.ts`

```
✓ deployToYield: pull xUSDC từ user → deposit vào pool → user có supply position
✓ deployToYield: unauthorized caller bị reject
✓ emergencyProtect: withdraw từ user supply + repay nợ trong 1 tx
✓ emergencyProtect: HF sau khi chạy phải > HF trước
✓ emergencyProtect: không bị liquidate giữa chừng (HF không < 1.0 tại bất kỳ điểm nào)
✓ emergencyProtect: nếu supply < repayAmount → revert với lỗi rõ ràng
✓ setAgent: owner thêm agent wallet
✓ setAgent: non-owner bị reject
```

### P1-3: Chạy tất cả tests

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test
```

**CHECKPOINT P1:** Phải thấy toàn bộ tests pass.
```
56 existing tests ✓ (không được break tests cũ)
X  new V3 tests   ✓
Y  AgentExecutor  ✓
TOTAL: tất cả pass
```

**KHÔNG TIẾP TỤC nếu có test nào fail.**

---

## PHASE 2 — Deploy lên Arc Testnet

### P2-1: Rút USDC từ oracle cũ (nếu chưa làm ở PF-1)

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/withdraw-oracle-fees.ts --network arcTestnet
```

### P2-2: Deploy PriceOraclePyth mới

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/deploy-pyth-oracle.ts --network arcTestnet
```

Sau khi deploy:
- Ghi lại địa chỉ oracle mới
- Verify: gọi `getPrice(xUSDC)` → phải trả về giá hợp lệ
- Verify: gọi `getPrice(xEURC)` → phải trả về giá hợp lệ (staleness = 30 ngày đã set)

### P2-3: Deploy LendingPool v3

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/deploy-lending-pool-v3.ts --network arcTestnet
```

Script phải:
- Deploy với oracle address mới từ P2-2
- Gọi `authorizeToken()` cho xUSDC, xEURC, xclrBTC
- In ra địa chỉ LendingPool mới

### P2-4: Deploy AgentExecutor

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/deploy-agent-executor.ts --network arcTestnet
```

Script phải:
- Deploy với LendingPool address từ P2-3
- Gọi `setAgent(BOT_WALLET_ADDRESS, true)` → VPS bot wallet được phép execute
- In ra địa chỉ AgentExecutor

### P2-5: Update config

**File:** `config/contracts.ts`
```typescript
LENDING_POOL:    "0x<new>",
PRICE_ORACLE:    "0x<new>",
AGENT_EXECUTOR:  "0x<new>",   // thêm mới
```

**File:** `vercel.json`
```json
"NEXT_PUBLIC_LENDING_POOL_ADDRESS": "0x<new>",
"NEXT_PUBLIC_PRICE_ORACLE_ADDRESS": "0x<new>",
"NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS": "0x<new>"
```

### P2-6: Seed liquidity vào pool mới

```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/seed.ts --network arcTestnet
```

Verify sau khi seed:
- xUSDC total supplied > 0
- xEURC total supplied > 0
- xclrBTC total supplied > 0

**CHECKPOINT P2:**
```
□ Oracle deploy thành công, getPrice() hoạt động
□ LendingPool v3 deploy thành công
□ AgentExecutor deploy thành công
□ config/contracts.ts updated
□ Liquidity seeded
□ Web app build không lỗi (npm run build local)
```

---

## PHASE 3 — VPS (CẨN THẬN NHẤT)

### Quy tắc VPS
```
Rule 1: Không stop tất cả 3 processes cùng lúc
Rule 2: Check free -m trước mỗi bước — nếu < 300MB RAM free → dừng lại
Rule 3: npm install phải có swap active
Rule 4: Sau mỗi pm2 restart → đợi 30s → check pm2 logs
Rule 5: Nếu có lỗi bất kỳ → STOP, không tiếp tục
```

### P3-1: SSH vào VPS, kiểm tra trạng thái

```bash
free -m        # RAM phải > 400MB free
swapon --show  # Swap phải active
pm2 status     # 3 processes phải running
```

### P3-2: Pull code mới (KHÔNG npm install trước)

```bash
cd /root/arcbank
git pull origin main
# Chỉ pull code, chưa install
```

### P3-3: Update .env.local với contract addresses mới

```bash
nano /root/arcbank/.env.local
# Cập nhật:
# NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x<new>
# NEXT_PUBLIC_PRICE_ORACLE_ADDRESS=0x<new>
# NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS=0x<new>
```

### P3-4: npm install (cẩn thận nhất)

```bash
# Stop coordinator trước (tốn RAM nhất vì có LLM)
pm2 stop coordinator-agent

# Kiểm tra RAM sau khi stop
free -m  # Phải > 600MB free

# Install (có thể mất 3-5 phút)
cd /root/arcbank/agents
npm install --legacy-peer-deps

# Restart coordinator sau khi install xong
pm2 restart coordinator-agent
pm2 logs coordinator-agent --lines 20
# Phải thấy "Coordinator starting..." không có lỗi
```

### P3-5: Update và restart liquidation-bot

```bash
pm2 stop arcbank-bot
pm2 restart arcbank-bot
# Đợi 30s
pm2 logs arcbank-bot --lines 30
# Phải thấy bot starting, oracle updating, không có lỗi contract
```

### P3-6: Deploy personal-agent process

```bash
# Thêm vào ecosystem.config.js
# { name: "personal-agent", script: "/root/arcbank/run-personal-agent.sh", interpreter: "bash" }

pm2 start ecosystem.config.js --only personal-agent
pm2 logs personal-agent --lines 20
```

**CHECKPOINT P3:**
```
□ pm2 status: 4 processes running (bot, coordinator, signal, personal-agent)
□ bot logs: không có lỗi, oracle đang update
□ coordinator logs: không có lỗi
□ signal-server: vẫn online
□ personal-agent logs: "Watching for users..." không có lỗi
□ free -m: RAM free > 200MB
```

---

## PHASE 4 — Frontend

### P4-1: PersonalAgentPanel.tsx

UI hiển thị:
```
┌─────────────────────────────────────────────┐
│  PERSONAL AGENT                    [● ON]   │
├─────────────────────────────────────────────┤
│  Status: ACTIVE — watching your position    │
│                                             │
│  HF Target    [1.30  ▲▼]                   │
│  Reserve      2,500 xUSDC approved          │
│                                             │
│  Last action:                               │
│  Repaid 230 xUSDC · 2h ago                 │
│  HF: 1.08 → 1.34                           │
│                                             │
│  [Approve xUSDC]  [View History]            │
│  [Disable Agent]                            │
└─────────────────────────────────────────────┘
```

### P4-2: API route `/api/personal-agent`

- `GET /api/personal-agent?address=0x...` → lấy settings + last actions từ Supabase
- `POST /api/personal-agent/settings` → save config
- `POST /api/personal-agent/toggle` → enable/disable

### P4-3: Deploy frontend

```bash
git add -A && git commit -m "feat(agent): personal agent panel + API routes"
git push origin main
# Vercel auto-deploy
```

**CHECKPOINT P4:**
```
□ UI hiển thị đúng
□ Enable/disable toggle hoạt động
□ Approve xUSDC flow hoạt động
□ Last actions hiển thị từ Supabase
□ Không có console errors
```

---

## Rollback Plan

Nếu có vấn đề ở bất kỳ phase nào:

**Phase 2 fail:** contracts mới không hoạt động
→ Revert `config/contracts.ts` về địa chỉ cũ
→ Web app vẫn chạy với pool cũ

**Phase 3 fail:** VPS bot bị lỗi
→ `pm2 restart arcbank-bot` với config cũ
→ `cp /root/arcbank/.env.local.backup /root/arcbank/.env.local`
→ `pm2 restart all`

**Signal server không bị động** trong suốt quá trình này.

---

## Scope của MVP này

| Có | Không có |
|---|---|
| Auto-repay khi HF nguy hiểm | LLM reasoning (phase 2) |
| Auto-supply kiếm yield | Circle wallet per user |
| Atomic emergency protect | Yield rotation (no DEX) |
| Enable/disable toggle | Auto-compound |
| History log | |
| HF target config | |
