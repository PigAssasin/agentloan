// Fund Signal Agent wallet with USDC for gas (native = 18 decimals on Arc)
const { createWalletClient, createPublicClient, http, parseUnits, formatUnits } = require('/root/viem-sdk/node_modules/viem');
const { privateKeyToAccount } = require('/root/viem-sdk/node_modules/viem/accounts');
const fs = require('fs');

const env = {};
fs.readFileSync('/root/arcbank/.env.local','utf8').trim().split('\n').forEach(l => {
  const i = l.indexOf('='); if (i > 0) env[l.slice(0,i).trim()] = l.slice(i+1).trim();
});

// Arc: native USDC gas token = 18 decimals (like ETH wei)
// ERC-20 xUSDC = 6 decimals
const chain = { id:5042002, name:'Arc Testnet', nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18}, rpcUrls:{default:{http:['https://rpc.testnet.arc.network']}} };
const pub    = createPublicClient({ chain, transport: http() });

async function main() {
  const SIGNAL_ADDR = env.SIGNAL_AGENT_ADDRESS;
  if (!SIGNAL_ADDR) throw new Error('SIGNAL_AGENT_ADDRESS not set');

  const bal = await pub.getBalance({ address: SIGNAL_ADDR });
  console.log('Signal Agent native balance:', formatUnits(bal, 18), 'USDC');

  // Need at least 0.1 native USDC for gas fees
  if (bal >= parseUnits('0.1', 18)) {
    console.log('Already funded, skipping');
    return;
  }

  // Send 1 native USDC from deployer
  const wallet = createWalletClient({ account: privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY), chain, transport: http() });
  const h = await wallet.sendTransaction({ to: SIGNAL_ADDR, value: parseUnits('1', 18) });
  await pub.waitForTransactionReceipt({ hash: h });
  const newBal = await pub.getBalance({ address: SIGNAL_ADDR });
  console.log('Funded! Balance:', formatUnits(newBal, 18), 'USDC native');
}
main().catch(console.error);
