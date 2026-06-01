/**
 * Seed ArcBank pool with liquidity using deployer wallet.
 * Run: node scripts/seed-pool.js
 */
const { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config({ path: '.env.local' });

const chain = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } }
};

const POOL    = '0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec';
const X_USDC  = '0xFa090bd1A524D861542888B6c5e7965dde1F4f35';
const X_EURC  = '0x11aC6A7f4c3235e4edda971838640bE9e55aC222';
const X_BTC   = '0x938ae31cc6418acc6730cF1AFFE53E91c143B078';

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) external returns (bool)',
  'function ownerMint(address,uint256) external',
]);
const POOL_ABI = parseAbi([
  'function deposit(address token, uint256 amount) external',
  'function getReserveData(address token) view returns (uint128,uint128,uint128,uint128,uint40,uint8,bool,uint16,uint16,uint16,uint256,uint256,uint256)',
]);

const SEEDS = [
  { addr: X_USDC,  sym: 'xUSDC',   dec: 6, amount: parseUnits('500000', 6)  },
  { addr: X_EURC,  sym: 'xEURC',   dec: 6, amount: parseUnits('200000', 6)  },
  { addr: X_BTC,   sym: 'xclrBTC', dec: 8, amount: parseUnits('10',     8)  },
];

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY not set');
  const account = privateKeyToAccount(pk);
  const wallet  = createWalletClient({ account, chain, transport: http() });
  const pub     = createPublicClient({ chain, transport: http() });

  console.log('Deployer:', account.address);

  for (const t of SEEDS) {
    // Check current pool supply
    const reserve = await pub.readContract({ address: POOL, abi: POOL_ABI, functionName: 'getReserveData', args: [t.addr] });
    const totalScaledSupply = reserve[10];
    if (totalScaledSupply > 0n) {
      console.log(`${t.sym}: already has supply (scaled=${totalScaledSupply}) — skipping`);
      continue;
    }

    console.log(`\nSeeding ${t.sym} — ${formatUnits(t.amount, t.dec)} tokens`);

    // Mint if needed
    const bal = await pub.readContract({ address: t.addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
    if (bal < t.amount) {
      console.log(`  Minting ${t.sym}...`);
      const h = await wallet.writeContract({ address: t.addr, abi: ERC20_ABI, functionName: 'ownerMint', args: [account.address, t.amount] });
      await pub.waitForTransactionReceipt({ hash: h });
    }

    // Approve
    const allowance = await pub.readContract({ address: t.addr, abi: ERC20_ABI, functionName: 'allowance', args: [account.address, POOL] });
    if (allowance < t.amount) {
      console.log(`  Approving...`);
      const h = await wallet.writeContract({ address: t.addr, abi: ERC20_ABI, functionName: 'approve', args: [POOL, t.amount] });
      await pub.waitForTransactionReceipt({ hash: h });
    }

    // Deposit
    console.log(`  Depositing...`);
    const h = await wallet.writeContract({ address: POOL, abi: POOL_ABI, functionName: 'deposit', args: [t.addr, t.amount] });
    await pub.waitForTransactionReceipt({ hash: h });
    console.log(`  ✅ ${t.sym} seeded`);
  }

  console.log('\n✅ Pool seeding complete');
}

main().catch(console.error);
