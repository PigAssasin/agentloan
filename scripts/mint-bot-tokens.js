const { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits } = require('/root/arcbank/node_modules/viem');
const { privateKeyToAccount } = require('/root/arcbank/node_modules/viem/accounts');
require('/root/arcbank/node_modules/dotenv').config({ path: '/root/arcbank/.env.local' });

const chain = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } }
};

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address owner) view returns (uint256)'
]);

const TOKENS = [
  { sym: 'xUSDC',   addr: '0xFa090bd1A524D861542888B6c5e7965dde1F4f35', amount: parseUnits('10000', 6), dec: 6 },
  { sym: 'xEURC',   addr: '0x11aC6A7f4c3235e4edda971838640bE9e55aC222', amount: parseUnits('10000', 6), dec: 6 },
  { sym: 'xclrBTC', addr: '0x938ae31cc6418acc6730cF1AFFE53E91c143B078', amount: parseUnits('1', 8),     dec: 8 },
];

async function main() {
  const pk = process.env.BOT_PRIVATE_KEY;
  if (!pk) throw new Error('BOT_PRIVATE_KEY not set');
  const account = privateKeyToAccount(pk);
  const wallet  = createWalletClient({ account, chain, transport: http('https://rpc.testnet.arc.network') });
  const pub     = createPublicClient({ chain, transport: http('https://rpc.testnet.arc.network') });

  console.log('Bot wallet:', account.address);

  for (const t of TOKENS) {
    try {
      const hash = await wallet.writeContract({
        address:      t.addr,
        abi:          ERC20_ABI,
        functionName: 'mint',
        args:         [account.address, t.amount],
      });
      await pub.waitForTransactionReceipt({ hash });
      const bal = await pub.readContract({ address: t.addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
      console.log(t.sym + ' minted OK → balance: ' + formatUnits(bal, t.dec));
    } catch(e) {
      console.log(t.sym + ' failed: ' + (e.message || e).toString().slice(0, 80));
    }
  }
}

main().catch(console.error);
