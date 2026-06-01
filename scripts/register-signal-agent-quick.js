// Quick ERC-8004 registration for Signal Agent
const { createWalletClient, createPublicClient, http, parseAbi } = require('/root/viem-sdk/node_modules/viem');
const { privateKeyToAccount } = require('/root/viem-sdk/node_modules/viem/accounts');
const fs = require('fs');

const env = {};
fs.readFileSync('/root/arcbank/.env.local','utf8').trim().split('\n').forEach(l => {
  const i = l.indexOf('='); if (i > 0) env[l.slice(0,i).trim()] = l.slice(i+1).trim();
});

const chain = { id:5042002, name:'Arc Testnet', nativeCurrency:{name:'USDC',symbol:'USDC',decimals:6}, rpcUrls:{default:{http:['https://rpc.testnet.arc.network']}} };
const IDENTITY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const ABI = parseAbi(['function register(string metadataURI) external returns (uint256)']);

async function main() {
  const pk      = env.SIGNAL_AGENT_PRIVATE_KEY;
  if (!pk) throw new Error('SIGNAL_AGENT_PRIVATE_KEY not set');
  const wallet  = createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http() });
  const pub     = createPublicClient({ chain, transport: http() });

  console.log('Registering Signal Agent:', wallet.account.address);

  const hash = await wallet.writeContract({
    address:      IDENTITY,
    abi:          ABI,
    functionName: 'register',
    args:         ['https://arcbank.vercel.app/agents/signal-agent.json'],
  });
  console.log('TX:', hash);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  const log = receipt.logs.find(l => l.address.toLowerCase() === IDENTITY.toLowerCase() && l.topics.length === 4);
  const agentId = log?.topics[3] ? BigInt(log.topics[3]).toString() : 'unknown';

  console.log('Signal Agent ERC-8004 ID:', agentId);
  console.log('\nAdd to .env.local and signal-agent env:');
  console.log('SIGNAL_AGENT_ERC8004_ID=' + agentId);
}
main().catch(e => console.error('Error:', e.message?.slice(0, 100)));
