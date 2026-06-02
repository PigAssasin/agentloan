/**
 * AgentLoan Signal Agent — x402-inspired HTTP server (plain JS, no ts-node)
 * Scans borrowers every 5s for HF < 1.1, sells signals via x402 protocol.
 */
const express  = require('express');
const dotenv   = require('dotenv');
const crypto   = require('crypto');
const { createPublicClient, http, parseAbiItem, encodeFunctionData, decodeFunctionResult, formatUnits } = require('/root/viem-sdk/node_modules/viem');

dotenv.config({ path: '/root/arcbank/.env.local' });

const RPC_URL       = process.env.NEXT_PUBLIC_ARC_RPC || 'https://rpc.testnet.arc.network';
const AGENT_ADDRESS = process.env.SIGNAL_AGENT_ADDRESS || '';
const PORT          = parseInt(process.env.SIGNAL_AGENT_PORT || '3001');
const POOL          = '0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec';
const X_USDC        = '0xFa090bd1A524D861542888B6c5e7965dde1F4f35';
const MULTICALL3    = '0xcA11bde05977b3631167028862bE2a173976CA11';

const chain = { id:5042002, name:'Arc Testnet', nativeCurrency:{name:'USDC',symbol:'USDC',decimals:6}, rpcUrls:{default:{http:[RPC_URL]}} };
const client = createPublicClient({ chain, transport: http(RPC_URL) });

const MC3_ABI = [{ name:'aggregate3', type:'function', stateMutability:'view',
  inputs:[{name:'calls',type:'tuple[]',components:[{name:'target',type:'address'},{name:'allowFailure',type:'bool'},{name:'callData',type:'bytes'}]}],
  outputs:[{name:'returnData',type:'tuple[]',components:[{name:'success',type:'bool'},{name:'returnData',type:'bytes'}]}]
}];
const LendingPoolABI = require('/root/arcbank/src/lib/abi-lending-pool.json');
const BORROW_EVENT   = parseAbiItem('event Borrow(address indexed token, address indexed user, uint256 amount)');
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// State
const sessions      = new Map();
const usedTxHashes  = new Set();
let cachedSignals   = [];
let lastScanAt      = 0;
let scanCount       = 0;
let totalPaid       = 0n;
let sessionsIssued  = 0;

async function scanPositions() {
  try {
    const latest = await client.getBlockNumber();
    const from   = latest > 10_000n ? latest - 10_000n : 0n;
    const logs   = await client.getLogs({ address: POOL, event: BORROW_EVENT, fromBlock: from, toBlock: latest });
    const borrowers = [...new Set(logs.map(l => l.args?.user?.toLowerCase()).filter(Boolean))];
    if (borrowers.length === 0) { cachedSignals = []; lastScanAt = Date.now(); scanCount++; return; }

    const calls = borrowers.map(u => ({
      target: POOL, allowFailure: true,
      callData: encodeFunctionData({ abi: LendingPoolABI, functionName: 'getUserAccountData', args: [u] }),
    }));
    const results = await client.readContract({ address: MULTICALL3, abi: MC3_ABI, functionName: 'aggregate3', args: [calls] });

    const WAD = 10n ** 18n;
    const signals = [];
    for (let i = 0; i < results.length; i++) {
      if (!results[i].success) continue;
      try {
        const d = decodeFunctionResult({ abi: LendingPoolABI, functionName: 'getUserAccountData', data: results[i].returnData });
        if (d.totalDebtUSD === 0n) continue;
        if (d.healthFactor >= WAD * 11n / 10n) continue;
        signals.push({
          borrower:       borrowers[i],
          healthFactor:   (Number(d.healthFactor) / 1e18).toFixed(4),
          totalDebtUSD:   formatUnits(d.totalDebtUSD, 18),
          estimatedBonus: formatUnits(d.totalDebtUSD / 2n * 5n / 100n, 18),
        });
      } catch { continue; }
    }
    cachedSignals = signals.sort((a, b) => parseFloat(a.healthFactor) - parseFloat(b.healthFactor));
    lastScanAt = Date.now();
    scanCount++;
    if (signals.length > 0) console.log(`[scan #${scanCount}] ${signals.length} signal(s)`);
    else process.stdout.write('.');
  } catch (e) {
    console.error('Scan error:', (e.message || '').slice(0, 150));
  }
}

