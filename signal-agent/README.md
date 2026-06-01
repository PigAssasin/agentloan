# ArcBank Signal Agent

An x402-inspired HTTP server that scans borrower positions every 5 seconds and sells early liquidation warnings to bots.

**How it works:** Bots pay 1 xUSDC → receive 1,000 signals (24h session) → get 15-30s head start on liquidations.

---

## Quick Setup (Linux/macOS VPS)

```bash
# From the signal-agent/ directory
bash setup.sh
```

The script will:
- Install dependencies
- Set up viem at `/root/viem-sdk` (isolated, no conflicts)
- Generate a wallet for receiving payments
- Create a PM2 config

---

## Manual Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up viem (required — uses isolated SDK to avoid conflicts)

```bash
mkdir -p /root/viem-sdk
cd /root/viem-sdk && npm init -y && npm install viem
cd -
```

### 3. Generate a wallet

```bash
node -e "
const { generatePrivateKey, privateKeyToAccount } = require('/root/viem-sdk/node_modules/viem/accounts');
const pk = generatePrivateKey();
const acc = privateKeyToAccount(pk);
console.log('Private Key:', pk);
console.log('Address:', acc.address);
"
```

Save these securely — your wallet will receive xUSDC payments.

### 4. Fund the wallet with USDC (for gas)

The Signal Agent submits one on-chain transaction per payment verification. You need ~0.1 native USDC on Arc Testnet for gas.

Get testnet USDC: https://faucet.circle.com

### 5. Register on Arc ERC-8004 (optional but recommended)

Gives your Signal Agent an on-chain verified identity.

```bash
# In the arcbank/ parent directory:
echo "SIGNAL_AGENT_PRIVATE_KEY=0x<your-key>" >> .env.local
echo "SIGNAL_AGENT_ADDRESS=0x<your-address>" >> .env.local
node scripts/register-signal-agent-quick.js
# Copy the printed SIGNAL_AGENT_ERC8004_ID
```

### 6. Configure environment

```bash
export NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
export SIGNAL_AGENT_PORT=3001
export SIGNAL_AGENT_ADDRESS=0x<your-address>
export SIGNAL_AGENT_ERC8004_ID=<id from step 5>
```

### 7. Start

```bash
# Direct
node signal-server.js

# Via PM2 (recommended for 24/7)
pm2 start ecosystem.signal.config.js
pm2 save
pm2 startup
```

### 8. Verify

```bash
curl http://localhost:3001/v1/status
# {"online":true,"activeSessions":0,...}

curl -i http://localhost:3001/v1/signals
# HTTP/1.1 402 Payment Required
```

---

## API Reference

### `GET /v1/status` — Public stats (no payment)

```json
{
  "online": true,
  "activeSessions": 1,
  "sessionsIssued": 3,
  "signalsAvailable": 2,
  "lastScanAt": 1780324693831,
  "scanCount": 356,
  "totalPaidUsdc": "3",
  "agentAddress": "0x...",
  "agentId": "31772"
}
```

### `GET /v1/signals` — x402 payment required

**Without payment → 402:**
```json
{
  "error": "Payment required — 1 xUSDC for 1000 signals (24h)",
  "x-payment-required": "<base64 pricing info>"
}
```

**With `X-Payment-Tx: 0x<txHash>` → session issued:**
```json
{
  "signals": [
    {
      "borrower": "0x...",
      "healthFactor": "0.9700",
      "totalDebtUSD": "45000.00",
      "estimatedBonus": "1125.00"
    }
  ],
  "sessionId": "uuid-...",
  "remaining": 1000
}
```

**With `X-Session-Id: <uuid>` → signals served:**
```json
{
  "signals": [...],
  "scanAge": 2341
}
```

---

## Payment Flow (x402-inspired)

```
1. Bot: GET /v1/signals
   ← 402 { price: "1 xUSDC", payTo: "0x..." }

2. Bot: transfer 1 xUSDC to agent address

3. Bot: GET /v1/signals
         X-Payment-Tx: 0x<txHash>
   ← 200 { signals, sessionId, remaining: 1000 }

4. Bot: GET /v1/signals
         X-Session-Id: <uuid>
   ← 200 { signals }   (repeat up to 1000 times / 24h)
```

---

## Economics

| | Value |
|---|---|
| Price per session | 1 xUSDC |
| Signals per session | 1,000 |
| Session validity | 24 hours |
| Gas per payment tx | ~0.006 USDC |
| Net profit per session | ~0.994 xUSDC |
| Scan interval | 5 seconds |
| HF threshold | < 1.1 (early warning) |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SIGNAL_AGENT_ADDRESS` | ✅ | Wallet receiving xUSDC payments |
| `NEXT_PUBLIC_ARC_RPC` | ✅ | Arc Testnet RPC URL |
| `SIGNAL_AGENT_PORT` | No | HTTP port (default: 3001) |
| `SIGNAL_AGENT_ERC8004_ID` | No | On-chain agent identity |
| `ALLOWED_ORIGIN` | No | CORS origin (default: arcbank.vercel.app) |

---

## Notes

- Sessions are stored in memory — lost on restart (bots will re-pay on next scan cycle)
- `usedTxHashes` prevents replay attacks within a single process lifetime
- The Signal Agent uses `/root/viem-sdk/node_modules/viem` — do not change this path
- Port 3001 should be accessible from the internet for Vercel frontend stats
