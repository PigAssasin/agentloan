const { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const fs = require('fs');

const env = {};
fs.readFileSync('/root/arcbank/.env.local','utf8').trim().split('\n').forEach(l => {
  const i = l.indexOf('='); if (i > 0) env[l.slice(0,i).trim()] = l.slice(i+1).trim();
});

const chain = { id:5042002, name:'Arc Testnet', nativeCurrency:{name:'USDC',symbol:'USDC',decimals:6}, rpcUrls:{default:{http:['https://rpc.testnet.arc.network']}} };
const ERC20  = parseAbi(['function mint(address to, uint256 amount) external','function balanceOf(address owner) view returns (uint256)']);

const CIRCLE_ADDR = env.CIRCLE_BOT_ADDRESS || '0x69efc5abdc9f9f1e90f59261c0fdf601e53291af';
const TOKENS = [
  { sym:'xUSDC',   addr:'0xFa090bd1A524D861542888B6c5e7965dde1F4f35', amt:parseUnits('10000',6), dec:6 },
  { sym:'xEURC',   addr:'0x11aC6A7f4c3235e4edda971838640bE9e55aC222', amt:parseUnits('10000',6), dec:6 },
  { sym:'xclrBTC', addr:'0x938ae31cc6418acc6730cF1AFFE53E91c143B078', amt:parseUnits('1',8),     dec:8 },
];

async function main() {
  const wallet = createWalletClient({ account: privateKeyToAccount(env.BOT_PRIVATE_KEY), chain, transport: http() });
  const pub    = createPublicClient({ chain, transport: http() });
  console.log('Funding Circle wallet:', CIRCLE_ADDR);
  for (const t of TOKENS) {
    try {
      const h = await wallet.writeContract({ address: t.addr, abi: ERC20, functionName: 'mint', args: [CIRCLE_ADDR, t.amt] });
      await pub.waitForTransactionReceipt({ hash: h });
      const b = await pub.readContract({ address: t.addr, abi: ERC20, functionName: 'balanceOf', args: [CIRCLE_ADDR] });
      console.log(t.sym + ' minted OK, balance: ' + formatUnits(b, t.dec));
    } catch(e) { console.log(t.sym + ' failed: ' + (e.message||'').slice(0,80)); }
  }
}
main().catch(console.error);