async function verifyPayment(txHash) {
  if (usedTxHashes.has(txHash)) return null;
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') return null;
    const logs = await client.getLogs({ address: X_USDC, event: TRANSFER_EVENT, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
    for (const log of logs) {
      if (log.args?.to?.toLowerCase() === AGENT_ADDRESS.toLowerCase()) {
        const amount = log.args?.value || 0n;
        if (amount >= 1_000_000n) { usedTxHashes.add(txHash); totalPaid += amount; return log.args?.from; }
      }
    }
    return null;
  } catch { return null; }
}

const app = express();
app.use(express.json());
app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','X-Session-Id, X-Payment-Tx'); next(); });

const priceInfo = () => Buffer.from(JSON.stringify({ x402Version:'1.0', price:'1', currency:'xUSDC', payTo:AGENT_ADDRESS, signals:1000, validity:'24h', network:'eip155:5042002' })).toString('base64');

app.get('/v1/signals', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const paymentTx = req.headers['x-payment-tx'];

  if (sessionId) {
    const s = sessions.get(sessionId);
    if (!s || s.remaining <= 0 || Date.now() > s.expiresAt) {
      sessions.delete(sessionId);
      return res.status(402).json({ error:'Session expired', 'x-payment-required': priceInfo() });
    }
    s.remaining--;
    res.setHeader('X-Session-Remaining', s.remaining);
    return res.json({ signals: cachedSignals, scanAge: Date.now() - lastScanAt, agentId: process.env.SIGNAL_AGENT_ERC8004_ID || 'unregistered' });
  }

  if (paymentTx) {
    const payer = await verifyPayment(paymentTx);
    if (!payer) return res.status(402).json({ error:'Payment verification failed', 'x-payment-required': priceInfo() });
    const id = crypto.randomUUID();
    sessions.set(id, { remaining:1000, expiresAt: Date.now()+86400000, paidBy:payer });
    sessionsIssued++;
    console.log(`Session issued: ${id.slice(0,8)}... for ${payer.slice(0,10)}...`);
    res.setHeader('X-Session-Id', id);
    return res.json({ signals: cachedSignals, sessionId: id, remaining: 1000, scanAge: Date.now() - lastScanAt });
  }

  return res.status(402).json({ error:'Payment required — 1 xUSDC for 1000 signals (24h)', 'x-payment-required': priceInfo() });
});

app.get('/v1/status', (_req, res) => {
  for (const [id, s] of sessions) if (Date.now() > s.expiresAt || s.remaining <= 0) sessions.delete(id);
  res.json({ online:true, activeSessions:sessions.size, sessionsIssued, signalsAvailable:cachedSignals.length, lastScanAt, scanCount, totalPaidUsdc: formatUnits(totalPaid, 6), agentAddress: AGENT_ADDRESS, agentId: process.env.SIGNAL_AGENT_ERC8004_ID || 'unregistered' });
});

if (!AGENT_ADDRESS) { console.error('ERROR: SIGNAL_AGENT_ADDRESS not set'); process.exit(1); }

scanPositions();
setInterval(scanPositions, 5000);
setInterval(() => { for (const [id, s] of sessions) if (Date.now() > s.expiresAt || s.remaining <= 0) sessions.delete(id); }, 3600000);

app.listen(PORT, () => {
  console.log(`\n📡 AgentLoan Signal Agent (JS)`);
  console.log(`   Port: ${PORT} | Payments: ${AGENT_ADDRESS} | ERC-8004: ${process.env.SIGNAL_AGENT_ERC8004_ID || 'unregistered'}\n`);
});
