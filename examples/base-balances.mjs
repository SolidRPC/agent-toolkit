import { rpcClient, integer, checkChain, decimal } from './rpc-client.mjs';
const address = process.env.WALLET_ADDRESS;
if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) throw Error('Set WALLET_ADDRESS to the public address to monitor');
const samples = integer('SAMPLES', 1, 1, 100);
const interval = integer('INTERVAL_SECONDS', 15, 1, 3600);
const rpc = rpcClient();
await checkChain(rpc, 8453);
for (let i = 0; i < samples; i++) {
  const block = await rpc(8453, 'eth_blockNumber');
  const wei = await rpc(8453, 'eth_getBalance', [address, block]);
  const units = await rpc(8453, 'eth_call', [{ to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}` }, block]);
  console.log(JSON.stringify({ chainId: 8453, block: BigInt(block).toString(), address, eth: decimal(wei, 18), usdc: decimal(units, 6) }));
  if (i + 1 < samples) await new Promise(resolve => setTimeout(resolve, interval * 1000));
}
