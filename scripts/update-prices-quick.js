
const { createWalletClient, createPublicClient, http, parseAbi } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config({ path: '.env.local' });

const chain = { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } } };
const ORACLE = '0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999';
const HERMES = 'https://hermes.pyth.network';
const IDS = ['0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43','0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b','0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'];
const ABI = parseAbi(['function getUpdateFee(bytes[] calldata) view returns (uint256)','function updatePrices(bytes[] calldata) external payable','function getPrice(address) view returns (uint256)']);
const TOKENS = { xUSDC: '0xFa090bd1A524D861542888B6c5e7965dde1F4f35', xEURC: '0x11aC6A7f4c3235e4edda971838640bE9e55aC222', xclrBTC: '0x938ae31cc6418acc6730cF1AFFE53E91c143B078' };

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  const wallet = createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http() });
  const pub = createPublicClient({ chain, transport: http() });

  const url = HERMES + '/v2/updates/price/latest?' + IDS.map(id => 'ids[]=' + id).join('&') + '&encoding=hex';
  const data = (await (await fetch(url)).json()).binary.data.map(d => '0x' + d);
  const fee = await pub.readContract({ address: ORACLE, abi: ABI, functionName: 'getUpdateFee', args: [data] });
  console.log('Fee:', fee.toString());
  const hash = await wallet.writeContract({ address: ORACLE, abi: ABI, functionName: 'updatePrices', args: [data], value: fee });
  await pub.waitForTransactionReceipt({ hash });
  console.log('Prices updated:', hash);

  for (const [sym, addr] of Object.entries(TOKENS)) {
    const price = await pub.readContract({ address: ORACLE, abi: ABI, functionName: 'getPrice', args: [addr] });
    console.log(sym + ': $' + (Number(price) / 1e18).toFixed(4));
  }
}
main().catch(console.error);
